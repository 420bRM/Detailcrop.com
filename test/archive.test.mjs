// The permanent stats copy: /e writes into it, the owner exports it as CSV,
// a deleted account leaves its settings behind and nothing else.
// Node's built-in SQLite plays the Durable Object's storage.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import { Archive } from "../src/archive.js";
import { Accounts } from "../src/accounts.js";
import { accountRoute } from "../src/account-api.js";

function fakeSql() {
  const db = new DatabaseSync(":memory:");
  return { exec(q, ...p) { const st = db.prepare(q); return /^\s*select/i.test(q) ? { toArray: () => st.all(...p) } : (st.run(...p), { toArray: () => [] }); } };
}
function stub(obj) { return { idFromName: () => "all", get: () => ({ fetch: (u, i) => obj.fetch(new Request(u, i)) }) }; }
function makeEnv() {
  const map = new Map();
  const storage = { get: async k => structuredClone(map.get(k)), put: async (k, v) => { map.set(k, structuredClone(v)); }, delete: async k => map.delete(k) };
  const points = [];
  return {
    STATS_KEY: "k".repeat(20),
    EVENTS: { writeDataPoint: p => points.push(p) },
    ARCHIVE: stub(new Archive({ storage: { sql: fakeSql() } })),
    ACCOUNTS: stub(new Accounts({ storage })),
    points
  };
}
function ctx() { const w = []; return { waitUntil: p => w.push(p), done: () => Promise.all(w) }; }
const beacon = (body) => new Request("https://detailcrop.com/e", { method: "POST",
  headers: { origin: "https://detailcrop.com", "user-agent": "Mozilla/5.0 Chrome" }, body: JSON.stringify(body) });

test("every /e event lands in Analytics Engine and in our archive", async () => {
  const env = makeEnv();
  for (const e of [{ e: "visit", id: "abc", lang: "ko" }, { e: "export", id: "abc", ratio: "4:5", crops: 6, n: 2 }]) {
    const c = ctx();
    assert.equal((await worker.fetch(beacon(e), env, c)).status, 204);
    await c.done();
  }
  assert.equal(env.points.length, 2);
  const res = await worker.fetch(new Request("https://detailcrop.com/stats/export?k=" + env.STATS_KEY), env, ctx());
  assert.equal(res.status, 200);
  const lines = (await res.text()).replace(/^﻿/, "").trim().split("\n");
  assert.equal(lines[0].split(",")[1], "event");
  assert.equal(lines.length, 3);
  assert.ok(lines[2].includes(",export,ko") === false && lines[2].includes(",export,"), "export row present");
  assert.ok(lines[2].includes(",4:5,"));
});

test("the owner's pages hide without the key", async () => {
  const env = makeEnv();
  for (const p of ["/stats/export", "/stats/export?k=wrong", "/stats/backfill", "/stats/archive?k=nope"]) {
    assert.equal((await worker.fetch(new Request("https://detailcrop.com" + p), env, ctx())).status, 404, p);
  }
  const info = await (await worker.fetch(new Request("https://detailcrop.com/stats/archive?k=" + env.STATS_KEY), env, ctx())).json();
  assert.equal(info.events, 0);
});

test("backfill only adds rows older than the first live one, once", async () => {
  const a = new Archive({ storage: { sql: fakeSql() } });
  const call = async (op, args) => (await a.fetch(new Request("https://a/", { method: "POST", body: JSON.stringify(Object.assign({ op }, args)) }))).json();
  await call("event", { ts: 1000, blobs: ["visit"], doubles: [] });
  const r = await call("backfill", { rows: [{ ts: 500, blobs: ["old"], doubles: [] }, { ts: 1000, blobs: ["dup"], doubles: [] }], done: true });
  assert.equal(r.added, 1);
  assert.equal((await call("backfill", { rows: [{ ts: 1, blobs: [] }] })).error, "already");
  assert.equal((await call("info", {})).events, 2);
});

test("a deleted account leaves its settings, never its email, name or pattern", async () => {
  const env = makeEnv();
  env.GOOGLE_CLIENT_ID = "x";
  const acc = env.ACCOUNTS.get();
  const op = async (o, args) => (await acc.fetch("https://a/", { method: "POST", body: JSON.stringify(Object.assign({ op: o }, args)) })).json();
  await op("login", { sub: "9", email: "kim@example.com", now: 1 });
  const token = "t".repeat(40);
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sess:" + token)));
  const hash = Buffer.from(d).toString("base64url");
  await op("sessionCreate", { sub: "9", hash, exp: Date.now() + 1e6 });
  await op("presets", { sub: "9", change: { kind: "put", preset: { id: "aaaaaa1", name: "김철수 상품컷", ratio: { id: "4:5" },
    pattern: "kimcheolsu-{nn}", layout: { boxes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] } } } });
  const req = new Request("https://detailcrop.com/api/me/delete", { method: "POST",
    headers: { origin: "https://detailcrop.com", Authorization: "Bearer " + token }, body: JSON.stringify({ confirm: true }) });
  assert.equal((await accountRoute(req, env, new URL(req.url))).status, 200);
  const res = await worker.fetch(new Request("https://detailcrop.com/stats/export?t=presets&k=" + env.STATS_KEY), env, ctx());
  const body = await res.text();
  assert.ok(body.includes("4:5") && body.includes("customPattern"));
  for (const gone of ["kim@example.com", "김철수", "kimcheolsu", "aaaaaa1"]) assert.ok(!body.includes(gone), gone);
});
