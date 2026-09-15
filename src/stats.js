/**
 * /stats — a read-only dashboard over the Analytics Engine dataset.
 *
 * Exists so nobody has to write SQL to answer "did traffic just spike?".
 * Guarded by ?k=<STATS_KEY>; without the right key it 404s like any other
 * missing path, so the endpoint does not advertise itself.
 *
 * The window is ?d=<days> (7 / 14 / 30 / 90, default 30). It is parsed to an
 * integer and clamped before it ever reaches the SQL string.
 *
 * Panels marked "새 이벤트 필요" below read fields the page does not send yet
 * (double16, double17, blob10). They render an empty state until the events
 * are wired up in template.html — see UPGRADE.md.
 */

const DATASET = "detailcrop_events";
const RANGES = [7, 14, 30, 90];
const DEFAULT_DAYS = 30;

/* Feature keys the page reports via track("use", {feat}) → readable labels. */
const FEATURE_LABELS = {
  auto:   "자동 배치",
  spread: "균등 배치",
  wide:   "와이드 모드",
  nudge:  "화살표 미세조정",
  custom: "커스텀 비율",
  grid:   "격자(피드 분할)",
  rot:    "회전 보정",
  persp:  "왜곡 보정",
  sample: "샘플 이미지"
};
/* Walkthrough steps, in the order TOUR[] defines them in the page. */
const TOUR_LABELS = ["크롭 박스", "컷 개수", "컷 목록", "비율", "필름스트립", "내보내기"];

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
    </div>`, DEFAULT_DAYS, key), 200);
  }

  // Never interpolate the raw param: parse, clamp, and only then build SQL.
  const asked = parseInt(url.searchParams.get("d"), 10);
  const days = RANGES.includes(asked) ? asked : DEFAULT_DAYS;

  const W = `timestamp > NOW() - INTERVAL '${days}' DAY`;
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
      dataset has no rows yet.</p></div>`, days, key), 200);
  }

  return html(shell(render(R, days, failed, weakKey), days, key), 200);
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

/* ---------- formatting ---------- */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString("ko-KR");
const n1 = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString("ko-KR");
const num = (v) => Number(v) || 0;
const first = (q) => ((q && q.rows) || [])[0] || {};
const share = (a, b) => (b > 0 ? (a / b * 100) : 0);

/* Seconds → "3분 08초" / "42초" / "1시간 12분". */
function dur(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return "—";
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}

/* ---------- components ---------- */
function mini(label, value) {
  return `<div class="mini"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

/* Ranked rows with an inline bar. scaleMax pins the bars to an absolute scale
   (pass 100 for share data) instead of stretching the top row to full width,
   which would make a 34% feature look universal. */
function rankList(rows, opts) {
  opts = opts || {};
  if (!rows.length) return empty(opts.emptyNote);
  const max = opts.scaleMax || Math.max(1, ...rows.map(r => num(r.value)));
  return `<div class="ranklist">` + rows.map((r, i) => {
    const pct = Math.max(2, Math.min(100, num(r.value) / max * 100));
    return `<div class="rrow">
      <span class="rank">${i + 1}</span>
      <span class="rlabel">${esc(r.label)}</span>
      <span class="track"><span class="fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="rval">${esc(r.display != null ? r.display : n0(r.value))}${
        r.sub ? `<span class="rsub">${esc(r.sub)}</span>` : ""}</span>
    </div>`;
  }).join("") + `</div>`;
}

/* Funnel: every stage measured against the first, with the loss between. */
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
      <span class="dropText"><i>↓</i> ${n0(lost)} 이탈 · ${share(lost, num(s.n)).toFixed(1)}%</span>
      <span></span></div>`;
  }).join("") + `</div>`;
}

/* Histogram over ordered buckets. Bars are sized in px so the label above each
   column always has room. */
function histogram(buckets, opts) {
  opts = opts || {};
  const peak = Math.max(...buckets.map(b => num(b.n)));
  if (!peak) return empty(opts.emptyNote);
  const MAXH = 84;
  return `<div class="hist">` + buckets.map(b =>
    `<span class="hcol${num(b.n) === peak ? " peak" : ""}">
       <b>${n0(b.n)}</b>
       <i style="height:${Math.max(3, Math.round(num(b.n) / peak * MAXH))}px"></i>
     </span>`).join("") + `</div>
    <div class="histAxis">${buckets.map(b => `<span>${esc(b.label)}</span>`).join("")}</div>`;
}

/* Proportion bar for a part-to-whole split, always directly labelled so the
   colours are never the only thing carrying identity. */
const SEG_COLORS = ["var(--teal)", "var(--amber)", "var(--pink)", "var(--fog)"];
function segBar(label, rows) {
  const total = rows.reduce((a, r) => a + num(r.n), 0);
  if (!total) return "";
  return `<div class="segWrap">
    <p class="segLabel">${esc(label)}</p>
    <div class="segbar">${rows.map((r, i) =>
      `<i style="width:${(num(r.n) / total * 100).toFixed(2)}%; background:${SEG_COLORS[i % SEG_COLORS.length]}"></i>`).join("")}</div>
    <div class="legend">${rows.map((r, i) =>
      `<span class="lg"><i style="background:${SEG_COLORS[i % SEG_COLORS.length]}"></i>${esc(r.label)} <b>${Math.round(share(num(r.n), total))}%</b></span>`).join("")}</div>
  </div>`;
}

function table(head, rows) {
  if (!rows.length) return empty();
  return `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) =>
      `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function empty(note) {
  return `<p class="empty">${esc(note || "아직 데이터가 없습니다.")}</p>`;
}

/* ---------- the page ---------- */
function render(R, days, failed, weakKey) {
  const t   = first(R.today);
  const y   = first(R.yday);
  const m   = first(R.month);
  const img = first(R.images);
  const sk  = first(R.skips);
  const dw  = first(R.dwell);
  const daily = R.daily.rows || [];

  const tv = num(t.visits), yv = num(y.visits);
  const delta = yv > 0 ? Math.round((tv - yv) / yv * 100) : null;
  const prior = daily.slice(0, -1);
  const avg = prior.length ? prior.reduce((a, d) => a + num(d.visits), 0) / prior.length : 0;
  const spiking = avg > 0 && tv > avg * 3 && tv >= 20;

  /* daily chart */
  const peak = Math.max(1, ...daily.map(d => num(d.visits)));
  const every = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 5 : 15;
  const bars = daily.map((d, i) => {
    const v = num(d.visits);
    const label = String(d.day || "").slice(5, 10);
    const last = i === daily.length - 1;
    return `<div class="bar${last ? " now" : ""}" tabindex="0"
      data-d="${esc(label)}" data-v="${n0(v)}" data-e="${n0(d.exports)}"
      aria-label="${esc(label)} 방문 ${n0(v)} 내보내기 ${n0(d.exports)}">
      <i style="height:${Math.max(2, Math.round(v / peak * 100))}%"></i></div>`;
  }).join("");
  const axis = daily.map((d, i) =>
    (i % every === 0 || i === daily.length - 1)
      ? `<span>${esc(String(d.day || "").slice(5, 10))}</span>` : "").join("");

  /* today's geography */
  const geoRows = R.todayGeo.rows || [];
  const geoShown = geoRows.reduce((a, r) => a + num(r.visits), 0);
  const geoRest = Math.max(0, tv - geoShown);
  const geo = geoRows.map(r =>
    `<span class="chip"><b>${esc(r.country || "?")}</b>${n0(r.visits)}</span>`).join("")
    + (geoRest ? `<span class="chip rest"><b>기타</b>${n0(geoRest)}</span>` : "");

  /* funnel — one grouped query, unpacked by event name */
  const byStep = {};
  (R.funnel.rows || []).forEach(r => { byStep[r.step] = num(r.people); });
  const funnelStages = [
    { label: "방문",        n: byStep.visit  || 0 },
    { label: "이미지 올림", n: byStep.add    || 0 },
    { label: "내보내기",    n: byStep.export || 0 }
  ];
  const uploaded = funnelStages[1].n, exported = funnelStages[2].n;
  const abandoned = Math.max(0, uploaded - exported);

  /* dwell */
  const dwellBuckets = [
    { label: "30초 미만", n: dw.b1 }, { label: "30초~2분", n: dw.b2 },
    { label: "2~5분", n: dw.b3 }, { label: "5~15분", n: dw.b4 }, { label: "15분+", n: dw.b5 }
  ];
  const dwellTotal = dwellBuckets.reduce((a, b) => a + num(b.n), 0);

  /* features — share of the people who actually exported */
  const featRows = (R.features.rows || []).map(r => ({
    label: FEATURE_LABELS[r.feat] || r.feat || "?",
    value: exported > 0 ? share(num(r.people), exported) : 0,
    display: exported > 0 ? Math.round(share(num(r.people), exported)) + "%" : "—",
    sub: `${n0(r.people)}명`
  }));

  /* tour retention + where it loses people fastest */
  const tourRows = (R.tour.rows || []).map(r => {
    const i = Math.round(num(r.step));
    return { label: `${i} · ${TOUR_LABELS[i - 1] || "?"}`, n: num(r.people) };
  });
  const started = tourRows.length ? tourRows[0].n : 0;
  const finished = tourRows.length ? tourRows[tourRows.length - 1].n : 0;
  let worst = { at: "—", pct: 0 };
  tourRows.forEach((s, i) => {
    const next = tourRows[i + 1];
    if (!next || !s.n) return;
    const p = share(s.n - next.n, s.n);
    if (p > worst.pct) worst = { at: `${i + 1}→${i + 2}단계`, pct: p };
  });

  /* devices / languages, folded out of the device×lang cross tab */
  const devRows = R.devices.rows || [];
  const sumBy = (keyName) => {
    const acc = {};
    devRows.forEach(r => { const k = r[keyName] || "?"; acc[k] = (acc[k] || 0) + num(r.visits); });
    return Object.keys(acc).map(k => ({ label: k, n: acc[k] })).sort((a, b) => b.n - a.n);
  };
  const LANG_LABELS = { en: "영어", ko: "한국어", ja: "일본어" };
  const DEV_LABELS = { desktop: "데스크톱", mobile: "모바일" };
  const deviceSplit = sumBy("device").map(r => ({ label: DEV_LABELS[r.label] || r.label, n: r.n }));
  const langSplit = sumBy("lang").map(r => ({ label: LANG_LABELS[r.label] || r.label, n: r.n }));

  const NOT_YET = "아직 수집 전입니다 — template.html에 track() 추가가 필요합니다.";

  return `
  ${weakKey ? `<div class="warnbar">이 페이지의 키가 짧습니다. <code>STATS_KEY</code>를 긴 무작위 문자열로 바꾸세요.</div>` : ""}
  ${failed.length ? `<div class="warnbar">불러오지 못한 패널: ${failed.map(esc).join(", ")}</div>` : ""}
  ${spiking ? `<div class="spike">오늘 ${n0(tv)}회 — 최근 ${days}일 평균(${n1(avg)})의 ${Math.round(tv / avg)}배입니다. 유입 경로를 확인하세요.</div>` : ""}

  <section class="hero">
    <div class="heroMain">
      <p class="eyebrow">오늘, 한눈에</p>
      <span class="lab">오늘 방문</span>
      <strong>${n0(tv)}</strong>
      <p class="heroSub">
        ${t.people ? `${n0(t.people)}명` : "—"}${t.exports ? ` · 내보내기 ${n0(t.exports)}` : ""}${
          delta === null ? "" : ` · 어제 대비 <b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}%</b>`}
      </p>
      ${geo ? `<div class="chips">${geo}</div>` : ""}
    </div>
    <div class="heroChart">
      <div class="chartHead"><span class="chartTitle">일별 방문 <span>· ${days}일</span></span></div>
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
    <h2>기간 요약 <span>· 최근 ${days}일</span></h2>
    <div class="strip">
      ${mini("방문", n0(m.visits))}
      ${mini("사람", n0(m.people))}
      ${mini("내보내기", n0(m.exports))}
      ${mini("뽑은 컷", n0(m.crops))}
      ${mini("전환", num(m.visits) > 0 ? Math.round(share(num(m.exports), num(m.visits))) + "%" : "—")}
    </div>
  </section>

  <section class="panel wide">
    <h2>끝까지 가는가 <span>방문 → 올림 → 내보내기 · 사람 기준 · ${days}일</span></h2>
    <div class="twoCol">
      <div>
        <p class="segLabel">퍼널</p>
        ${funnelBlock(funnelStages)}
      </div>
      <div>
        <p class="segLabel">올리고 나서 내보내기까지 걸린 시간</p>
        <div class="strip">
          ${mini("평균 체류", dwellTotal ? dur(dw.mean) : "—")}
          ${mini("올리고 안 내보냄", n0(abandoned))}
          ${mini("미완료율", uploaded > 0 ? share(abandoned, uploaded).toFixed(1) + "%" : "—")}
        </div>
        ${histogram(dwellBuckets, { emptyNote: NOT_YET })}
      </div>
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>어디서 오는가 <span>국가별 방문 · ${days}일</span></h2>
      ${rankList((R.countries.rows || []).map(r => ({
        label: r.country || "?", value: num(r.visits), sub: `내보내기 ${n0(r.exports)}`
      })))}
    </div>
    <div class="panel">
      <h2>어디서 오는가 <span>유입 경로 · ${days}일</span></h2>
      ${rankList((R.referrers.rows || []).map(r => ({
        label: r.ref || "직접 / 북마크", value: num(r.visits)
      })))}
    </div>
  </section>

  <section class="panel wide">
    <h2>무엇을 자르는가 <span>올린 이미지와 고른 설정 · ${days}일</span></h2>
    <div class="strip">
      ${mini("평균 장수", n1(img.imgs))}
      ${mini("평균 해상도", `${n0(img.w)}×${n0(img.h)}`)}
      ${mini("평균 용량", n1(img.mb) + "MB")}
      ${mini("업로드", n0(img.batches) + "회")}
      ${mini("용량 초과 거부", n0(sk.files) + "장")}
      ${mini("최대 거부 파일", sk.biggest_mb ? n1(sk.biggest_mb) + "MB" : "—")}
    </div>
    <div class="wideList">
      ${rankList((R.settings.rows || []).map(r => ({
        label: `${r.ratio || "?"} ${(r.fmt || "").replace("image/", "")}`,
        value: num(r.exports),
        sub: `건 · 평균 ${n1(r.crops)}컷${num(r.grid_runs) ? ` · 격자 ${n0(r.grid_runs)}` : ""}`
      })))}
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>무엇을 쓰는가 <span>내보낸 사람 중 사용률 · ${days}일</span></h2>
      ${rankList(featRows, { scaleMax: 100, emptyNote: NOT_YET })}
    </div>
    <div class="panel">
      <h2>투어는 먹히는가 <span>단계별 잔존 · ${days}일</span></h2>
      ${tourRows.length ? `<div class="strip">
        ${mini("투어 시작", n0(started))}
        ${mini("방문 대비", num(m.people) > 0 ? share(started, num(m.people)).toFixed(1) + "%" : "—")}
        ${mini("완주", started > 0 ? share(finished, started).toFixed(1) + "%" : "—")}
        ${mini("최대 이탈", worst.at)}
      </div>` : ""}
      <div style="margin-top:14px">${funnelBlock(tourRows, { emptyNote: NOT_YET })}</div>
    </div>
  </section>

  <section class="panelGrid">
    <div class="panel">
      <h2>다시 오는가 <span>방문 횟수별 사람 · ${days}일</span></h2>
      ${rankList((R.repeat.rows || []).map(r => ({
        label: `${n0(r.visit_no)}번째 방문`, value: num(r.people)
      })))}
    </div>
    <div class="panel">
      <h2>무엇으로 보는가 <span>기기 · 언어 · ${days}일</span></h2>
      ${deviceSplit.length ? segBar("기기", deviceSplit) : empty()}
      ${langSplit.length ? segBar("언어", langSplit) : ""}
    </div>
  </section>

  <p class="foot">봇과 헤드리스 브라우저는 집계에서 제외됩니다. 이미지 자체는 이 Worker에 도달하지 않습니다.</p>`;
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store",
               "x-robots-tag": "noindex, nofollow" }
  });
}

function shell(inner, days, key) {
  const q = encodeURIComponent(key || "");
  const rangeLinks = RANGES.map(r =>
    `<a class="${r === days ? "active" : ""}" href="?k=${q}&amp;d=${r}">${r}일</a>`).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>DetailCrop 통계</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap">
<style>
/* Tokens are the product's own palette — committed dark, same as the tool. */
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
  <div class="brandmark">Detail<em>Crop</em> · Ops</div>
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
    tip.innerHTML = '<span class="tipDate">' + bar.dataset.d + '</span>방문 <b>' +
                    bar.dataset.v + '</b> · 내보내기 <b>' + bar.dataset.e + '</b>';
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
</script>
</body></html>`;
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
  const visits = Math.round(Number(t.visits) || 0);
  const countries = (geo.rows || []).map(r => ({ c: r.country || "?", n: Math.round(Number(r.visits) || 0) }));
  const shown = countries.reduce((a, c) => a + c.n, 0);
  const body = {
    visits,
    people: Math.round(Number(t.people) || 0),
    exports: Math.round(Number(t.exports) || 0),
    countries,
    rest: Math.max(0, visits - shown)   // countries beyond the top 6
  };

  const res = Response.json(body, {
    headers: { "cache-control": "public, max-age=60", "x-robots-tag": "noindex" }
  });
  await cache.put(cacheKey, res.clone());
  return res;
}
