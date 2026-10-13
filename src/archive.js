/**
 * Archive — our own permanent copy of the usage stats.
 *
 * Analytics Engine drops rows after about three months. That is Cloudflare's
 * limit, not ours: every row /e writes there is also written here, in a
 * Durable Object's SQLite, and kept with no end date. GET /stats/export
 * downloads it as CSV, so a copy can live outside Cloudflare too.
 *
 * Nothing here identifies a person: the stats are the anonymous rows the
 * README describes (blob8 is a random ID the browser makes for itself), and
 * the presets of members who deleted their account arrive with the name, the
 * file-name pattern and every account detail already taken off.
 *
 *   events        one row per /e event: ts, then blob1…blob10, double1…double17
 *   gone_presets  settings from deleted accounts: ts (month saved), json
 *   meta          live_since (first row written here), backfilled (0/1)
 */
export const BLOBS = 10, DOUBLES = 17;
const COLS = ["ts"].concat(
  Array.from({ length: BLOBS }, (_, i) => "b" + (i + 1)),
  Array.from({ length: DOUBLES }, (_, i) => "d" + (i + 1)));

export class Archive {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (${COLS.map(c => c === "ts" ? "ts INTEGER" : c[0] === "b" ? c + " TEXT" : c + " REAL").join(", ")})`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS events_ts ON events (ts)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS gone_presets (ts INTEGER, json TEXT)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
  }

  async fetch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return reply({ error: "bad_json" }, 400); }
    const op = OPS[body && body.op];
    if (!op) return reply({ error: "bad_op" }, 400);
    try { return reply(op.call(this, body)); }
    catch (err) { console.error("archive", body.op, err); return reply({ error: "server" }, 500); }
  }

  meta(k) {
    const r = this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
    return r ? r.v : null;
  }
  setMeta(k, v) { this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, String(v)); }
  insert(ts, blobs, doubles) {
    const vals = [ts].concat(
      Array.from({ length: BLOBS }, (_, i) => String(blobs[i] == null ? "" : blobs[i])),
      Array.from({ length: DOUBLES }, (_, i) => Number(doubles[i]) || 0));
    this.sql.exec(`INSERT INTO events (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, ...vals);
  }
}

export const OPS = {
  /* one live event, as /e wrote it to Analytics Engine */
  event({ ts, blobs, doubles }) {
    if (!this.meta("live_since")) this.setMeta("live_since", ts);
    this.insert(ts, blobs, doubles);
    return { ok: true };
  },

  /* Rows read back from Analytics Engine, once, for the time before this
     archive existed. Only rows older than the first live row go in, so
     nothing is counted twice; a second run is refused. */
  backfill({ rows, done }) {
    if (this.meta("backfilled") === "1") return { error: "already" };
    const since = Number(this.meta("live_since")) || Infinity;
    let n = 0;
    for (const r of rows || []) {
      if (!(r.ts < since)) continue;
      this.insert(r.ts, r.blobs || [], r.doubles || []);
      n++;
    }
    if (done) this.setMeta("backfilled", 1);
    return { added: n };
  },

  gonePresets({ ts, presets }) {
    for (const p of presets || []) this.sql.exec("INSERT INTO gone_presets (ts, json) VALUES (?, ?)", ts, JSON.stringify(p));
    return { ok: true };
  },

  /* rows from..to (ms), oldest first, at most `limit` per call */
  read({ table, from, to, after, limit }) {
    const lim = Math.min(Number(limit) || 5000, 5000);
    if (table === "presets") {
      return { rows: this.sql.exec("SELECT rowid AS id, ts, json FROM gone_presets WHERE rowid > ? ORDER BY rowid LIMIT ?",
        Number(after) || 0, lim).toArray() };
    }
    return { rows: this.sql.exec(`SELECT rowid AS id, ${COLS.join(", ")} FROM events WHERE ts >= ? AND ts < ? AND rowid > ? ORDER BY rowid LIMIT ?`,
      Number(from) || 0, Number(to) || 8.64e15, Number(after) || 0, lim).toArray() };
  },

  info() {
    const c = this.sql.exec("SELECT count(*) AS n, min(ts) AS first, max(ts) AS last FROM events").toArray()[0] || {};
    const g = this.sql.exec("SELECT count(*) AS n FROM gone_presets").toArray()[0] || {};
    return { events: c.n || 0, first: c.first || null, last: c.last || null, gonePresets: g.n || 0,
             liveSince: Number(this.meta("live_since")) || null, backfilled: this.meta("backfilled") === "1" };
  }
};

/* What a deleted account leaves behind: settings only. No name, no id, no
   file-name pattern (people write their own names into those), no account. */
export function strayPreset(p) {
  if (!p || typeof p !== "object") return null;
  return { ratio: p.ratio, out: p.out, fmt: p.fmt, quality: p.quality,
           customPattern: !!p.pattern && p.pattern !== "{name}-d{n}",
           layout: p.layout };
}

export function archive(env, op, args) {
  if (!env.ARCHIVE) return Promise.resolve({ error: "no_archive" });
  const stub = env.ARCHIVE.get(env.ARCHIVE.idFromName("all"));
  return stub.fetch("https://archive/", { method: "POST", body: JSON.stringify(Object.assign({ op }, args)) })
    .then(r => r.json());
}

function reply(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json" } });
}
