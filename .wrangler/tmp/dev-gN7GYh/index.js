var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/stats.js
var DATASET = "detailcrop_events";
var RANGES = [7, 14, 30, 90];
var DEFAULT_DAYS = 30;
var FEATURE_LABELS = {
  auto: "\uC790\uB3D9 \uBC30\uCE58",
  spread: "\uADE0\uB4F1 \uBC30\uCE58",
  wide: "\uC640\uC774\uB4DC \uBAA8\uB4DC",
  nudge: "\uD654\uC0B4\uD45C \uBBF8\uC138\uC870\uC815",
  custom: "\uCEE4\uC2A4\uD140 \uBE44\uC728",
  grid: "\uACA9\uC790(\uD53C\uB4DC \uBD84\uD560)",
  rot: "\uD68C\uC804 \uBCF4\uC815",
  persp: "\uC65C\uACE1 \uBCF4\uC815",
  sample: "\uC0D8\uD50C \uC774\uBBF8\uC9C0",
  prev: "\uC774\uC804 \uC774\uBBF8\uC9C0\uC640 \uAC19\uC740 \uC0C1\uC790",
  scope: "\uCEF7\uBCC4 \uBE44\uC728"
};
var WHY_LABELS = {
  shop: "\uC1FC\uD551\uBAB0 \uC0C1\uD488 \uC0AC\uC9C4",
  art: "\uC791\uD488\xB7\uD504\uB9B0\uD2B8",
  social: "\uC778\uC2A4\uD0C0\xB7SNS \uAC8C\uC2DC\uBB3C",
  dataset: "AI \uD559\uC2B5\uC6A9 \uB370\uC774\uD130\uC14B",
  photo: "\uC0AC\uC9C4 \uB0A9\uD488\xB7\uC778\uC1C4",
  docs: "\uBB38\uC11C\xB7\uC2A4\uCE94\xB7\uCEA1\uCC98",
  try: "\uADF8\uB0E5 \uC368 \uBCF4\uB294 \uC911",
  other: "\uAE30\uD0C0"
};
var TOUR_LABELS = ["\uD06C\uB86D \uBC15\uC2A4", "\uCEF7 \uAC1C\uC218", "\uCEF7 \uBAA9\uB85D", "\uBE44\uC728", "\uD544\uB984\uC2A4\uD2B8\uB9BD", "\uB0B4\uBCF4\uB0B4\uAE30"];
async function statsPage(request, env) {
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
      <p>The API token needs <b>Account \u2192 Account Analytics \u2192 Read</b>.</p>
    </div>`, DEFAULT_DAYS, key), 200);
  }
  const asked = parseInt(url.searchParams.get("d"), 10);
  const days = RANGES.includes(asked) ? asked : DEFAULT_DAYS;
  const W = `timestamp > NOW() - INTERVAL '${days}' DAY`;
  const TODAY = "timestamp >= toStartOfDay(NOW())";
  const YDAY = "timestamp >= toStartOfDay(NOW()) - INTERVAL '1' DAY AND timestamp < toStartOfDay(NOW())";
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
    /* The funnel. Analytics Engine has no JOINs, so counting distinct ids per
       event type in one grouped query is how the stages get compared at all.
       That makes it people (browsers), not sessions — visit ⊇ add ⊇ export
       holds anyway because 'visit' fires on every load. */
    funnel: `SELECT blob1 AS step, count(DISTINCT blob8) AS people
             FROM ${DATASET} WHERE ${W} GROUP BY step`,
    /* How long between the first file landing and the zip coming out.
       double16 is measured in the page and sent with the export event; the
       same no-JOIN limit means it cannot be derived from timestamps here. */
    dwell: `SELECT countIf(double16 > 0   AND double16 < 30)  AS b1,
                   countIf(double16 >= 30  AND double16 < 120) AS b2,
                   countIf(double16 >= 120 AND double16 < 300) AS b3,
                   countIf(double16 >= 300 AND double16 < 900) AS b4,
                   countIf(double16 >= 900)                    AS b5,
                   avg(double16)                               AS mean
            FROM ${DATASET} WHERE blob1='export' AND double16 > 0 AND ${W}`,
    /* One 'use' event per feature per session, so a feature can be added later
       without touching the schema. Counted as people, to match the funnel. */
    features: `SELECT blob10 AS feat, count(DISTINCT blob8) AS people
               FROM ${DATASET} WHERE blob1='use' AND ${W}
               GROUP BY feat ORDER BY people DESC LIMIT 12`,
    /* Walkthrough retention: one event per step reached. */
    tour: `SELECT double17 AS step, count(DISTINCT blob8) AS people
           FROM ${DATASET} WHERE blob1='tour' AND double17 > 0 AND ${W}
           GROUP BY step ORDER BY step ASC LIMIT 12`,
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
    skips: `SELECT sum(_sample_interval) AS events, sum(double2) AS files,
                   max(double5) AS biggest_mb
            FROM ${DATASET} WHERE blob1='skip' AND ${W}`,
    images: `SELECT sum(_sample_interval) AS batches, avg(double2) AS imgs,
                    avg(double3) AS w, avg(double4) AS h, avg(double5) AS mb
             FROM ${DATASET} WHERE blob1='add' AND ${W}`,
    repeat: `SELECT double1 AS visit_no, count(DISTINCT blob8) AS people
             FROM ${DATASET} WHERE blob1='visit' AND ${W}
             GROUP BY visit_no ORDER BY visit_no ASC LIMIT 8`,
    devices: `SELECT blob9 AS device, blob2 AS lang, sum(_sample_interval) AS visits
              FROM ${DATASET} WHERE blob1='visit' AND ${W}
              GROUP BY device, lang ORDER BY visits DESC LIMIT 8`,
    /* The question after an export. Asked once per browser; several answers
       allowed, one event each, and every event carries the export it
       followed, so crops per image comes along. */
    why: `SELECT blob10 AS purpose, count(DISTINCT blob8) AS people,
                 sum(double6) AS crops, sum(double2) AS imgs,
                 countIf(double11 > 0) AS grid_runs
          FROM ${DATASET} WHERE blob1='why' AND ${W}
          GROUP BY purpose ORDER BY people DESC LIMIT 12`,
    /* people who answered at all — not the sum of the rows above, since one
       person can sit under several purposes */
    whyPeople: `SELECT count(DISTINCT blob8) AS people
                FROM ${DATASET} WHERE blob1='why' AND blob10 != 'skip' AND ${W}`,
    /* The video page's own events. Exports of the sample clip are left out. */
    video: `SELECT blob1 AS step, count(DISTINCT blob8) AS people,
                   sum(_sample_interval) AS n
            FROM ${DATASET}
            WHERE (blob1='vvisit' OR (blob1='vexport' AND double10=0)) AND ${W}
            GROUP BY step`,
    vratios: `SELECT blob5 AS ratio, sum(_sample_interval) AS exports,
                     avg(double6) AS crops, avg(double2) AS clips
              FROM ${DATASET} WHERE blob1='vexport' AND double10=0 AND ${W}
              GROUP BY ratio ORDER BY exports DESC LIMIT 8`
  };
  const weakKey = env.STATS_KEY.length < 16;
  const names = Object.keys(queries);
  const results = await Promise.all(names.map((n) => runSQL(env, queries[n])));
  const R = {};
  names.forEach((n, i) => {
    R[n] = results[i];
  });
  const failed = names.filter((n) => R[n].error);
  if (failed.length === names.length) {
    return html(shell(`<div class="err"><h2>Query failed</h2><pre>${esc(R[names[0]].error)}</pre>
      <p>Usually the API token is missing <b>Account Analytics \u2192 Read</b>, or the
      dataset has no rows yet.</p></div>`, days, key), 200);
  }
  return html(shell(render(R, days, failed, weakKey), days, key), 200);
}
__name(statsPage, "statsPage");
async function runSQL(env, sql) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
        body: sql
      }
    );
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 400)}`, rows: [] };
    const json2 = JSON.parse(text);
    return { rows: json2.data || [] };
  } catch (e) {
    return { error: String(e && e.message || e), rows: [] };
  }
}
__name(runSQL, "runSQL");
var esc = /* @__PURE__ */ __name((s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
var n0 = /* @__PURE__ */ __name((v) => Math.round(Number(v) || 0).toLocaleString("ko-KR"), "n0");
var n1 = /* @__PURE__ */ __name((v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString("ko-KR"), "n1");
var num = /* @__PURE__ */ __name((v) => Number(v) || 0, "num");
var first = /* @__PURE__ */ __name((q) => (q && q.rows || [])[0] || {}, "first");
var share = /* @__PURE__ */ __name((a, b) => b > 0 ? a / b * 100 : 0, "share");
function dur(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return "\u2014";
  if (s < 60) return `${s}\uCD08`;
  if (s < 3600) return `${Math.floor(s / 60)}\uBD84 ${String(s % 60).padStart(2, "0")}\uCD08`;
  return `${Math.floor(s / 3600)}\uC2DC\uAC04 ${Math.floor(s % 3600 / 60)}\uBD84`;
}
__name(dur, "dur");
function mini(label, value) {
  return `<div class="mini"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}
__name(mini, "mini");
function rankList(rows, opts) {
  opts = opts || {};
  if (!rows.length) return empty(opts.emptyNote);
  const max = opts.scaleMax || Math.max(1, ...rows.map((r) => num(r.value)));
  return `<div class="ranklist">` + rows.map((r, i) => {
    const pct = Math.max(2, Math.min(100, num(r.value) / max * 100));
    return `<div class="rrow">
      <span class="rank">${i + 1}</span>
      <span class="rlabel">${esc(r.label)}</span>
      <span class="track"><span class="fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="rval">${esc(r.display != null ? r.display : n0(r.value))}${r.sub ? `<span class="rsub">${esc(r.sub)}</span>` : ""}</span>
    </div>`;
  }).join("") + `</div>`;
}
__name(rankList, "rankList");
function funnelBlock(stages, opts) {
  opts = opts || {};
  const top = num(stages[0] && stages[0].n);
  if (!top) return empty(opts.emptyNote);
  return `<div class="funnel">` + stages.map((s, i) => {
    const pct = share(num(s.n), top);
    const next = stages[i + 1];
    const stage = `<div class="fstage">
      <span class="flabel">${esc(s.label)}</span>
      <span class="ftrack"><span class="ffill" style="width:${Math.max(1.5, pct).toFixed(1)}%"></span></span>
      <span class="fval">${n0(s.n)}<span class="fpct">${pct.toFixed(1)}%</span></span>
    </div>`;
    if (!next) return stage;
    const lost = num(s.n) - num(next.n);
    return stage + `<div class="fdrop"><span></span>
      <span class="dropText"><i>\u2193</i> ${n0(lost)} \uC774\uD0C8 \xB7 ${share(lost, num(s.n)).toFixed(1)}%</span>
      <span></span></div>`;
  }).join("") + `</div>`;
}
__name(funnelBlock, "funnelBlock");
function histogram(buckets, opts) {
  opts = opts || {};
  const peak = Math.max(...buckets.map((b) => num(b.n)));
  if (!peak) return empty(opts.emptyNote);
  const MAXH = 84;
  return `<div class="hist">` + buckets.map((b) => `<span class="hcol${num(b.n) === peak ? " peak" : ""}">
       <b>${n0(b.n)}</b>
       <i style="height:${Math.max(3, Math.round(num(b.n) / peak * MAXH))}px"></i>
     </span>`).join("") + `</div>
    <div class="histAxis">${buckets.map((b) => `<span>${esc(b.label)}</span>`).join("")}</div>`;
}
__name(histogram, "histogram");
var SEG_COLORS = ["var(--teal)", "var(--amber)", "var(--pink)", "var(--fog)"];
function segBar(label, rows) {
  const total = rows.reduce((a, r) => a + num(r.n), 0);
  if (!total) return "";
  return `<div class="segWrap">
    <p class="segLabel">${esc(label)}</p>
    <div class="segbar">${rows.map((r, i) => `<i style="width:${(num(r.n) / total * 100).toFixed(2)}%; background:${SEG_COLORS[i % SEG_COLORS.length]}"></i>`).join("")}</div>
    <div class="legend">${rows.map((r, i) => `<span class="lg"><i style="background:${SEG_COLORS[i % SEG_COLORS.length]}"></i>${esc(r.label)} <b>${Math.round(share(num(r.n), total))}%</b></span>`).join("")}</div>
  </div>`;
}
__name(segBar, "segBar");
function empty(note) {
  return `<p class="empty">${esc(note || "\uC544\uC9C1 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")}</p>`;
}
__name(empty, "empty");
function render(R, days, failed, weakKey) {
  const t = first(R.today);
  const y = first(R.yday);
  const m = first(R.month);
  const img = first(R.images);
  const sk = first(R.skips);
  const dw = first(R.dwell);
  const daily = R.daily.rows || [];
  const tv = num(t.visits), yv = num(y.visits);
  const delta = yv > 0 ? Math.round((tv - yv) / yv * 100) : null;
  const prior = daily.slice(0, -1);
  const avg = prior.length ? prior.reduce((a, d) => a + num(d.visits), 0) / prior.length : 0;
  const spiking = avg > 0 && tv > avg * 3 && tv >= 20;
  const peak = Math.max(1, ...daily.map((d) => num(d.visits)));
  const every = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 5 : 15;
  const bars = daily.map((d, i) => {
    const v = num(d.visits);
    const label = String(d.day || "").slice(5, 10);
    const last = i === daily.length - 1;
    return `<div class="bar${last ? " now" : ""}" tabindex="0"
      data-d="${esc(label)}" data-v="${n0(v)}" data-e="${n0(d.exports)}"
      aria-label="${esc(label)} \uBC29\uBB38 ${n0(v)} \uB0B4\uBCF4\uB0B4\uAE30 ${n0(d.exports)}">
      <i style="height:${Math.max(2, Math.round(v / peak * 100))}%"></i></div>`;
  }).join("");
  const axis = daily.map((d, i) => i % every === 0 || i === daily.length - 1 ? `<span>${esc(String(d.day || "").slice(5, 10))}</span>` : "").join("");
  const geoRows = R.todayGeo.rows || [];
  const geoShown = geoRows.reduce((a, r) => a + num(r.visits), 0);
  const geoRest = Math.max(0, tv - geoShown);
  const geo = geoRows.map((r) => `<span class="chip"><b>${esc(r.country || "?")}</b>${n0(r.visits)}</span>`).join("") + (geoRest ? `<span class="chip rest"><b>\uAE30\uD0C0</b>${n0(geoRest)}</span>` : "");
  const byStep = {};
  (R.funnel.rows || []).forEach((r) => {
    byStep[r.step] = num(r.people);
  });
  const funnelStages = [
    { label: "\uBC29\uBB38", n: byStep.visit || 0 },
    { label: "\uC774\uBBF8\uC9C0 \uC62C\uB9BC", n: byStep.add || 0 },
    { label: "\uB0B4\uBCF4\uB0B4\uAE30", n: byStep.export || 0 }
  ];
  const uploaded = funnelStages[1].n, exported = funnelStages[2].n;
  const abandoned = Math.max(0, uploaded - exported);
  const dwellBuckets = [
    { label: "30\uCD08 \uBBF8\uB9CC", n: dw.b1 },
    { label: "30\uCD08~2\uBD84", n: dw.b2 },
    { label: "2~5\uBD84", n: dw.b3 },
    { label: "5~15\uBD84", n: dw.b4 },
    { label: "15\uBD84+", n: dw.b5 }
  ];
  const dwellTotal = dwellBuckets.reduce((a, b) => a + num(b.n), 0);
  const featRows = (R.features.rows || []).map((r) => ({
    label: FEATURE_LABELS[r.feat] || r.feat || "?",
    value: exported > 0 ? share(num(r.people), exported) : 0,
    display: exported > 0 ? Math.round(share(num(r.people), exported)) + "%" : "\u2014",
    sub: `${n0(r.people)}\uBA85`
  }));
  const tourRows = (R.tour.rows || []).map((r) => {
    const i = Math.round(num(r.step));
    return { label: `${i} \xB7 ${TOUR_LABELS[i - 1] || "?"}`, n: num(r.people) };
  });
  const started = tourRows.length ? tourRows[0].n : 0;
  const finished = tourRows.length ? tourRows[tourRows.length - 1].n : 0;
  let worst = { at: "\u2014", pct: 0 };
  tourRows.forEach((s, i) => {
    const next = tourRows[i + 1];
    if (!next || !s.n) return;
    const p = share(s.n - next.n, s.n);
    if (p > worst.pct) worst = { at: `${i + 1}\u2192${i + 2}\uB2E8\uACC4`, pct: p };
  });
  const devRows = R.devices.rows || [];
  const sumBy = /* @__PURE__ */ __name((keyName) => {
    const acc = {};
    devRows.forEach((r) => {
      const k = r[keyName] || "?";
      acc[k] = (acc[k] || 0) + num(r.visits);
    });
    return Object.keys(acc).map((k) => ({ label: k, n: acc[k] })).sort((a, b) => b.n - a.n);
  }, "sumBy");
  const LANG_LABELS = { en: "\uC601\uC5B4", ko: "\uD55C\uAD6D\uC5B4", ja: "\uC77C\uBCF8\uC5B4" };
  const DEV_LABELS = { desktop: "\uB370\uC2A4\uD06C\uD1B1", mobile: "\uBAA8\uBC14\uC77C" };
  const deviceSplit = sumBy("device").map((r) => ({ label: DEV_LABELS[r.label] || r.label, n: r.n }));
  const langSplit = sumBy("lang").map((r) => ({ label: LANG_LABELS[r.label] || r.label, n: r.n }));
  const NOT_YET = "\uC544\uC9C1 \uC218\uC9D1 \uC804\uC785\uB2C8\uB2E4 \u2014 template.html\uC5D0 track() \uCD94\uAC00\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.";
  const whyRows = R.why.rows || [];
  const skipped = num((whyRows.find((r) => r.purpose === "skip") || {}).people);
  const answers = whyRows.filter((r) => r.purpose !== "skip");
  const answered = num(first(R.whyPeople).people);
  const whyList = answers.map((r) => ({
    label: WHY_LABELS[r.purpose] || r.purpose || "?",
    value: answered > 0 ? share(num(r.people), answered) : 0,
    display: `${n0(r.people)}\uBA85`,
    sub: `${answered > 0 ? Math.round(share(num(r.people), answered)) : 0}% \xB7 \uC7A5\uB2F9 ${num(r.imgs) > 0 ? n1(num(r.crops) / num(r.imgs)) : "\u2014"}\uCEF7${num(r.grid_runs) ? ` \xB7 \uACA9\uC790 ${n0(r.grid_runs)}` : ""}`
  }));
  const vBy = {};
  (R.video.rows || []).forEach((r) => {
    vBy[r.step] = r;
  });
  const vv = vBy.vvisit || {}, ve = vBy.vexport || {};
  const vratioList = (R.vratios.rows || []).map((r) => ({
    label: r.ratio === "mixed" ? "\uBE44\uC728 \uC11E\uC74C" : r.ratio || "?",
    value: num(r.exports),
    sub: `\uAC74 \xB7 \uD3C9\uADE0 ${n1(r.crops)}\uCEF7 \xB7 \uC601\uC0C1 ${n1(r.clips)}\uAC1C`
  }));
  return `
  ${weakKey ? `<div class="warnbar">\uC774 \uD398\uC774\uC9C0\uC758 \uD0A4\uAC00 \uC9E7\uC2B5\uB2C8\uB2E4. <code>STATS_KEY</code>\uB97C \uAE34 \uBB34\uC791\uC704 \uBB38\uC790\uC5F4\uB85C \uBC14\uAFB8\uC138\uC694.</div>` : ""}
  ${failed.length ? `<div class="warnbar">\uBD88\uB7EC\uC624\uC9C0 \uBABB\uD55C \uD328\uB110: ${failed.map(esc).join(", ")}</div>` : ""}
  ${spiking ? `<div class="spike">\uC624\uB298 ${n0(tv)}\uD68C \u2014 \uCD5C\uADFC ${days}\uC77C \uD3C9\uADE0(${n1(avg)})\uC758 ${Math.round(tv / avg)}\uBC30\uC785\uB2C8\uB2E4. \uC720\uC785 \uACBD\uB85C\uB97C \uD655\uC778\uD558\uC138\uC694.</div>` : ""}

  <section class="hero">
    <div class="heroMain">
      <p class="eyebrow">\uC624\uB298, \uD55C\uB208\uC5D0</p>
      <span class="lab">\uC624\uB298 \uBC29\uBB38</span>
      <strong>${n0(tv)}</strong>
      <p class="heroSub">
        ${t.people ? `${n0(t.people)}\uBA85` : "\u2014"}${t.exports ? ` \xB7 \uB0B4\uBCF4\uB0B4\uAE30 ${n0(t.exports)}` : ""}${delta === null ? "" : ` \xB7 \uC5B4\uC81C \uB300\uBE44 <b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}%</b>`}
      </p>
      ${geo ? `<div class="chips">${geo}</div>` : ""}
    </div>
    <div class="heroChart">
      <div class="chartHead"><span class="chartTitle">\uC77C\uBCC4 \uBC29\uBB38 <span>\xB7 ${days}\uC77C</span></span></div>
      <div class="chartBox" id="chart">
        <div class="gridlines">
          <i style="bottom:100%"><b>${n0(peak)}</b></i>
          <i style="bottom:50%"><b>${n0(Math.round(peak / 2))}</b></i>
          <i style="bottom:0"></i>
        </div>
        <div class="bars">${bars || ""}</div>
      </div>
      <div class="axis">${axis}</div>
      <div class="tooltip" id="tip" hidden></div>
    </div>
  </section>

  <section>
    <h2>\uAE30\uAC04 \uC694\uC57D <span>\xB7 \uCD5C\uADFC ${days}\uC77C</span></h2>
    <div class="strip">
      ${mini("\uBC29\uBB38", n0(m.visits))}
      ${mini("\uC0AC\uB78C", n0(m.people))}
      ${mini("\uB0B4\uBCF4\uB0B4\uAE30", n0(m.exports))}
      ${mini("\uBF51\uC740 \uCEF7", n0(m.crops))}
      ${mini("\uC804\uD658", num(m.visits) > 0 ? Math.round(share(num(m.exports), num(m.visits))) + "%" : "\u2014")}
    </div>
  </section>

  <section class="panel wide">
    <h2>\uB05D\uAE4C\uC9C0 \uAC00\uB294\uAC00 <span>\uBC29\uBB38 \u2192 \uC62C\uB9BC \u2192 \uB0B4\uBCF4\uB0B4\uAE30 \xB7 \uC0AC\uB78C \uAE30\uC900 \xB7 ${days}\uC77C</span></h2>
    <div class="twoCol">
      <div>
        <p class="segLabel">\uD37C\uB110</p>
        ${funnelBlock(funnelStages)}
      </div>
      <div>
        <p class="segLabel">\uC62C\uB9AC\uACE0 \uB098\uC11C \uB0B4\uBCF4\uB0B4\uAE30\uAE4C\uC9C0 \uAC78\uB9B0 \uC2DC\uAC04</p>
        <div class="strip">
          ${mini("\uD3C9\uADE0 \uCCB4\uB958", dwellTotal ? dur(dw.mean) : "\u2014")}
          ${mini("\uC62C\uB9AC\uACE0 \uC548 \uB0B4\uBCF4\uB0C4", n0(abandoned))}
          ${mini("\uBBF8\uC644\uB8CC\uC728", uploaded > 0 ? share(abandoned, uploaded).toFixed(1) + "%" : "\u2014")}
        </div>
        ${histogram(dwellBuckets, { emptyNote: NOT_YET })}
      </div>
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>\uC5B4\uB514\uC11C \uC624\uB294\uAC00 <span>\uAD6D\uAC00\uBCC4 \uBC29\uBB38 \xB7 ${days}\uC77C</span></h2>
      ${rankList((R.countries.rows || []).map((r) => ({
    label: r.country || "?",
    value: num(r.visits),
    sub: `\uB0B4\uBCF4\uB0B4\uAE30 ${n0(r.exports)}`
  })))}
    </div>
    <div class="panel">
      <h2>\uC5B4\uB514\uC11C \uC624\uB294\uAC00 <span>\uC720\uC785 \uACBD\uB85C \xB7 ${days}\uC77C</span></h2>
      ${rankList((R.referrers.rows || []).map((r) => ({
    label: r.ref || "\uC9C1\uC811 / \uBD81\uB9C8\uD06C",
    value: num(r.visits)
  })))}
    </div>
  </section>

  <section class="panel wide">
    <h2>\uBB34\uC5C7\uC744 \uC790\uB974\uB294\uAC00 <span>\uC62C\uB9B0 \uC774\uBBF8\uC9C0\uC640 \uACE0\uB978 \uC124\uC815 \xB7 ${days}\uC77C</span></h2>
    <div class="strip">
      ${mini("\uD3C9\uADE0 \uC7A5\uC218", n1(img.imgs))}
      ${mini("\uD3C9\uADE0 \uD574\uC0C1\uB3C4", `${n0(img.w)}\xD7${n0(img.h)}`)}
      ${mini("\uD3C9\uADE0 \uC6A9\uB7C9", n1(img.mb) + "MB")}
      ${mini("\uC5C5\uB85C\uB4DC", n0(img.batches) + "\uD68C")}
      ${mini("\uC6A9\uB7C9 \uCD08\uACFC \uAC70\uBD80", n0(sk.files) + "\uC7A5")}
      ${mini("\uCD5C\uB300 \uAC70\uBD80 \uD30C\uC77C", sk.biggest_mb ? n1(sk.biggest_mb) + "MB" : "\u2014")}
    </div>
    <div class="wideList">
      ${rankList((R.settings.rows || []).map((r) => ({
    label: `${r.ratio || "?"} ${(r.fmt || "").replace("image/", "")}`,
    value: num(r.exports),
    sub: `\uAC74 \xB7 \uD3C9\uADE0 ${n1(r.crops)}\uCEF7${num(r.grid_runs) ? ` \xB7 \uACA9\uC790 ${n0(r.grid_runs)}` : ""}`
  })))}
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>\uBB34\uC5C7\uC744 \uC4F0\uB294\uAC00 <span>\uB0B4\uBCF4\uB0B8 \uC0AC\uB78C \uC911 \uC0AC\uC6A9\uB960 \xB7 ${days}\uC77C</span></h2>
      ${rankList(featRows, { scaleMax: 100, emptyNote: NOT_YET })}
    </div>
    <div class="panel">
      <h2>\uD22C\uC5B4\uB294 \uBA39\uD788\uB294\uAC00 <span>\uB2E8\uACC4\uBCC4 \uC794\uC874 \xB7 ${days}\uC77C</span></h2>
      ${tourRows.length ? `<div class="strip">
        ${mini("\uD22C\uC5B4 \uC2DC\uC791", n0(started))}
        ${mini("\uBC29\uBB38 \uB300\uBE44", num(m.people) > 0 ? share(started, num(m.people)).toFixed(1) + "%" : "\u2014")}
        ${mini("\uC644\uC8FC", started > 0 ? share(finished, started).toFixed(1) + "%" : "\u2014")}
        ${mini("\uCD5C\uB300 \uC774\uD0C8", worst.at)}
      </div>` : ""}
      <div style="margin-top:14px">${funnelBlock(tourRows, { emptyNote: NOT_YET })}</div>
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>\uB2E4\uC2DC \uC624\uB294\uAC00 <span>\uBC29\uBB38 \uD69F\uC218\uBCC4 \uC0AC\uB78C \xB7 ${days}\uC77C</span></h2>
      ${rankList((R.repeat.rows || []).map((r) => ({
    label: `${n0(r.visit_no)}\uBC88\uC9F8 \uBC29\uBB38`,
    value: num(r.people)
  })))}
    </div>
    <div class="panel">
      <h2>\uBB34\uC5C7\uC73C\uB85C \uBCF4\uB294\uAC00 <span>\uAE30\uAE30 \xB7 \uC5B8\uC5B4 \xB7 ${days}\uC77C</span></h2>
      ${deviceSplit.length ? segBar("\uAE30\uAE30", deviceSplit) : empty()}
      ${langSplit.length ? segBar("\uC5B8\uC5B4", langSplit) : ""}
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>\uBB34\uC5C7\uC5D0 \uC4F0\uB294\uAC00 <span>\uB0B4\uBCF4\uB0B8 \uB4A4 \uC9C8\uBB38 \xB7 \uBCF5\uC218 \uC751\uB2F5 \xB7 ${days}\uC77C</span></h2>
      <div class="strip">
        ${mini("\uB2F5\uD568", n0(answered))}
        ${mini("\uAC74\uB108\uB700", n0(skipped))}
        ${mini("\uC751\uB2F5\uB960", answered + skipped > 0 ? Math.round(share(answered, answered + skipped)) + "%" : "\u2014")}
      </div>
      <div style="margin-top:14px">${rankList(whyList, { scaleMax: 100, emptyNote: "\uC544\uC9C1 \uC751\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })}</div>
    </div>
    <div class="panel">
      <h2>\uC601\uC0C1 \uB3C4\uAD6C <span>\uB0B4\uBCF4\uB0B4\uAE30\uB294 \uC608\uC2DC \uC601\uC0C1 \uC81C\uC678 \xB7 ${days}\uC77C</span></h2>
      <div class="strip">
        ${mini("\uBC29\uBB38", n0(vv.n))}
        ${mini("\uC0AC\uB78C", n0(vv.people))}
        ${mini("\uB0B4\uBCF4\uB0B4\uAE30", n0(ve.n))}
        ${mini("\uB0B4\uBCF4\uB0B8 \uC0AC\uB78C", n0(ve.people))}
      </div>
      <div style="margin-top:14px">${rankList(vratioList, { emptyNote: "\uC544\uC9C1 \uB0B4\uBCF4\uB0B8 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })}</div>
    </div>
  </section>

  <p class="foot">\uBD07\uACFC \uD5E4\uB4DC\uB9AC\uC2A4 \uBE0C\uB77C\uC6B0\uC800\uB294 \uC9D1\uACC4\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4. \uC774\uBBF8\uC9C0 \uC790\uCCB4\uB294 \uC774 Worker\uC5D0 \uB3C4\uB2EC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>`;
}
__name(render, "render");
function html(body, status) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html;charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}
__name(html, "html");
function shell(inner, days, key) {
  const q = encodeURIComponent(key || "");
  const rangeLinks = RANGES.map((r) => `<a class="${r === days ? "active" : ""}" href="?k=${q}&amp;d=${r}">${r}\uC77C</a>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>DetailCrop \uD1B5\uACC4</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap">
<style>
/* Tokens are the product's own palette \u2014 committed dark, same as the tool. */
:root{
  color-scheme:dark;
  --ground:#0b1319; --panel:#13212a; --panel-2:#172732; --sunk:#0e1a21;
  --line:#223945; --line-soft:#1a2c36;
  --ink:#e8f0f2; --ink-2:#adc4cb; --muted:#7d97a1;
  --amber:#e8b45a; --teal:#35b7e0; --coral:#fc6847; --green:#71e666; --pink:#e57ec0; --fog:#f4eddf;
  --display:'Newsreader',Georgia,serif;
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--ground); color:var(--ink);
  font:14px/1.6 Archivo,'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
  word-break:keep-all; overflow-wrap:break-word; -webkit-font-smoothing:antialiased}
h1,h2{margin:0; text-wrap:balance}
a{color:inherit}
::selection{background:rgba(232,180,90,.3)}
.topAccent{height:3px; background:linear-gradient(90deg,var(--teal),var(--amber) 55%,var(--coral))}
.topbar{display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; justify-content:space-between;
  padding:16px 20px; border-bottom:1px solid var(--line-soft); background:var(--panel-2)}
.brandmark{font-family:var(--display); font-size:18px; color:var(--fog)}
.brandmark em{font-style:italic; color:var(--amber)}
.ranges{display:flex; border:1px solid var(--line); border-radius:5px; overflow:hidden; background:var(--sunk)}
.ranges a{padding:5px 11px; font-size:12px; color:var(--ink-2); text-decoration:none; border-right:1px solid var(--line-soft)}
.ranges a:last-child{border-right:0}
.ranges a:hover{color:var(--ink)}
.ranges a.active{background:var(--amber); color:#12100b; font-weight:600}
.wrap{max-width:1180px; margin:0 auto; padding-inline:20px; padding-block:28px 64px;
  display:flex; flex-direction:column; gap:26px}

.hero{display:grid; grid-template-columns:minmax(240px,320px) minmax(0,1fr); gap:16px}
@media (max-width:760px){.hero{grid-template-columns:minmax(0,1fr)}}
.heroMain{background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:20px;
  display:flex; flex-direction:column; justify-content:center; min-width:0; box-shadow:var(--shadow)}
.eyebrow{font-family:var(--display); font-style:italic; font-size:14px; color:var(--teal); margin:0 0 10px}
.heroMain .lab{font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted)}
.heroMain strong{font-size:clamp(40px,8vw,58px); font-weight:700; line-height:1.03; margin:3px 0 6px;
  color:var(--amber); font-variant-numeric:tabular-nums}
.heroSub{font-size:13px; color:var(--muted); margin:0}
.heroSub b.up{color:var(--green)} .heroSub b.down{color:var(--coral)}
.chips{display:flex; flex-wrap:wrap; gap:5px; margin-top:14px}
.chip{background:var(--sunk); border:1px solid var(--line); border-radius:100px; padding:3px 10px;
  font-size:11.5px; color:var(--ink-2); font-variant-numeric:tabular-nums}
.chip b{color:var(--teal); font-weight:600; margin-right:5px}
.chip.rest b{color:var(--muted)}
.heroChart{position:relative; background:var(--panel); border:1px solid var(--line); border-radius:8px;
  padding:16px 18px 14px; display:flex; flex-direction:column; gap:10px; min-width:0; box-shadow:var(--shadow)}
.chartHead{display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between}
.chartTitle{font-size:13px; font-weight:600; color:var(--ink-2)}
.chartTitle span{color:var(--muted); font-weight:400}
.chartBox{position:relative; height:168px; border:1px solid var(--line); border-radius:6px;
  background:var(--sunk); padding:17px 12px 8px}
.gridlines{position:absolute; inset:17px 12px 8px; pointer-events:none}
.gridlines i{position:absolute; left:0; right:0; border-top:1px dashed var(--line-soft)}
.gridlines b{position:absolute; right:0; top:-7px; font-size:9.5px; color:var(--muted);
  font-weight:400; font-variant-numeric:tabular-nums}
.bars{position:relative; z-index:1; height:100%; display:flex; align-items:flex-end; gap:3px}
.bar{flex:1 1 0; min-width:2px; height:100%; display:flex; align-items:flex-end; cursor:pointer}
.bar i{display:block; width:100%; background:#2a6f88; border-radius:2px 2px 0 0; transition:background .1s}
.bar:hover i,.bar:focus-visible i{background:#3f8fac}
.bar.now i{background:var(--amber); box-shadow:0 0 10px rgba(232,180,90,.5)}
.bar.now:hover i,.bar.now:focus-visible i{background:#f0c274}
.axis{display:flex; justify-content:space-between; font-size:10.5px; color:var(--muted); padding:0 12px}
.tooltip{position:absolute; z-index:5; background:#0c1a22; border:1px solid var(--teal); border-radius:6px;
  padding:8px 11px; font-size:12px; color:var(--ink); pointer-events:none; box-shadow:var(--shadow);
  white-space:nowrap; transform:translate(-50%,-100%); margin-top:-10px}
.tooltip b{color:var(--amber); font-variant-numeric:tabular-nums}
.tipDate{color:var(--muted); font-size:10.5px; display:block; margin-bottom:2px}

h2{font-size:14.5px; color:var(--ink-2); display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 8px}
h2 span{color:var(--muted); font-weight:400; font-size:12px}
code{background:var(--sunk); border:1px solid var(--line-soft); border-radius:3px; padding:1px 5px;
  font-size:11.5px; color:var(--ink-2); font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.strip{display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:8px; margin-top:12px}
.mini{background:var(--sunk); border:1px solid var(--line-soft); border-radius:6px; padding:10px 12px;
  display:flex; flex-direction:column; gap:2px; min-width:0}
.mini span{font-size:10.5px; letter-spacing:.05em; color:var(--muted);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.mini b{font-size:clamp(16px,3.2vw,20px); font-weight:600; color:var(--ink);
  font-variant-numeric:tabular-nums; overflow-wrap:anywhere}

.panelGrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px}
.panel{background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px 20px; box-shadow:var(--shadow)}
.panel.wide{grid-column:1 / -1}
.twoCol{display:grid; grid-template-columns:repeat(auto-fit,minmax(272px,1fr)); gap:22px; margin-top:6px}
.segLabel{font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 6px}

/* amber is reserved for "now / today"; every magnitude bar reads teal */
.ranklist{display:flex; flex-direction:column; margin-top:6px}
.rrow{display:grid; grid-template-columns:22px minmax(52px,132px) minmax(36px,1fr) auto;
  gap:10px; align-items:center; padding:6px 4px; border-radius:4px}
.rrow:hover{background:var(--sunk)}
.rank{font-size:10.5px; color:var(--muted); font-variant-numeric:tabular-nums; text-align:right}
.rlabel{font-size:12.5px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0}
.track{height:7px; background:var(--sunk); border:1px solid var(--line-soft); border-radius:4px; overflow:hidden; min-width:24px}
.fill{display:block; height:100%; background:var(--teal); border-radius:4px 0 0 4px}
.rval{font-size:12.5px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums;
  text-align:right; white-space:nowrap}
.rsub{color:var(--muted); font-weight:400; margin-left:5px}
.wideList{margin-top:16px}
.wideList .rrow{grid-template-columns:22px 82px minmax(36px,1fr) auto}

.funnel{display:flex; flex-direction:column; margin-top:10px}
.fstage,.fdrop{display:grid; grid-template-columns:minmax(64px,104px) minmax(40px,1fr) auto;
  gap:10px; align-items:center}
.flabel{font-size:12.5px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.ftrack{height:20px; background:var(--sunk); border:1px solid var(--line-soft); border-radius:4px; overflow:hidden}
.ffill{display:block; height:100%; background:linear-gradient(90deg,#2a6f88,var(--teal)); border-radius:3px 0 0 3px}
.fval{font-size:13px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap}
.fpct{color:var(--muted); font-weight:400; font-size:11.5px; margin-left:6px}
.fdrop{padding:4px 0; font-size:11px; color:var(--muted)}
.dropText{display:flex; align-items:center; gap:6px; font-variant-numeric:tabular-nums}
.dropText i{font-style:normal; color:var(--coral)}

.hist{display:flex; align-items:flex-end; gap:6px; height:118px; padding:8px 8px 0;
  background:var(--sunk); border:1px solid var(--line-soft); border-radius:6px; margin-top:10px}
.hcol{flex:1 1 0; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
  gap:4px; height:100%; min-width:0}
.hcol b{font-size:11px; font-weight:600; color:var(--ink-2); font-variant-numeric:tabular-nums}
.hcol i{display:block; width:100%; background:#2a6f88; border-radius:3px 3px 0 0}
.hcol.peak i{background:var(--teal)}
.histAxis{display:flex; gap:6px; padding:0 8px; margin-top:5px}
.histAxis span{flex:1 1 0; min-width:0; text-align:center; font-size:10px; line-height:1.3; color:var(--muted)}

.segWrap{margin-top:14px}
.segWrap:first-of-type{margin-top:10px}
.segbar{display:flex; height:16px; border-radius:8px; overflow:hidden; border:1px solid var(--line); background:var(--sunk)}
.segbar i{height:100%}
.legend{display:flex; flex-wrap:wrap; gap:10px 14px; margin-top:8px}
.lg{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-2)}
.lg i{width:9px; height:9px; border-radius:2px; display:inline-block}
.lg b{color:var(--ink); font-variant-numeric:tabular-nums; margin-left:2px}

.tw{overflow-x:auto; border:1px solid var(--line); border-radius:5px; margin-top:10px}
table{border-collapse:collapse; width:100%; font-size:13.5px}
th,td{text-align:left; padding:8px 12px; border-bottom:1px solid var(--line-soft)}
thead th{background:var(--sunk); font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted)}
tbody tr:last-child td{border-bottom:0}
td.num{text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2)}

.empty{color:var(--muted); font-size:12.5px; margin:10px 0 0; padding:14px;
  border:1px dashed var(--line); border-radius:5px}
.foot{margin:4px 0 0; padding-top:16px; border-top:1px solid var(--line-soft); color:var(--muted); font-size:12px}
.spike{background:rgba(252,104,71,.12); border:1px solid var(--coral); color:#ffcabb; padding:12px 15px;
  border-radius:6px; font-weight:600; font-size:13px}
.warnbar{background:rgba(252,104,71,.12); border:1px solid var(--coral); color:var(--coral);
  padding:10px 14px; border-radius:6px; font-size:13px}
.err{background:var(--panel); border:1px solid var(--coral); border-radius:6px; padding:18px}
.err h2{color:var(--coral); margin-bottom:8px}
pre{background:var(--sunk); border:1px solid var(--line); border-radius:4px; padding:12px;
  overflow-x:auto; font-size:12.5px; color:var(--ink-2)}

@media (max-width:480px){
  .wideList .rrow{grid-template-columns:18px 58px minmax(0,1fr) minmax(0,92px); gap:6px}
  .rlabel{font-size:12px}
  .rval{white-space:normal; font-size:12px}
}
</style></head><body>
<div class="topAccent"></div>
<header class="topbar">
  <div class="brandmark">Detail<em>Crop</em> \xB7 Ops</div>
  <div class="ranges">${rangeLinks}</div>
</header>
<div class="wrap">
${inner}
</div>
<script>
(function(){
  var box = document.getElementById('chart'), tip = document.getElementById('tip');
  if (!box || !tip) return;
  function show(bar){
    var r = bar.getBoundingClientRect(), w = tip.parentElement.getBoundingClientRect();
    tip.innerHTML = '<span class="tipDate">' + bar.dataset.d + '</span>\uBC29\uBB38 <b>' +
                    bar.dataset.v + '</b> \xB7 \uB0B4\uBCF4\uB0B4\uAE30 <b>' + bar.dataset.e + '</b>';
    tip.hidden = false;
    tip.style.left = Math.max(36, Math.min(r.left - w.left + r.width / 2, w.width - 36)) + 'px';
    tip.style.top = (r.top - w.top) + 'px';
  }
  function hide(){ tip.hidden = true; }
  box.addEventListener('mouseover', function(e){ var b = e.target.closest('.bar'); if (b) show(b); });
  box.addEventListener('focusin', function(e){ var b = e.target.closest('.bar'); if (b) show(b); });
  box.addEventListener('mouseleave', hide);
  box.addEventListener('focusout', hide);
  window.addEventListener('resize', hide);
})();
<\/script>
</body></html>`;
}
__name(shell, "shell");
async function todayJSON(request, env) {
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
  const visits = Math.round(Number(t.visits) || 0);
  const countries = (geo.rows || []).map((r) => ({ c: r.country || "?", n: Math.round(Number(r.visits) || 0) }));
  const shown = countries.reduce((a, c) => a + c.n, 0);
  const body = {
    visits,
    people: Math.round(Number(t.people) || 0),
    exports: Math.round(Number(t.exports) || 0),
    countries,
    rest: Math.max(0, visits - shown)
    // countries beyond the top 6
  };
  const res = Response.json(body, {
    headers: { "cache-control": "public, max-age=60", "x-robots-tag": "noindex" }
  });
  await cache.put(cacheKey, res.clone());
  return res;
}
__name(todayJSON, "todayJSON");

// src/google.js
var CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
var SKEW = 60;
var certs = null;
function b64urlDecode(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(b64urlDecode, "b64urlDecode");
async function loadCerts(force) {
  if (!force && certs && certs.until > Date.now()) return certs.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("google certs " + res.status);
  const body = await res.json();
  const keys = {};
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    keys[jwk.kid] = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  }
  const age = Number(((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/) || [])[1]) || 3600;
  certs = { keys, until: Date.now() + Math.min(age, 6 * 3600) * 1e3 };
  return keys;
}
__name(loadCerts, "loadCerts");
var decodeJson = /* @__PURE__ */ __name((part) => JSON.parse(new TextDecoder().decode(b64urlDecode(part))), "decodeJson");
async function verifyGoogleToken(token, clientId, nowSec) {
  if (typeof token !== "string" || token.length > 4096 || !clientId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload, sig;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
    sig = b64urlDecode(parts[2]);
  } catch (e) {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  let keys = await loadCerts(false);
  if (!keys[header.kid]) keys = await loadCerts(true);
  const key = keys[header.kid];
  if (!key) return null;
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig,
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!ok) return null;
  const now = nowSec || Math.floor(Date.now() / 1e3);
  if (ISSUERS.indexOf(payload.iss) === -1) return null;
  if (payload.aud !== clientId) return null;
  if (!(payload.exp > now - SKEW) || payload.iat && payload.iat > now + SKEW) return null;
  if (!payload.sub || !payload.email || !(payload.email_verified === true || payload.email_verified === "true")) return null;
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase().slice(0, 200) };
}
__name(verifyGoogleToken, "verifyGoogleToken");

// src/preset.js
var PRESET_V = 1;
var PRESET_MAX = 50;
var PRESET_NAME_MAX = 60;
var PRESET_RATIOS = {
  "free": [0, 0],
  "1:1": [1, 1],
  "4:5": [4, 5],
  "2:3": [2, 3],
  "3:4": [3, 4],
  "5:7": [5, 7],
  "16:9": [16, 9],
  "9:16": [9, 16],
  "custom": [0, 0]
};
var PRESET_FORMATS = ["image/webp", "image/jpeg", "image/png"];
var PRESET_BOXES = 6;
var PRESET_SIDE = 16384;
var PRESET_ID_RE = /^[a-z0-9]{6,24}$/;
function presetNum(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
__name(presetNum, "presetNum");
function presetInt(v, lo, hi, dflt) {
  return Math.round(presetNum(v, lo, hi, dflt));
}
__name(presetInt, "presetInt");
function presetText(v, max) {
  return String(v == null ? "" : v).normalize("NFC").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, max);
}
__name(presetText, "presetText");
function presetRatio(r) {
  if (!r || typeof r !== "object" || !Object.prototype.hasOwnProperty.call(PRESET_RATIOS, r.id)) return null;
  if (r.id === "custom") return { id: "custom", w: presetInt(r.w, 1, 999, 1), h: presetInt(r.h, 1, 999, 1) };
  const p = PRESET_RATIOS[r.id];
  return { id: r.id, w: p[0], h: p[1] };
}
__name(presetRatio, "presetRatio");
function cleanPreset(o) {
  if (!o || typeof o !== "object") return null;
  const name = presetText(o.name, PRESET_NAME_MAX);
  const id = typeof o.id === "string" && PRESET_ID_RE.test(o.id) ? o.id : null;
  if (!name || !id) return null;
  const r0 = o.ratio && typeof o.ratio === "object" ? o.ratio : {};
  const ratio = presetRatio(r0) || { id: "2:3", w: 2, h: 3 };
  ratio.scope = r0.scope === "one" ? "one" : "all";
  const locked = ratio.id !== "free";
  const o0 = o.out && typeof o.out === "object" ? o.out : {};
  const out = {
    mode: o0.mode === "fixed" && locked ? "fixed" : "native",
    w: presetInt(o0.w, 1, PRESET_SIDE, 1600),
    h: presetInt(o0.h, 1, PRESET_SIDE, 2400)
  };
  const L = o.layout && typeof o.layout === "object" ? o.layout : {};
  let grid = null;
  if (L.grid && typeof L.grid === "object" && locked) {
    const g = L.grid;
    grid = {
      cols: 3,
      rows: presetInt(g.rows, 1, 3, 1),
      x: presetNum(g.x, 0, 1, 0),
      y: presetNum(g.y, 0, 1, 0),
      w: presetNum(g.w, 0.12, 1, 0.92)
    };
  }
  const boxes = grid ? [] : (Array.isArray(L.boxes) ? L.boxes : []).slice(0, PRESET_BOXES).filter((b) => b && typeof b === "object").map((b) => {
    const w = presetNum(b.w, 0.02, 1, 0.3), h = presetNum(b.h, 0.02, 1, 0.3);
    return {
      x: presetNum(b.x, 0, 1 - w, 0),
      y: presetNum(b.y, 0, 1 - h, 0),
      w,
      h,
      r: ratio.scope === "one" ? presetRatio(b.r) : null
    };
  });
  return {
    v: PRESET_V,
    id,
    name,
    at: presetInt(o.at, 0, 1e13, 0),
    ratio,
    out,
    fmt: PRESET_FORMATS.indexOf(o.fmt) >= 0 ? o.fmt : "image/webp",
    quality: presetInt(o.quality, 40, 100, 86),
    pattern: presetText(o.pattern, 120) || "{name}-d{n}",
    layout: { grid, boxes }
  };
}
__name(cleanPreset, "cleanPreset");
function cleanPresetBook(o) {
  const list = [], seen = {};
  const src = o && typeof o === "object" && Array.isArray(o.list) ? o.list : [];
  for (const p of src) {
    if (list.length >= PRESET_MAX) break;
    const c = cleanPreset(p);
    if (c && !seen[c.id]) {
      seen[c.id] = 1;
      list.push(c);
    }
  }
  const last = o && typeof o.last === "string" && seen[o.last] ? o.last : "";
  return { list, last };
}
__name(cleanPresetBook, "cleanPresetBook");

// src/accounts.js
var SESSION_DAYS = 30;
var MAX_SESSIONS = 5;
function pub(user) {
  return {
    email: user.email,
    createdAt: user.createdAt,
    presets: user.presets || { list: [], last: "" }
  };
}
__name(pub, "pub");
var Accounts = class {
  static {
    __name(this, "Accounts");
  }
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(request) {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return reply({ error: "bad_json" }, 400);
    }
    const op = OPS[body && body.op];
    if (!op) return reply({ error: "bad_op" }, 400);
    try {
      return reply(await op.call(this, body));
    } catch (err) {
      console.error("accounts", body.op, err);
      return reply({ error: "server" }, 500);
    }
  }
};
var OPS = {
  /* after Google vouched for someone: make the account the first time */
  async login({ sub, email, now }) {
    let user = await this.storage.get("u:" + sub);
    const isNew = !user;
    if (!user) {
      user = { sub, email, createdAt: now, lastAt: now, sess: [], presets: { list: [], last: "" } };
      const m = await this.storage.get("meta") || { users: 0 };
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
    if (!(s.exp > now)) {
      await this.storage.delete("s:" + hash);
      return {};
    }
    const user = await this.storage.get("u:" + s.sub);
    if (!user) {
      await this.storage.delete("s:" + hash);
      return {};
    }
    return { sub: s.sub, user: pub(user) };
  },
  async sessionDelete({ hash }) {
    const s = await this.storage.get("s:" + hash);
    if (!s) return { ok: true };
    await this.storage.delete("s:" + hash);
    const user = await this.storage.get("u:" + s.sub);
    if (user) {
      user.sess = (user.sess || []).filter((h) => h !== hash);
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
      const i = book.list.findIndex((x) => x.id === p.id);
      if (i >= 0) book.list[i] = p;
      else {
        if (book.list.length >= PRESET_MAX) return { error: "full" };
        book.list.unshift(p);
      }
      book.last = p.id;
    } else if (c.kind === "del") {
      book.list = book.list.filter((x) => x.id !== c.id);
      if (book.last === c.id) book.last = "";
    } else if (c.kind === "last") {
      if (book.list.some((x) => x.id === c.id)) book.last = c.id;
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
    const m = await this.storage.get("meta") || { users: 0 };
    m.users = Math.max(0, (m.users || 0) - 1);
    await this.storage.put("meta", m);
    return { ok: true };
  },
  async stats() {
    return await this.storage.get("meta") || { users: 0 };
  }
};
function reply(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(reply, "reply");

// src/account-api.js
var MAX_BODY = 64 * 1024;
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
async function accountRoute(request, env, url) {
  try {
    return await route(request, env, url);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.code }, err.status);
    console.error("api", err);
    return json({ error: "server" }, 500);
  }
}
__name(accountRoute, "accountRoute");
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
__name(route, "route");
function loginReady(env) {
  return !!(env.GOOGLE_CLIENT_ID && env.ACCOUNTS);
}
__name(loginReady, "loginReady");
function needLogin(env) {
  if (!loginReady(env)) throw new HttpError(503, "login_off");
}
__name(needLogin, "needLogin");
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch (e) {
  }
  if (host !== new URL(request.url).host) throw new HttpError(403, "bad_origin");
}
__name(sameOrigin, "sameOrigin");
async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "too_big");
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    throw new HttpError(400, "bad_json");
  }
}
__name(readJson, "readJson");
async function limited(binding, key) {
  if (!binding || typeof binding.limit !== "function") return;
  const { success } = await binding.limit({ key });
  if (!success) throw new HttpError(429, "too_many");
}
__name(limited, "limited");
function accounts(env, op, args) {
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("all"));
  return stub.fetch("https://accounts/", {
    method: "POST",
    body: JSON.stringify(Object.assign({ op }, args || {}))
  }).then((r) => r.json());
}
__name(accounts, "accounts");
async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return b64url(d);
}
__name(sha256, "sha256");
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function bearer(request) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/);
  return m ? m[1] : null;
}
__name(bearer, "bearer");
async function sessionUser(request, env) {
  needLogin(env);
  const token = bearer(request);
  if (!token) throw new HttpError(401, "need_login");
  const hash = await sha256("sess:" + token);
  const got = await accounts(env, "sessionGet", { hash, now: Date.now() });
  if (!got.user) throw new HttpError(401, "need_login");
  return { user: got.user, sub: got.sub, hash };
}
__name(sessionUser, "sessionUser");
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
  await accounts(env, "sessionCreate", {
    sub: g.sub,
    hash: await sha256("sess:" + token),
    exp: now + SESSION_DAYS * 86400 * 1e3
  });
  return json({ session: token, user: r.user, isNew: r.isNew });
}
__name(googleLogin, "googleLogin");
async function logout(request, env) {
  needLogin(env);
  const token = bearer(request);
  if (token) await accounts(env, "sessionDelete", { hash: await sha256("sess:" + token) });
  return json({ ok: true });
}
__name(logout, "logout");
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
__name(changePresets, "changePresets");
async function deleteMe(request, env) {
  const s = await sessionUser(request, env);
  const body = await readJson(request);
  if (body.confirm !== true) throw new HttpError(400, "need_confirm");
  await accounts(env, "userDelete", { sub: s.sub });
  return json({ ok: true });
}
__name(deleteMe, "deleteMe");
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(json, "json");

// src/index.js
var ALLOWED_EVENTS = /* @__PURE__ */ new Set([
  "visit",
  "add",
  "export",
  "skip",
  "use",
  "tour",
  "why",
  "preset",
  "vvisit",
  "vexport"
]);
var MAX_BODY2 = 1024;
var BOT_UA = /bot|crawler|spider|crawl|slurp|headless|phantom|puppeteer|playwright|python-requests|curl\/|wget|scrapy|monitor|preview|fetch|http-client|axios|okhttp/;
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/e") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return recordEvent(request, env);
    }
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/today") {
      return accountRoute(request, env, url);
    }
    if (url.pathname === "/stats") return statsPage(request, env);
    if (url.pathname === "/api/today") return todayJSON(request, env);
    const res = await env.ASSETS.fetch(request);
    if (url.hostname.endsWith(".workers.dev")) {
      const out = new Response(res.body, res);
      out.headers.set("x-robots-tag", "noindex, nofollow");
      return out;
    }
    return res;
  }
};
async function recordEvent(request, env) {
  if (!env.EVENTS) return noContent();
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return noContent();
  let d;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY2) return noContent();
    d = JSON.parse(raw);
  } catch {
    return noContent();
  }
  if (!d || typeof d !== "object" || !ALLOWED_EVENTS.has(d.e)) return noContent();
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua || BOT_UA.test(ua)) return noContent();
  const str = /* @__PURE__ */ __name((v, max) => typeof v === "string" ? v.slice(0, max) : "", "str");
  const num2 = /* @__PURE__ */ __name((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }, "num");
  const cf = request.cf || {};
  const vw = num2(d.w);
  env.EVENTS.writeDataPoint({
    indexes: [str(d.e, 32)],
    blobs: [
      str(d.e, 32),
      // blob1  event (ALLOWED_EVENTS above)
      str(d.lang, 8),
      // blob2  ui language
      str(cf.country, 4),
      // blob3  country
      str(d.ref, 64),
      // blob4  referrer host
      str(d.ratio, 16),
      // blob5  crop ratio preset, or "mixed"
      str(d.fmt, 16),
      // blob6  output format (video: codec)
      str(d.out, 8),
      // blob7  native | fixed
      str(d.id, 24),
      // blob8  anonymous id
      vw > 0 && vw < 820 ? "mobile" : "desktop",
      // blob9  device class
      str(d.feat, 24)
      // blob10 feature key ('use') / purpose ('why') / save|load ('preset')
    ],
    doubles: [
      num2(d.v),
      // double1  visit number for this browser
      num2(d.n),
      // double2  images in the batch (video: clips; preset: presets in the account)
      num2(d.iw),
      // double3  median image width ('add', 'vexport')
      num2(d.ih),
      // double4  median image height ('add', 'vexport')
      num2(d.mb),
      // double5  median file size, MB
      num2(d.crops),
      // double6  crops exported
      num2(d.ow),
      // double7  output width  (fixed mode only)
      num2(d.oh),
      // double8  output height (fixed mode only)
      num2(d.q),
      // double9  quality
      num2(d.sample),
      // double10 1 = only the demo plate was exported
      num2(d.grid),
      // double11 tiles, when a feed grid was used (0 = free crops)
      num2(d.bad),
      // double12 files rejected for not being images
      num2(d.huge),
      // double13 files past the canvas side limit
      num2(d.rot),
      // double14 largest straighten angle used, degrees
      num2(d.persp),
      // double15 largest keystone slider used, 0-100
      num2(d.secs),
      // double16 seconds from first add to export ('export' events)
      num2(d.step)
      // double17 walkthrough step reached ('tour' events)
    ]
  });
  return noContent();
}
__name(recordEvent, "recordEvent");
function noContent() {
  return new Response(null, { status: 204 });
}
__name(noContent, "noContent");

// ../../../tmp/claude-0/-home-user-Detailcrop-com/8ecfa25c-96f7-5899-99b0-4df8284a4704/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../tmp/claude-0/-home-user-Detailcrop-com/8ecfa25c-96f7-5899-99b0-4df8284a4704/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-bMQaVl/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../tmp/claude-0/-home-user-Detailcrop-com/8ecfa25c-96f7-5899-99b0-4df8284a4704/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-bMQaVl/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Accounts,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
