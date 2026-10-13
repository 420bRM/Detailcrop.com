/**
 * /api/* — sign-in and the presets kept in an account.
 *
 *   GET  /api/config        { login: { google: <client id> } | null }
 *   POST /api/auth/google   { credential }  → { session, user }
 *   POST /api/auth/logout
 *   GET  /api/me            → { user }
 *   POST /api/me/presets    { change: {kind:"put", preset} | {kind:"del", id} | {kind:"last", id} } → { user }
 *   POST /api/me/delete     { confirm: true }
 *
 * Sign-in is off until GOOGLE_CLIENT_ID is set in wrangler.jsonc: /api/config
 * says so and the page hides the presets panel, exactly as it looked before.
 *
 * The same rule as /e holds: no image ever reaches this Worker. A preset is
 * settings only, and src/preset.js cleans it before it is stored. Bodies over
 * 64 KB are refused unread.
 *
 * Same origin as the pages, so no CORS. The session token travels as a Bearer
 * header, never a cookie, so another site cannot ride on it.
 */
import { verifyGoogleToken } from "./google.js";
import { SESSION_DAYS } from "./accounts.js";

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export async function accountRoute(request, env, url) {
  try {
    return await route(request, env, url);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.code }, err.status);
    console.error("api", err);
    return json({ error: "server" }, 500);
  }
}

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  const m = request.method;
  if (path === "/api/config" && m === "GET") {
    return json({ login: loginReady(env) ? { google: env.GOOGLE_CLIENT_ID } : null });
  }
  if (m === "POST") sameOrigin(request);
  if (path === "/api/auth/google" && m === "POST") return googleLogin(request, env);
  if (path === "/api/auth/logout" && m === "POST") return logout(request, env);
  if (path === "/api/me" && m === "GET") return json({ user: (await sessionUser(request, env)).user });
  if (path === "/api/me/presets" && m === "POST") return changePresets(request, env);
  if (path === "/api/me/delete" && m === "POST") return deleteMe(request, env);
  return json({ error: "not_found" }, 404);
}

function loginReady(env) { return !!(env.GOOGLE_CLIENT_ID && env.ACCOUNTS); }
function needLogin(env) { if (!loginReady(env)) throw new HttpError(503, "login_off"); }

/* sendBeacon and fetch both set Origin on a POST; a page elsewhere cannot pass this */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let host = "";
  try { host = new URL(origin).host; } catch (e) {}
  if (host !== new URL(request.url).host) throw new HttpError(403, "bad_origin");
}

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "too_big");
  try { return JSON.parse(raw) || {}; } catch (e) { throw new HttpError(400, "bad_json"); }
}

async function limited(binding, key) {
  if (!binding || typeof binding.limit !== "function") return;
  const { success } = await binding.limit({ key });
  if (!success) throw new HttpError(429, "too_many");
}

function accounts(env, op, args) {
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("all"));
  return stub.fetch("https://accounts/", {
    method: "POST",
    body: JSON.stringify(Object.assign({ op }, args || {}))
  }).then(r => r.json());
}

async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return b64url(d);
}
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bearer(request) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/);
  return m ? m[1] : null;
}

async function sessionUser(request, env) {
  needLogin(env);
  const token = bearer(request);
  if (!token) throw new HttpError(401, "need_login");
  const hash = await sha256("sess:" + token);
  const got = await accounts(env, "sessionGet", { hash, now: Date.now() });
  if (!got.user) throw new HttpError(401, "need_login");
  return { user: got.user, sub: got.sub, hash };
}

async function googleLogin(request, env) {
  needLogin(env);
  await limited(env.LOGIN_LIMIT, request.headers.get("CF-Connecting-IP") || "local");
  const body = await readJson(request);
  const g = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID);
  if (!g) throw new HttpError(401, "bad_credential");
  const now = Date.now();
  const r = await accounts(env, "login", { sub: g.sub, email: g.email, now });
  if (r.error) throw new HttpError(500, r.error);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await accounts(env, "sessionCreate", { sub: g.sub, hash: await sha256("sess:" + token),
                                         exp: now + SESSION_DAYS * 86400 * 1000 });
  return json({ session: token, user: r.user, isNew: r.isNew });
}

async function logout(request, env) {
  needLogin(env);
  const token = bearer(request);
  if (token) await accounts(env, "sessionDelete", { hash: await sha256("sess:" + token) });
  return json({ ok: true });
}

async function changePresets(request, env) {
  const s = await sessionUser(request, env);
  await limited(env.PRESET_LIMIT, s.hash);
  const body = await readJson(request);
  const r = await accounts(env, "presets", { sub: s.sub, change: body.change });
  if (r.error === "full") throw new HttpError(409, "full");
  if (r.error === "no_user") throw new HttpError(401, "need_login");
  if (r.error) throw new HttpError(400, r.error);
  return json({ user: r.user });
}

async function deleteMe(request, env) {
  const s = await sessionUser(request, env);
  const body = await readJson(request);
  if (body.confirm !== true) throw new HttpError(400, "need_confirm");
  await accounts(env, "userDelete", { sub: s.sub });
  return json({ ok: true });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
               "X-Content-Type-Options": "nosniff" }
  });
}
