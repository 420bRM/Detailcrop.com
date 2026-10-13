// Sign-in and presets, end to end through the Worker routes, with nothing
// but Node: `node --test test/`. Google is played by a key made here — the
// test signs its own ID tokens and answers Google's key URL with that key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountRoute } from "../src/account-api.js";
import { Accounts } from "../src/accounts.js";
import { cleanPreset, cleanPresetBook, PRESET_MAX } from "../src/preset.js";
import { _resetGoogleForTests } from "../src/google.js";

const CLIENT = "test-client.apps.googleusercontent.com";
const ORIGIN = "https://detailcrop.com";

/* ---- a stand-in for Google ---- */
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"]);
const jwk = Object.assign(await crypto.subtle.exportKey("jwk", publicKey), { kid: "k1" });
const b64u = s => Buffer.from(s).toString("base64url");
async function idToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", kid: "k1" }));
  const body = b64u(JSON.stringify(Object.assign({ iss: "https://accounts.google.com", aud: CLIENT,
    sub: "1001", email: "Seller@Example.com", email_verified: true, iat: now, exp: now + 600 }, claims)));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + Buffer.from(sig).toString("base64url");
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://www.googleapis.com/oauth2/v3/certs"))
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "max-age=60" } });
  return realFetch(url, init);
};

/* ---- a Worker env with an in-memory Durable Object ---- */
function makeEnv(clientId) {
  const map = new Map();
  const storage = {
    get: async k => (map.has(k) ? structuredClone(map.get(k)) : undefined),
    put: async (k, v) => { map.set(k, structuredClone(v)); },
    delete: async k => map.delete(k)
  };
  const obj = new Accounts({ storage });
  return {
    map,
    GOOGLE_CLIENT_ID: clientId === undefined ? CLIENT : clientId,
    ACCOUNTS: { idFromName: () => "all", get: () => ({ fetch: (u, init) => obj.fetch(new Request(u, init)) }) }
  };
}
async function call(env, method, path, body, session, origin) {
  const headers = { origin: origin || ORIGIN };
  if (session) headers.Authorization = "Bearer " + session;
  const req = new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await accountRoute(req, env, new URL(req.url));
  return { status: res.status, body: await res.json() };
}
const preset = (o) => Object.assign({
  id: "abc123def", name: "Weekly", ratio: { id: "4:5", scope: "all" },
  out: { mode: "fixed", w: 1080, h: 1350 }, fmt: "image/jpeg", quality: 90, pattern: "{name}-{nn}",
  layout: { grid: null, boxes: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.25 }] }
}, o);

test("sign-in is off until a client id is set", async () => {
  const env = makeEnv("");
  assert.deepEqual((await call(env, "GET", "/api/config")).body, { login: null });
  assert.equal((await call(env, "POST", "/api/auth/google", { credential: "x" })).status, 503);
});

test("sign in, save, list, last, rename, delete, sign out", async () => {
  _resetGoogleForTests();
  const env = makeEnv();
  assert.deepEqual((await call(env, "GET", "/api/config")).body, { login: { google: CLIENT } });

  const li = await call(env, "POST", "/api/auth/google", { credential: await idToken({}) });
  assert.equal(li.status, 200);
  assert.equal(li.body.user.email, "seller@example.com");
  assert.equal(li.body.isNew, true);
  const s = li.body.session;
  assert.ok(![...env.map.keys()].some(k => k.includes(s)), "only the hash of the session is stored");

  let r = await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset() } }, s);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.presets.list.length, 1);
  assert.equal(r.body.user.presets.last, "abc123def");

  r = await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset({ id: "zzz999yyy", name: "Shop" }) } }, s);
  assert.deepEqual(r.body.user.presets.list.map(p => p.name), ["Shop", "Weekly"]);
  r = await call(env, "POST", "/api/me/presets", { change: { kind: "last", id: "abc123def" } }, s);
  assert.equal(r.body.user.presets.last, "abc123def");
  r = await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset({ name: "Weekly 2" }) } }, s);
  assert.deepEqual(r.body.user.presets.list.map(p => p.name), ["Shop", "Weekly 2"]);
  r = await call(env, "POST", "/api/me/presets", { change: { kind: "del", id: "abc123def" } }, s);
  assert.deepEqual(r.body.user.presets.list.map(p => p.name), ["Shop"]);
  assert.equal(r.body.user.presets.last, "");

  // a second browser sees the same presets
  const li2 = await call(env, "POST", "/api/auth/google", { credential: await idToken({}) });
  assert.equal(li2.body.isNew, false);
  r = await call(env, "GET", "/api/me", undefined, li2.body.session);
  assert.deepEqual(r.body.user.presets.list.map(p => p.name), ["Shop"]);

  await call(env, "POST", "/api/auth/logout", {}, s);
  assert.equal((await call(env, "GET", "/api/me", undefined, s)).status, 401);
  assert.equal((await call(env, "GET", "/api/me", undefined, li2.body.session)).status, 200);
});

test("tokens that are not ours are refused", async () => {
  _resetGoogleForTests();
  const env = makeEnv();
  for (const claims of [{ aud: "someone-else" }, { email_verified: false }, { exp: 1 }, { iss: "evil" }]) {
    const r = await call(env, "POST", "/api/auth/google", { credential: await idToken(claims) });
    assert.equal(r.status, 401, JSON.stringify(claims));
  }
  const tok = await idToken({});
  const forged = tok.slice(0, tok.lastIndexOf(".") + 1) + "AAAA";
  assert.equal((await call(env, "POST", "/api/auth/google", { credential: forged })).status, 401);
});

test("another site cannot post, and big bodies are refused", async () => {
  _resetGoogleForTests();
  const env = makeEnv();
  const s = (await call(env, "POST", "/api/auth/google", { credential: await idToken({}) })).body.session;
  assert.equal((await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset() } }, s, "https://evil.example")).status, 403);
  const big = { change: { kind: "put", preset: preset({ name: "x".repeat(70000) }) } };
  assert.equal((await call(env, "POST", "/api/me/presets", big, s)).status, 413);
  assert.equal((await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: { id: "bad" } } }, s)).status, 400);
});

test("an account holds at most PRESET_MAX", async () => {
  _resetGoogleForTests();
  const env = makeEnv();
  const s = (await call(env, "POST", "/api/auth/google", { credential: await idToken({}) })).body.session;
  for (let i = 0; i < PRESET_MAX; i++) {
    const r = await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset({ id: "p" + String(i).padStart(6, "0"), name: "n" + i }) } }, s);
    assert.equal(r.status, 200);
  }
  const r = await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset({ id: "pextra000", name: "one more" }) } }, s);
  assert.equal(r.status, 409);
});

test("deleting the account erases it and its sessions", async () => {
  _resetGoogleForTests();
  const env = makeEnv();
  const s = (await call(env, "POST", "/api/auth/google", { credential: await idToken({}) })).body.session;
  await call(env, "POST", "/api/me/presets", { change: { kind: "put", preset: preset() } }, s);
  assert.equal((await call(env, "POST", "/api/me/delete", {}, s)).status, 400);
  assert.equal((await call(env, "POST", "/api/me/delete", { confirm: true }, s)).status, 200);
  assert.deepEqual([...env.map.keys()].filter(k => k !== "meta"), []);
  assert.equal((await call(env, "GET", "/api/me", undefined, s)).status, 401);
});

test("cleanPreset keeps settings only, and keeps them in range", () => {
  const p = cleanPreset(preset({
    image: "data:image/png;base64,AAAA", file: "secret.jpg", rot: 12,
    quality: 500, out: { mode: "fixed", w: 99999, h: -4 },
    layout: { boxes: [{ x: 0.9, y: 0.9, w: 0.5, h: 0.5, r: { id: "16:9" } }, null, "x"] }
  }));
  assert.deepEqual(Object.keys(p).sort(), ["at", "fmt", "id", "layout", "name", "out", "pattern", "quality", "ratio", "v"]);
  assert.equal(p.quality, 100);
  assert.deepEqual(p.out, { mode: "fixed", w: 16384, h: 1 });
  assert.equal(p.layout.boxes.length, 1);
  assert.deepEqual(p.layout.boxes[0], { x: 0.5, y: 0.5, w: 0.5, h: 0.5, r: null }, "box ratios only under the selected-crop scope");
  // free ratio: no fixed output and no feed grid
  const f = cleanPreset(preset({ ratio: { id: "free" }, layout: { grid: { rows: 2, x: 0, y: 0, w: 1 } } }));
  assert.equal(f.out.mode, "native");
  assert.equal(f.layout.grid, null);
  assert.equal(cleanPreset(preset({ name: "  " })), null);
  assert.equal(cleanPresetBook({ list: [preset(), preset()], last: "nope" }).list.length, 1);
});
