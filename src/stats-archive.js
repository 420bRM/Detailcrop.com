/**
 * The permanent stats copy, from the owner's side. Both need ?k=<STATS_KEY>
 * and 404 without it, like /stats.
 *
 *   GET /stats/export?k=…[&from=YYYY-MM-DD][&to=YYYY-MM-DD][&t=presets]
 *       Downloads the archive as CSV — every event, or with t=presets the
 *       settings left behind by deleted accounts. Run it now and then and
 *       keep the file somewhere that is not Cloudflare.
 *
 *   GET /stats/backfill?k=…
 *       Once: copies what Analytics Engine still holds (about three months)
 *       into the archive, for the time before the archive existed. Needs
 *       CF_API_TOKEN, the same token /stats uses. A second run is refused.
 */
import { archive, BLOBS, DOUBLES } from "./archive.js";

const DATASET = "detailcrop_events";
const DAY = 86400000;
const NAMES = ["time", "event", "lang", "country", "ref", "ratio", "fmt", "out", "id", "device", "feat", "text",
  "visit", "n", "iw", "ih", "mb", "crops", "ow", "oh", "q", "sample", "grid", "bad", "huge",
  "rot", "persp", "secs", "step"];

export async function archiveRoute(request, env, url) {
  if (!env.STATS_KEY || url.searchParams.get("k") !== env.STATS_KEY) return new Response("Not found", { status: 404 });
  if (!env.ARCHIVE) return text("The archive is not bound in wrangler.jsonc.", 503);
  if (url.pathname === "/stats/export") return exportCSV(env, url);
  if (url.pathname === "/stats/backfill") return backfill(env);
  if (url.pathname === "/stats/archive") return json(await archive(env, "info", {}));
  return new Response("Not found", { status: 404 });
}

const day = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? Date.parse(s + "T00:00:00Z") : NaN);
const csv = v => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function exportCSV(env, url) {
  const presets = url.searchParams.get("t") === "presets";
  const from = day(url.searchParams.get("from"));
  const to = day(url.searchParams.get("to"));
  const range = { from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to + DAY : 8.64e15 };
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter();
    try {
      await w.write(enc.encode("﻿" + (presets ? "time,settings\n" : NAMES.join(",") + "\n")));
      let after = 0;
      for (;;) {
        const r = await archive(env, "read", Object.assign({ table: presets ? "presets" : "events", after }, range));
        const rows = r.rows || [];
        if (!rows.length) break;
        let out = "";
        for (const row of rows) {
          const t = new Date(row.ts).toISOString();
          if (presets) out += csv(t) + "," + csv(row.json) + "\n";
          else {
            const cells = [t];
            for (let i = 1; i <= BLOBS; i++) cells.push(row["b" + i]);
            for (let i = 1; i <= DOUBLES; i++) cells.push(row["d" + i]);
            out += cells.map(csv).join(",") + "\n";
          }
          after = row.id;
        }
        await w.write(enc.encode(out));
      }
    } catch (e) {
      console.error("export", e);
    } finally {
      await w.close();
    }
  })();
  const name = `detailcrop-${presets ? "presets" : "events"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(readable, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

/* Day by day, so no single query runs into a row limit. */
async function backfill(env) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return text("CF_API_TOKEN is not set.", 503);
  const before = await archive(env, "info", {});
  if (before.backfilled) return json({ already: true, archive: before });
  const blobs = Array.from({ length: BLOBS }, (_, i) => "blob" + (i + 1));
  const doubles = Array.from({ length: DOUBLES }, (_, i) => "double" + (i + 1));
  const today = Math.floor(Date.now() / DAY) * DAY;
  let added = 0, read = 0;
  const failed = [];
  for (let t = today - 95 * DAY; t <= today; t += DAY) {
    const a = new Date(t).toISOString().slice(0, 19).replace("T", " ");
    const b = new Date(t + DAY).toISOString().slice(0, 19).replace("T", " ");
    const sql = `SELECT timestamp, ${blobs.join(", ")}, ${doubles.join(", ")} FROM ${DATASET}
      WHERE timestamp >= toDateTime('${a}') AND timestamp < toDateTime('${b}')
      ORDER BY timestamp LIMIT 100000`;
    const q = await runSQL(env, sql);
    if (q.error){ failed.push(a.slice(0, 10) + ": " + q.error.slice(0, 120)); continue; }
    read += q.rows.length;
    const rows = q.rows.map(r => ({
      ts: Date.parse(String(r.timestamp).replace(" ", "T") + (/[zZ+]/.test(String(r.timestamp).slice(10)) ? "" : "Z")),
      blobs: blobs.map(k => r[k]), doubles: doubles.map(k => Number(r[k]) || 0)
    })).filter(r => Number.isFinite(r.ts));
    if (rows.length) added += (await archive(env, "backfill", { rows })).added || 0;
  }
  // only a clean run closes the door; a partial one can be run again
  if (!failed.length) await archive(env, "backfill", { rows: [], done: true });
  return json({ read, added, failed, archive: await archive(env, "info", {}) });
}

async function runSQL(env, sql) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      { method: "POST", headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: sql });
    const t = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${t}`, rows: [] };
    return { rows: JSON.parse(t).data || [] };
  } catch (e) {
    return { error: String(e && e.message || e), rows: [] };
  }
}

function json(d) {
  return new Response(JSON.stringify(d, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function text(s, status) {
  return new Response(s, { status: status || 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
