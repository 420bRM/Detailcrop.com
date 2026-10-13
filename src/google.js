/**
 * "Sign in with Google", checked on the server.
 *
 * The browser gets an ID token (an RS256-signed JWT) from Google's sign-in
 * button and hands it over. This checks Google's signature with Google's
 * published keys, that the token was issued for this site (GOOGLE_CLIENT_ID),
 * that it has not expired, and that the email is verified. No secret is
 * involved — a client ID is a public value. Same check lottodraw.kr runs.
 */

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const SKEW = 60;   // seconds of clock drift allowed

let certs = null;  // { keys: { kid: CryptoKey }, until }

export function _resetGoogleForTests() { certs = null; }

export function b64urlDecode(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadCerts(force) {
  if (!force && certs && certs.until > Date.now()) return certs.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("google certs " + res.status);
  const body = await res.json();
  const keys = {};
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    keys[jwk.kid] = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  }
  const age = Number(((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/) || [])[1]) || 3600;
  certs = { keys, until: Date.now() + Math.min(age, 6 * 3600) * 1000 };
  return keys;
}

const decodeJson = part => JSON.parse(new TextDecoder().decode(b64urlDecode(part)));

/* { sub, email } when the token is good, otherwise null */
export async function verifyGoogleToken(token, clientId, nowSec) {
  if (typeof token !== "string" || token.length > 4096 || !clientId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload, sig;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
    sig = b64urlDecode(parts[2]);
  } catch (e) { return null; }
  if (header.alg !== "RS256" || !header.kid) return null;

  let keys = await loadCerts(false);
  if (!keys[header.kid]) keys = await loadCerts(true);   // Google just rotated its keys
  const key = keys[header.kid];
  if (!key) return null;
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig,
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;

  const now = nowSec || Math.floor(Date.now() / 1000);
  if (ISSUERS.indexOf(payload.iss) === -1) return null;
  if (payload.aud !== clientId) return null;
  if (!(payload.exp > now - SKEW) || (payload.iat && payload.iat > now + SKEW)) return null;
  if (!payload.sub || !payload.email ||
      !(payload.email_verified === true || payload.email_verified === "true")) return null;
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase().slice(0, 200) };
}
