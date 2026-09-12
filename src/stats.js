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
  const TODAY = "timestamp >= toStartOfDay(NOW())";
  const YDAY  = "timestamp >= toStartOfDay(NOW()) - INTERVAL '1' DAY AND timestamp < toStartOfDay(NOW())";

  const queries = {
    today: `SELECT sumIf(_sample_interval, blob1='visit')  AS visits,
                   count(DISTINCT blob8)                   AS people,
                   sumIf(_sample_interval, blob1='export') AS exports
            FROM ${DATASET} WHERE ${TODAY}`,
    yday: `SELECT sumIf(_sample_interval, blob1='visit') AS visits
           FROM ${DATASET} WHERE ${YDAY}`,
    todayGeo: `SELECT blob3 AS country, sum(_sample_interval) AS visits
               FROM ${DATASET} WHERE ${TODAY} AND blob1='visit'
               GROUP BY country ORDER BY visits DESC LIMIT 8`,
    daily: `SELECT toStartOfDay(timestamp) AS day,
                   sumIf(_sample_interval, blob1='visit')  AS visits,
                   sumIf(_sample_interval, blob1='export') AS exports
            FROM ${DATASET} WHERE ${W} GROUP BY day ORDER BY day ASC`,
    month: `SELECT sumIf(_sample_interval, blob1='visit')  AS visits,
                   count(DISTINCT blob8)                   AS people,
                   sumIf(_sample_interval, blob1='export') AS exports,
                   sumIf(double6, blob1='export')          AS crops
            FROM ${DATASET} WHERE ${W}`,
    countries: `SELECT blob3 AS country,
                       sumIf(_sample_interval, blob1='visit')  AS visits,
                       sumIf(_sample_interval, blob1='export') AS exports
                FROM ${DATASET} WHERE ${W}
                GROUP BY country ORDER BY visits DESC LIMIT 10`,
    referrers: `SELECT blob4 AS ref, sum(_sample_interval) AS visits
                FROM ${DATASET} WHERE ${W} AND blob1='visit'
                GROUP BY ref ORDER BY visits DESC LIMIT 10`,
    settings: `SELECT blob5 AS ratio, blob6 AS fmt,
                      sum(_sample_interval) AS exports,
                      avg(double6)          AS crops,
                      countIf(double11 > 0) AS grid_runs
               FROM ${DATASET}
               WHERE blob1='export' AND double10=0 AND ${W}
               GROUP BY ratio, fmt ORDER BY exports DESC LIMIT 10`,
    images: `SELECT sum(_sample_interval) AS batches, avg(double2) AS imgs,
                    avg(double3) AS w, avg(double4) AS h, avg(double5) AS mb
             FROM ${DATASET} WHERE blob1='add' AND ${W}`,
    repeat: `SELECT double1 AS visit_no, count(DISTINCT blob8) AS people
             FROM ${DATASET} WHERE blob1='visit' AND ${W}
             GROUP BY visit_no ORDER BY visit_no ASC LIMIT 8`,
    devices: `SELECT blob9 AS device, blob2 AS lang, sum(_sample_interval) AS visits
              FROM ${DATASET} WHERE blob1='visit' AND ${W}
              GROUP BY device, lang ORDER BY visits DESC LIMIT 8`
  };

  const weakKey = env.STATS_KEY.length < 16;
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

  return html(shell(render(R, failed, weakKey)), 200);
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

function render(R, failed, weakKey) {
  const t   = (R.today.rows || [])[0] || {};
  const y   = (R.yday.rows  || [])[0] || {};
  const m   = (R.month.rows || [])[0] || {};
  const img = (R.images.rows|| [])[0] || {};
  const daily = R.daily.rows || [];

  const tv = Number(t.visits) || 0, yv = Number(y.visits) || 0;
  const delta = yv > 0 ? Math.round((tv - yv) / yv * 100) : null;
  const prior = daily.slice(0, -1);
  const avg = prior.length ? prior.reduce((a, d) => a + (Number(d.visits) || 0), 0) / prior.length : 0;
  const spiking = avg > 0 && tv > avg * 3 && tv >= 20;

  const peak = Math.max(1, ...daily.map(d => Number(d.visits) || 0));
  const bars = daily.map((d, i) => {
    const v = Number(d.visits) || 0;
    const last = i === daily.length - 1;
    const label = String(d.day || "").slice(5, 10);
    return `<div class="bar${last ? " now" : ""}" title="${esc(label)} · 방문 ${n0(v)} · 내보내기 ${n0(d.exports)}">
      <i style="height:${Math.max(2, Math.round(v / peak * 100))}%"></i></div>`;
  }).join("");

  const geo = (R.todayGeo.rows || []).map(r =>
    `<span class="chip"><b>${esc(r.country || "?")}</b>${n0(r.visits)}</span>`).join("");

  return `
  ${weakKey ? `<div class="warnbar">이 페이지의 키가 짧습니다. <code>STATS_KEY</code>를 긴 무작위 문자열로 바꾸세요.</div>` : ""}
  ${failed.length ? `<div class="warnbar">불러오지 못한 패널: ${failed.map(esc).join(", ")}</div>` : ""}
  ${spiking ? `<div class="spike">오늘 ${n0(tv)}회 — 최근 평균(${n1(avg)})의 ${Math.round(tv / avg)}배입니다. 유입 경로를 확인하세요.</div>` : ""}

  <div class="hero">
    <div class="heroMain">
      <span class="lab">오늘 방문</span>
      <strong>${n0(tv)}</strong>
      <span class="heroSub">
        ${t.people ? `${n0(t.people)}명` : "—"}
        ${t.exports ? ` · 내보내기 ${n0(t.exports)}` : ""}
        ${delta === null ? "" : ` · 어제 대비 <b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}%</b>`}
      </span>
      ${geo ? `<div class="chips">${geo}</div>` : ""}
    </div>
    <div class="heroChart">
      <div class="chart">${bars || '<p class="empty">아직 데이터가 없습니다.</p>'}</div>
      <span class="axis"><span>${DAYS}일 전</span><span>오늘</span></span>
    </div>
  </div>

  <div class="strip30">
    ${mini("30일 방문", n0(m.visits))}
    ${mini("사람", n0(m.people))}
    ${mini("내보내기", n0(m.exports))}
    ${mini("뽑은 컷", n0(m.crops))}
    ${mini("전환", m.visits > 0 ? Math.round(m.exports / m.visits * 100) + "%" : "—")}
  </div>

  <section><h2>어디서 오는가 <span>${DAYS}일</span></h2>
    <div class="cols">
      ${table(["국가", "방문", "내보내기"],
        (R.countries.rows || []).map(r => [r.country || "?", n0(r.visits), n0(r.exports)]))}
      ${table(["유입 경로", "방문"],
        (R.referrers.rows || []).map(r => [r.ref || "직접 / 북마크", n0(r.visits)]))}
    </div></section>

  <section><h2>무엇을 자르는가 <span>올린 이미지와 고른 설정</span></h2>
    <div class="strip30">
      ${mini("평균 장수", n1(img.imgs))}
      ${mini("평균 해상도", `${n0(img.w)}×${n0(img.h)}`)}
      ${mini("평균 용량", n1(img.mb) + "MB")}
      ${mini("업로드", n0(img.batches) + "회")}
    </div>
    ${table(["비율", "포맷", "내보내기", "평균 컷", "격자"],
      (R.settings.rows || []).map(r =>
        [r.ratio || "?", (r.fmt || "").replace("image/", ""), n0(r.exports), n1(r.crops), n0(r.grid_runs)]))}
  </section>

  <section><h2>다시 오는가 · 무엇으로 보는가</h2>
    <div class="cols">
      ${table(["방문 횟수", "사람"],
        (R.repeat.rows || []).map(r => [`${n0(r.visit_no)}번째`, n0(r.people)]))}
      ${table(["기기", "언어", "방문"],
        (R.devices.rows || []).map(r => [r.device || "?", r.lang || "?", n0(r.visits)]))}
    </div></section>

  <p class="foot">봇과 헤드리스 브라우저는 집계에서 제외됩니다.</p>`;
}

function mini(label, value) {
  return `<div class="mini"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
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
section{margin-top:32px}
.hero{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:16px;align-items:stretch}
@media (max-width:640px){.hero{grid-template-columns:minmax(0,1fr)}}
.heroMain{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px 18px;display:flex;flex-direction:column;justify-content:center;min-width:0}
.heroMain .lab{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.heroMain strong{font-size:clamp(38px,9vw,54px);font-weight:700;line-height:1.05;font-variant-numeric:tabular-nums;color:var(--amber);margin:2px 0 4px}
.heroSub{font-size:13px;color:var(--muted)}
.heroSub b.up{color:var(--green)}.heroSub b.down{color:var(--coral)}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}
.chip{background:var(--sunk);border:1px solid var(--line);border-radius:100px;padding:2px 9px;font-size:11.5px;color:var(--ink2);font-variant-numeric:tabular-nums}
.chip b{color:var(--teal);font-weight:600;margin-right:5px}
.heroChart{display:flex;flex-direction:column;gap:5px;min-width:0}
.axis{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)}
.strip30{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin-top:12px}
.mini{background:var(--sunk);border:1px solid var(--line-soft,#1a2c36);border-radius:5px;padding:9px 11px;display:flex;flex-direction:column;gap:1px;min-width:0}
.mini span{font-size:10.5px;letter-spacing:.06em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini b{font-size:clamp(15px,3.4vw,19px);font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.chart{display:flex;align-items:flex-end;gap:2px;height:100%;min-height:132px;background:var(--sunk);border:1px solid var(--line);border-radius:5px;padding:12px 12px 10px}
.bar{flex:1 1 0;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0}
.bar i{display:block;width:100%;background:#2a6f88;border-radius:2px 2px 0 0}
.bar.now i{background:var(--amber);box-shadow:0 0 10px rgba(232,180,90,.5)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:5px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1a2c36}
thead th{background:var(--sunk);font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
tbody tr:last-child td{border-bottom:0}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink2)}
.empty{color:var(--muted);font-size:13px;margin:0;padding:14px;border:1px dashed var(--line);border-radius:5px}
p.foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
.spike{background:rgba(232,180,90,.14);border:1px solid var(--amber);color:var(--amber);padding:12px 15px;border-radius:5px;margin-bottom:22px;font-weight:600}
.warnbar{background:rgba(252,104,71,.12);border:1px solid var(--coral);color:var(--coral);padding:10px 14px;border-radius:5px;margin-bottom:18px;font-size:13px}
.warnbar code{background:rgba(0,0,0,.35);padding:1px 6px;border-radius:3px;font-size:12px}
.err{background:var(--panel);border:1px solid var(--coral);border-radius:5px;padding:18px}
.err h2{color:var(--coral);margin-bottom:8px}
pre{background:var(--sunk);border:1px solid var(--line);border-radius:4px;padding:12px;overflow-x:auto;font-size:12.5px;color:var(--ink2)}
</style></head><body><div class="wrap">
<h1>DetailCrop 통계</h1>
<p class="sub1">최근 ${DAYS}일 · 이 페이지는 색인되지 않습니다</p>
${inner}
</div></body></html>`;
}


/**
 * GET /api/today?k=<STATS_KEY> — the small readout on the homepage footer.
 * Cached at the edge for a minute so a reload does not re-query the API.
 */
export async function todayJSON(request, env) {
  const url = new URL(request.url);
  if (!env.STATS_KEY || url.searchParams.get("k") !== env.STATS_KEY) {
    return new Response("Not found", { status: 404 });
  }
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return Response.json({ visits: 0, people: 0, exports: 0, countries: [] });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/today__cache", url).toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const TODAY = "timestamp >= toStartOfDay(NOW())";
  const [tot, geo] = await Promise.all([
    runSQL(env, `SELECT sumIf(_sample_interval, blob1='visit')  AS visits,
                        count(DISTINCT blob8)                   AS people,
                        sumIf(_sample_interval, blob1='export') AS exports
                 FROM ${DATASET} WHERE ${TODAY}`),
    runSQL(env, `SELECT blob3 AS country, sum(_sample_interval) AS visits
                 FROM ${DATASET} WHERE ${TODAY} AND blob1='visit'
                 GROUP BY country ORDER BY visits DESC LIMIT 6`)
  ]);
  const t = (tot.rows || [])[0] || {};
  const body = {
    visits: Math.round(Number(t.visits) || 0),
    people: Math.round(Number(t.people) || 0),
    exports: Math.round(Number(t.exports) || 0),
    countries: (geo.rows || []).map(r => ({ c: r.country || "?", n: Math.round(Number(r.visits) || 0) }))
  };

  const res = Response.json(body, {
    headers: { "cache-control": "public, max-age=60", "x-robots-tag": "noindex" }
  });
  await cache.put(cacheKey, res.clone());
  return res;
}
