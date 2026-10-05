import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import homeHandler from "../../api/prerender-home.js";
import { buildSellGuidePages } from "../../build/sellGuideHtml.js";
import { SELL_GUIDE_META, SELL_GUIDE_FAQS } from "./sellGuideContent.js";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

function responseRecorder() {
  return {
    headers: {}, code: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; },
    json(body) { this.body = body; },
    end() {},
  };
}

function configureHomeTest(t, fetchImpl) {
  const env = { SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "test-only" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.mock.method(globalThis, "fetch", fetchImpl);
}

test("홈 검색 문서는 현재 BEST와 판매 안내를 제공하고 삭제한 홈 영역은 수집하지 않는다", async (t) => {
  const calls = [];
  configureHomeTest(t, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json([
      { product_id: 376, title: '<script>alert("x")</script> 교재', price: 12000, available_option_count: 1 },
      { product_id: 376, title: "중복 교재", price: 12000 },
    ]);
  });
  const res = responseRecorder();
  await homeHandler({ method: "GET" }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(calls, [{ p_sort: "popular", p_limit: 12, p_offset: 0 }]);
  const body = res.body.split("<body>")[1];
  assert.match(body, /최근 30일, 가장 많은 주문에서 선택한 교재/);
  assert.match(body, /풀지않은 교재를 쉽게 판매하고 싶으신가요/);
  assert.match(body, /href="https:\/\/subook.kr\/sell"/);
  assert.doesNotMatch(body, /신규 입고|따끈따끈|시리즈별 교재|강사별 교재|집에 쌓인 교재|현재 판매 중인 검수 완료/);
  assert.match(body, /&lt;script&gt;/);
  assert.doesNotMatch(body, /<script>|중복 교재/);
  assert.equal(res.headers.Vary, "User-Agent");
});

test("홈 조회의 일시 장애는 재시도하고 계속 실패하면 빈 홈 대신 503을 반환한다", async (t) => {
  let attempts = 0;
  configureHomeTest(t, async () => { attempts += 1; return new Response("unavailable", { status: 503 }); });
  const res = responseRecorder();
  await homeHandler({ method: "GET" }, res);
  assert.equal(attempts, 2);
  assert.equal(res.code, 503);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("홈 재시도가 성공하면 정상 문서를 제공한다", async (t) => {
  let attempts = 0;
  configureHomeTest(t, async () => ++attempts === 1
    ? new Response("unavailable", { status: 502 }) : Response.json([]));
  const res = responseRecorder();
  await homeHandler({ method: "GET" }, res);
  assert.equal(attempts, 2);
  assert.equal(res.code, 200);
  assert.match(res.body, /<h1>수북 SUBOOK/);
  assert.doesNotMatch(res.body, /noindex/);
});

test("판매 안내의 초기 HTML은 사람과 검색로봇 모두 고유 메타와 대표 주소를 가진다", () => {
  const { clientHtml, crawlerHtml } = buildSellGuidePages(indexHtml);
  for (const html of [clientHtml, crawlerHtml]) {
    assert.match(html, /<title>교재 판매 안내 \| 수북 SUBOOK<\/title>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/subook.kr\/sell"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/subook.kr\/sell"/);
    assert.ok(html.includes(SELL_GUIDE_META.description));
    assert.match(html, /name="naver-site-verification"/);
    assert.doesNotMatch(html, /<link rel="canonical" href="https:\/\/subook.kr\/"/);
    assert.doesNotMatch(html, /noindex/);
  }
  assert.match(clientHtml, /<div id="root"><\/div>/);
  assert.match(clientHtml, /<script type="module" src="\/src\/main.jsx"><\/script>/);
  assert.match(clientHtml, /<noscript><header>/);
  assert.doesNotMatch(crawlerHtml, /id="root"|<noscript>|type="module"|gtag\(/);
});

test("판매 안내의 비용·조건·FAQ를 검색 문서에 보존하고 삭제한 정책 전환 문구는 넣지 않는다", () => {
  const { crawlerHtml } = buildSellGuidePages(indexHtml);
  assert.match(crawlerHtml, /2026·2027 교재/);
  assert.match(crawlerHtml, /<dd>45%<\/dd>/);
  assert.match(crawlerHtml, /<dd>50%<\/dd>/);
  assert.match(crawlerHtml, /박스당 5,000원/);
  assert.match(crawlerHtml, /매월 1일/);
  assert.match(crawlerHtml, /href="\/pickup\/new"/);
  assert.doesNotMatch(crawlerHtml, /변경된 수수료는 정책 시행/);
  for (const faq of SELL_GUIDE_FAQS) {
    assert.ok(crawlerHtml.includes(faq.question));
    assert.ok(crawlerHtml.includes(faq.answer));
  }
});

test("초기 템플릿에 필수 메타가 없어지면 잘못된 문서를 배포하지 않고 빌드를 중단한다", () => {
  assert.throws(() => buildSellGuidePages(indexHtml.replace(/<link rel="canonical"[^>]*>/, "")), /canonical 없음/);
});

test("판매 안내 rewrite는 검색로봇·방문자 문서를 SPA fallback보다 먼저 선택한다", () => {
  const config = JSON.parse(readFileSync(new URL("../../vercel.deploy.json", import.meta.url), "utf8"));
  const sell = config.rewrites.filter((rule) => rule.source === "/sell");
  assert.equal(sell.length, 2);
  const uaRule = sell[0].has.find((condition) => condition.key === "user-agent");
  const bot = new RegExp(uaRule.value.replace("(?i)", ""), "i");
  assert.ok(bot.test("Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"));
  assert.ok(!bot.test("Mozilla/5.0 Chrome/140 Safari/537.36"));
  assert.equal(sell[0].destination, "/sell-crawler.html");
  assert.equal(sell[1].destination, "/sell-page.html");
  assert.ok(config.rewrites.indexOf(sell[1]) < config.rewrites.findIndex((rule) => rule.source === "/:path*"));
});
