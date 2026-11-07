// The /stats page: referrers grouped, AI answer engines counted on their own.
// Analytics Engine is played by a fetch stub that answers by query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statsPage, refGroup, AI_HOSTS } from "../src/stats.js";

test("referrer hosts fall into five groups", () => {
  for (const h of AI_HOSTS) assert.equal(refGroup(h), "AI 검색", h);
  for (const h of ["www.perplexity.ai", "CHATGPT.COM", "chat.openai.com", "gemini.google.com"]) assert.equal(refGroup(h), "AI 검색", h);
  for (const h of ["www.google.com", "google.co.kr", "search.naver.com", "m.search.naver.com", "www.bing.com", "duckduckgo.com", "search.yahoo.co.jp"]) assert.equal(refGroup(h), "검색 엔진", h);
  for (const h of ["t.co", "m.facebook.com", "l.instagram.com", "blog.naver.com", "cafe.naver.com", "www.reddit.com", "youtube.com"]) assert.equal(refGroup(h), "SNS·커뮤니티", h);
  for (const h of ["", null, "detailcrop.com", "www.detailcrop.com"]) assert.equal(refGroup(h), "직접", String(h));
  for (const h of ["example.com", "notchatgpt.com", "claude.ai.evil.com", "newsletter"]) assert.equal(refGroup(h), "기타", h);
});

test("the AI panel counts visits, share, exports and conversion", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    const sql = String(o.body);
    let data = [];
    if (/blob1 AS ev/.test(sql)) data = [
      { ref: "", ev: "visit", n: 50, people: 40 },
      { ref: "www.google.com", ev: "visit", n: 30, people: 25 },
      { ref: "chatgpt.com", ev: "visit", n: 12, people: 10 },
      { ref: "chatgpt.com", ev: "export", n: 4, people: 3 },
      { ref: "www.perplexity.ai", ev: "visit", n: 8, people: 5 },
      { ref: "www.perplexity.ai", ev: "export", n: 2, people: 2 }
    ];
    else if (/blob4 AS ref, sum/.test(sql)) data = [
      { day: "2026-11-01 00:00:00", ref: "chatgpt.com", visits: 7 },
      { day: "2026-11-02 00:00:00", ref: "www.perplexity.ai", visits: 8 },
      { day: "2026-11-02 00:00:00", ref: "www.google.com", visits: 9 }
    ];
    else if (/toStartOfDay\(timestamp\) AS day,\s+sumIf/.test(sql)) data = [
      { day: "2026-11-01 00:00:00", visits: 60, exports: 3 }, { day: "2026-11-02 00:00:00", visits: 40, exports: 3 }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  try {
    const key = "k".repeat(20);
    const res = await statsPage(new Request("https://detailcrop.com/stats?k=" + key), { STATS_KEY: key, CF_API_TOKEN: "t", CF_ACCOUNT_ID: "a" });
    const html = await res.text();
    const panel = html.slice(html.indexOf("<h2>AI 검색"), html.indexOf("</section>", html.indexOf("<h2>AI 검색")));
    assert.ok(panel.length > 0, "AI panel present");
    assert.match(panel, /AI 검색 방문<\/span><b>20</);
    assert.match(panel, /전체 방문 중<\/span><b>20\.0%</);       // 20 of 100
    assert.match(panel, /내보내기<\/span><b>6</);
    assert.match(panel, /전환율<\/span><b>33\.3%</);             // 5 of 15 people
    assert.ok(panel.includes("chatgpt.com") && panel.includes("www.perplexity.ai") && !panel.includes("www.google.com"));
    assert.equal((panel.match(/class="bar"/g) || []).length, 2, "one bar per day");
    assert.ok(panel.includes("google.com·bing.com"), "the limit is written down");
    assert.ok(html.includes("AI 검색 <b>20%</b>"), "the grouped bar carries the AI share");
  } finally {
    globalThis.fetch = realFetch;
  }
});
