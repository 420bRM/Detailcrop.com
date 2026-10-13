/**
 * Accounts — members, sign-in sessions and their presets, in one Durable
 * Object. Members exist for one thing so far: presets that follow a person
 * from browser to browser.
 *
 * What is stored (the privacy note in the sign-in box says the same):
 *   u:<google account id>  { sub, email, createdAt, lastAt, sess: [hash…], presets: {list, last} }
 *   s:<session hash>       { sub, exp }   — 30 days; the browser holds the token, we hold its hash
 *   meta                   { users }
 *
 * No name, no photo — Google hands over the email address and that is all we
 * ask for. No image, no file name either: a preset is settings only, cleaned
 * by src/preset.js before it is written. Deleting the account deletes all of it.
 *
 * Called from src/index.js with one JSON op per request, so the whole thing
 * runs in Node tests against a plain Map (see test/accounts.test.mjs).
 */
import { cleanPreset, cleanPresetBook, PRESET_MAX } from "./preset.js";

export const SESSION_DAYS = 30;
const MAX_SESSIONS = 5;

/* what the browser gets back about its own account */
function pub(user) {
  return { email: user.email, createdAt: user.createdAt,
           presets: user.presets || { list: [], last: "" } };
}

export class Accounts {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return reply({ error: "bad_json" }, 400); }
    const op = OPS[body && body.op];
    if (!op) return reply({ error: "bad_op" }, 400);
    try {
      return reply(await op.call(this, body));
    } catch (err) {
      console.error("accounts", body.op, err);
      return reply({ error: "server" }, 500);
    }
  }
}

export const OPS = {
  /* after Google vouched for someone: make the account the first time */
  async login({ sub, email, now }) {
    let user = await this.storage.get("u:" + sub);
    const isNew = !user;
    if (!user) {
      user = { sub, email, createdAt: now, lastAt: now, sess: [], presets: { list: [], last: "" } };
      const m = (await this.storage.get("meta")) || { users: 0 };
      m.users = (m.users || 0) + 1;
      await this.storage.put("meta", m);
    }
    user.email = email;
    user.lastAt = now;
    await this.storage.put("u:" + sub, user);
    return { user: pub(user), isNew };
  },

  async sessionCreate({ sub, hash, exp }) {
    const user = await this.storage.get("u:" + sub);
    if (!user) return { error: "no_user" };
    user.sess = (user.sess || []).concat(hash);
    while (user.sess.length > MAX_SESSIONS) await this.storage.delete("s:" + user.sess.shift());
    await this.storage.put("s:" + hash, { sub, exp });
    await this.storage.put("u:" + sub, user);
    return { ok: true };
  },

  async sessionGet({ hash, now }) {
    const s = await this.storage.get("s:" + hash);
    if (!s) return {};
    if (!(s.exp > now)) { await this.storage.delete("s:" + hash); return {}; }
    const user = await this.storage.get("u:" + s.sub);
    if (!user) { await this.storage.delete("s:" + hash); return {}; }
    return { sub: s.sub, user: pub(user) };
  },

  async sessionDelete({ hash }) {
    const s = await this.storage.get("s:" + hash);
    if (!s) return { ok: true };
    await this.storage.delete("s:" + hash);
    const user = await this.storage.get("u:" + s.sub);
    if (user) {
      user.sess = (user.sess || []).filter(h => h !== hash);
      await this.storage.put("u:" + s.sub, user);
    }
    return { ok: true };
  },

  /* One change at a time rather than the whole list, so two browsers signed
     in to the same account do not overwrite each other's presets.
       put  — add a preset, or replace the one with the same id
       del  — remove one
       last — mark one as used last */
  async presets({ sub, change }) {
    const user = await this.storage.get("u:" + sub);
    if (!user) return { error: "no_user" };
    const book = cleanPresetBook(user.presets);
    const c = change || {};
    if (c.kind === "put") {
      const p = cleanPreset(c.preset);
      if (!p) return { error: "bad_preset" };
      const i = book.list.findIndex(x => x.id === p.id);
      if (i >= 0) book.list[i] = p;
      else {
        if (book.list.length >= PRESET_MAX) return { error: "full" };
        book.list.unshift(p);
      }
      book.last = p.id;
    } else if (c.kind === "del") {
      book.list = book.list.filter(x => x.id !== c.id);
      if (book.last === c.id) book.last = "";
    } else if (c.kind === "last") {
      if (book.list.some(x => x.id === c.id)) book.last = c.id;
    } else return { error: "bad_change" };
    user.presets = book;
    await this.storage.put("u:" + sub, user);
    return { user: pub(user) };
  },

  async userDelete({ sub }) {
    const user = await this.storage.get("u:" + sub);
    if (!user) return { ok: true };
    for (const h of user.sess || []) await this.storage.delete("s:" + h);
    await this.storage.delete("u:" + sub);
    const m = (await this.storage.get("meta")) || { users: 0 };
    m.users = Math.max(0, (m.users || 0) - 1);
    await this.storage.put("meta", m);
    return { ok: true };
  },

  async stats() {
    return (await this.storage.get("meta")) || { users: 0 };
  }
};

function reply(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200, headers: { "Content-Type": "application/json" }
  });
}
