/**
 * /stats — a read-only dashboard over the Analytics Engine dataset.
 *
 * Exists so nobody has to write SQL to answer "did traffic just spike?".
 * Guarded by ?k=<STATS_KEY>; without the right key it 404s like any other
 * missing path, so the endpoint does not advertise itself.
 */

const DATASET = "detailcrop_events";
const DAYS = 30;

export async function statsPage(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("k") || "";
  if (!env.STATS_KEY || key !== env.STATS_KEY) {
    return new Response("Not found", { status: 404 });
  }
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return html(shell(`<div class="err">
      <h2>Not configured yet</h2>
      <p>Set these and redeploy:</p>
      <pre>npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put STATS_KEY</pre>
      <p>The API token needs <b>Account → Account Analytics → Read</b>.</p>
    </div>`), 200);
  }

  const W = `timestamp > NOW() - INTERVAL '${DAYS}' DAY`;
  const queries = {
    daily: `SELECT toStartOfDay(timestamp) AS day,
                   sumIf(_sample_interval, blob1='visit')  AS visits,
                   count(DISTINCT blob8)                   AS people,
                   sumIf(_sample_interval, blob1='export') AS exports
            FROM ${DATASET} WHERE ${W} GROUP BY day ORDER BY day ASC`,
    week: `SELECT sumIf(_sample_interval, blob1='visit')  AS visits,
                  count(DISTINCT blob8)                   AS people,
                  sumIf(_sample_interval, blob1='export') AS exports,
                  sumIf(double6, blob1='export')          AS crops
           FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '7' DAY`,
    month: `SELECT sumIf(_sample_interval, blob1='visit')  AS visits,
                   count(DISTINCT blob8)                   AS people,
                   sumIf(_sample_interval, blob1='export') AS exports,
                   sumIf(double6, blob1='export')          AS crops
            FROM ${DATASET} WHERE ${W}`,
    countries: `SELECT blob3 AS country,
                       sumIf(_sample_interval, blob1='visit')  AS visits,
                       sumIf(_sample_interval, blob1='export') AS exports
                FROM ${DATASET} WHERE ${W}
                GROUP BY country ORDER BY visits DESC LIMIT 12`,
    referrers: `SELECT blob4 AS ref, sum(_sample_interval) AS visits
                FROM ${DATASET} WHERE ${W} AND blob1='visit'
                GROUP BY ref ORDER BY visits DESC LIMIT 12`,
    settings: `SELECT blob5 AS ratio, blob6 AS fmt,
                      sum(_sample_interval)        AS exports,
                      avg(double6)                 AS crops,
                      countIf(double11 > 0)        AS grid_runs
               FROM ${DATASET}
               WHERE blob1='export' AND double10=0 AND ${W}
               GROUP BY ratio, fmt ORDER BY exports DESC LIMIT 15`,
    images: `SELECT sum(_sample_interval) AS batches, avg(double2) AS imgs,
                    avg(double3) AS w, avg(double4) AS h, avg(double5) AS mb
             FROM ${DATASET} WHERE blob1='add' AND ${W}`,
    repeat: `SELECT double1 AS visit_no, count(DISTINCT blob8) AS people
             FROM ${DATASET} WHERE blob1='visit' AND ${W}
             GROUP BY visit_no ORDER BY visit_no ASC LIMIT 12`,
    devices: `SELECT blob9 AS device, blob2 AS lang, sum(_sample_interval) AS visits
              FROM ${DATASET} WHERE blob1='visit' AND ${W}
              GROUP BY device, lang ORDER BY visits DESC LIMIT 10`
  };

  const names = Object.keys(queries);
  const results = await Promise.all(names.map(n => runSQL(env, queries[n])));
  const R = {};
  names.forEach((n, i) => { R[n] = results[i]; });

  const failed = names.filter(n => R[n].error);
  if (failed.length === names.length) {
    return html(shell(`<div class="err"><h2>Query failed</h2><pre>${esc(R[names[0]].error)}</pre>
      <p>Usually the API token is missing <b>Account Analytics → Read</b>, or the
      dataset has no rows yet.</p></div>`), 200);
  }

  return html(shell(render(R, failed)), 200);
}

async function runSQL(env, sql) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      { method: "POST",
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
        body: sql });
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 400)}`, rows: [] };
    const json = JSON.parse(text);
    return { rows: json.data || [] };
  } catch (e) {
    return { error: String(e && e.message || e), rows: [] };
  }
}

/* ---------- rendering ---------- */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString();
const n1 = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString();

function render(R, failed) {
  const w = (R.week.rows || [])[0] || {};
  const m = (R.month.rows || [])[0] || {};
  const img = (R.images.rows || [])[0] || {};
  const daily = R.daily.rows || [];

  const peak = Math.max(1, ...daily.map(d => Number(d.visits) || 0));
  const today = daily.length ? Number(daily[daily.length - 1].visits) || 0 : 0;
  const prior = daily.slice(0, -1);
  const avg = prior.length
    ? prior.reduce((a, d) => a + (Number(d.visits) || 0), 0) / prior.length : 0;
  const spiking = avg > 0 && today > avg * 3 && today >= 20;

  const bars = daily.map(d => {
    const v = Number(d.visits) || 0;
    const day = String(d.day || "").slice(5, 10);
    return `<div class="bar" title="${esc(day)} · ${n0(v)} visits · ${n0(d.exports)} exports">
      <i style="height:${Math.max(2, Math.round(v / peak * 100))}%"></i><span>${esc(day.slice(3))}</span></div>`;
  }).join("");

  return `
  ${spiking ? `<div class="spike">오늘 방문 ${n0(today)}회 — 지난 ${prior.length}일 평균(${n1(avg)})의 ${Math.round(today / avg)}배입니다. 유입 경로를 확인하세요.</div>` : ""}
  ${failed.length ? `<div class="warnbar">일부 패널을 불러오지 못했습니다: ${failed.map(esc).join(", ")}</div>` : ""}

  <div class="tiles">
    ${tile("최근 7일 방문", n0(w.visits), `${n0(w.people)}명 · 내보내기 ${n0(w.exports)}회`)}
    ${tile("최근 30일 방문", n0(m.visits), `${n0(m.people)}명 · 내보내기 ${n0(m.exports)}회`)}
    ${tile("30일 뽑은 컷", n0(m.crops), m.exports > 0 ? `내보내기당 ${n1(m.crops / m.exports)}컷` : "—")}
    ${tile("전환", m.visits > 0 ? Math.round(m.exports / m.visits * 100) + "%" : "—", "방문 중 실제로 내보낸 비율")}
  </div>

  <section><h2>일별 방문 <span>최근 ${DAYS}일</span></h2>
    <div class="chart">${bars || '<p class="empty">아직 데이터가 없습니다.</p>'}</div></section>

  <section><h2>어디서 오는가</h2>
    <div class="cols">
      ${table(["국가", "방문", "내보내기"],
        (R.countries.rows || []).map(r => [r.country || "?", n0(r.visits), n0(r.exports)]))}
      ${table(["유입 경로", "방문"],
        (R.referrers.rows || []).map(r => [r.ref || "직접 방문 / 북마크", n0(r.visits)]))}
    </div></section>

  <section><h2>누가 쓰는가 <span>올린 이미지의 성격</span></h2>
    <div class="tiles small">
      ${tile("평균 장수", n1(img.imgs), `업로드 ${n0(img.batches)}회`)}
      ${tile("평균 해상도", `${n0(img.w)}×${n0(img.h)}`, "중앙값의 평균")}
      ${tile("평균 용량", n1(img.mb) + " MB", "장당")}
    </div>
    ${table(["비율", "포맷", "내보내기", "평균 컷", "격자 사용"],
      (R.settings.rows || []).map(r =>
        [r.ratio || "?", (r.fmt || "").replace("image/", ""), n0(r.exports), n1(r.crops), n0(r.grid_runs)]))}
  </section>

  <section><h2>다시 오는가</h2>
    ${table(["방문 횟수", "사람 수"],
      (R.repeat.rows || []).map(r => [`${n0(r.visit_no)}번째`, n0(r.people)]))}
  </section>

  <section><h2>기기와 언어</h2>
    ${table(["기기", "언어", "방문"],
      (R.devices.rows || []).map(r => [r.device || "?", r.lang || "?", n0(r.visits)]))}
  </section>`;
}

function tile(label, value, sub) {
  return `<div class="tile"><span class="lab">${esc(label)}</span>
    <strong>${esc(value)}</strong><span class="sub">${esc(sub)}</span></div>`;
}

function table(head, rows) {
  if (!rows.length) return `<p class="empty">아직 데이터가 없습니다.</p>`;
  return `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) =>
      `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store",
               "x-robots-tag": "noindex, nofollow" }
  });
}

function shell(inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>DetailCrop 통계</title>
<style>
:root{color-scheme:dark;--ground:#0b1319;--panel:#13212a;--sunk:#0e1a21;--line:#223945;
--ink:#e8f0f2;--ink2:#adc4cb;--muted:#7d97a1;--amber:#e8b45a;--teal:#35b7e0;--green:#71e666;--coral:#fc6847}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--ground);color:var(--ink);font:15px/1.65 'Archivo','Pretendard','Apple SD Gothic Neo',system-ui,sans-serif;word-break:keep-all;overflow-wrap:break-word}
.wrap{max-width:920px;margin:0 auto;padding:36px 20px 80px}
h1{font-size:24px;margin:0 0 4px}
.sub1{color:var(--muted);font-size:13px;margin:0 0 26px}
h2{font-size:15px;margin:0 0 12px;letter-spacing:.02em}
h2 span{color:var(--muted);font-weight:400;font-size:12.5px;margin-left:8px}
section{margin-top:34px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.tiles.small{margin-bottom:16px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:13px 15px;display:flex;flex-direction:column;gap:2px;min-width:0}
.tile .lab{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.tile strong{font-size:clamp(19px,5vw,26px);font-weight:600;font-variant-numeric:tabular-nums;line-height:1.25;overflow-wrap:anywhere}
.tile .sub{font-size:12px;color:var(--muted)}
.chart{display:flex;align-items:flex-end;gap:3px;height:150px;background:var(--sunk);border:1px solid var(--line);border-radius:5px;padding:12px 12px 4px}
.bar{flex:1 1 0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px;min-width:0}
.bar i{display:block;width:100%;background:var(--teal);border-radius:2px 2px 0 0}
.bar span{font-size:9px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
@media (max-width:700px){ .chart{gap:2px;padding:10px 10px 4px} .bar span{display:none} }
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:5px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1a2c36}
thead th{background:var(--sunk);font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
tbody tr:last-child td{border-bottom:0}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink2)}
.empty{color:var(--muted);font-size:13px;margin:0;padding:14px;border:1px dashed var(--line);border-radius:5px}
.spike{background:rgba(232,180,90,.14);border:1px solid var(--amber);color:var(--amber);padding:12px 15px;border-radius:5px;margin-bottom:22px;font-weight:600}
.warnbar{background:rgba(252,104,71,.12);border:1px solid var(--coral);color:var(--coral);padding:10px 14px;border-radius:5px;margin-bottom:18px;font-size:13px}
.err{background:var(--panel);border:1px solid var(--coral);border-radius:5px;padding:18px}
.err h2{color:var(--coral);margin-bottom:8px}
pre{background:var(--sunk);border:1px solid var(--line);border-radius:4px;padding:12px;overflow-x:auto;font-size:12.5px;color:var(--ink2)}
</style></head><body><div class="wrap">
<h1>DetailCrop 통계</h1>
<p class="sub1">최근 ${DAYS}일 · 이 페이지는 색인되지 않습니다</p>
${inner}
</div></body></html>`;
}
