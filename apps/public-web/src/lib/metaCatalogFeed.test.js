import test from "node:test";
import assert from "node:assert/strict";
import { buildMetaCatalogFeed, serializeMetaCatalogRows } from "../../../../packages/shared-domain/src/metaCatalogFeed.js";
import { readMetaCatalogSnapshot } from "../../../../packages/shared-supabase/src/metaCatalogFeedClient.js";
import handler from "../../api/meta-catalog.js";

const product = (id, extra = {}) => ({ id, title: `교재 ${id}`, brand: "전일학원", subject: "국어", book_type: "모의고사", status: "selling", cover_image_url: "https://subook.kr/cover.png", ...extra });
const book = (id, productId, extra = {}) => ({ id, product_id: productId, price: 59000, original_price: 108000, status: "on_sale", is_public: true, condition_grade: "S", ...extra });
const snapshot = (extra = {}) => ({ products: [product(2370)], books: [book(1, 2370)], preReleases: [], ...extra });

test("기본 피드는 기존 전일학원 3종만, 전체 피드는 사이트/픽셀 ID를 함께 유지한다", () => {
  const data = snapshot({ products: [2370, 2371, 2437, 2500].map((id) => product(id)), books: [2370, 2371, 2437, 2500].map((id) => book(id, id)) });
  const { rows } = buildMetaCatalogFeed(data);
  const csv = serializeMetaCatalogRows(rows);
  assert.deepEqual(rows.map((row) => row.id), ["gxav9zwrza", "417vdy5t1z", "n7llsz4qrh"]);
  assert.equal(rows[0].price, "108000 KRW");
  assert.equal(rows[0].sale_price, "59000 KRW");
  assert.equal(rows[0].link, "https://subook.kr/store/2370");
  assert.equal(rows[0].custom_label_0, "jeonil");
  assert.equal(csv.includes("book_id"), false);
  const all = buildMetaCatalogFeed({ ...data, scope: "all" }).rows;
  assert.equal(all[3].id, "2500");
  assert.equal(all[3].custom_label_0, "general");
});

test("공개 판매 옵션의 최저가만 사용하고 품절 후 ID·마지막 판매가를 유지한다", () => {
  const data = snapshot({ books: [book(1, 2370, { price: 1000, is_public: false }), book(2, 2370, { price: 5000, status: "sold_out" }), book(3, 2370, { price: 39000, original_price: 38000 })] });
  const active = buildMetaCatalogFeed(data).rows[0];
  assert.equal(active.price, "39000 KRW");
  assert.equal(active.sale_price, "");
  assert.equal(active.availability, "in stock");
  data.books[2].status = "sold_out";
  const sold = buildMetaCatalogFeed(data).rows[0];
  assert.equal(sold.id, active.id);
  assert.equal(sold.availability, "out of stock");
  assert.equal(sold.sale_price, "5000 KRW");
});

test("숨김·출시 전 교재를 제외하고 필드 오류·빈 목록은 정상 CSV로 내보내지 않는다", () => {
  const data = snapshot({ products: [product(2370), product(2371, { status: "hidden" }), product(2437)], books: [book(1, 2370), book(2, 2371), book(3, 2437)], preReleases: [{ product_id: 2437, release_at: null }] });
  assert.equal(buildMetaCatalogFeed(data).rows.length, 1);
  data.preReleases[0].release_at = "2099-01-01T00:00:00Z";
  assert.equal(buildMetaCatalogFeed(data).rows.length, 1);
  data.preReleases[0].release_at = "2020-01-01T00:00:00Z";
  assert.equal(buildMetaCatalogFeed(data).rows.length, 2);
  assert.throws(() => buildMetaCatalogFeed(snapshot({ books: [] })), /incomplete/);
  assert.deepEqual(buildMetaCatalogFeed(snapshot({ products: [] })).rows, []);
  assert.throws(() => serializeMetaCatalogRows([]), /Empty/);
  assert.throws(() => buildMetaCatalogFeed(snapshot({ products: [product(2370, { cover_image_url: "javascript:alert(1)" })] })), /incomplete/);
  assert.throws(() => buildMetaCatalogFeed(snapshot({ products: [product(2370), product(2370)] })), /IDs/);
});

test("한글·쉼표·따옴표를 CSV 규격으로 보존하고 HTML/줄바꿈을 제거한다", () => {
  const result = buildMetaCatalogFeed(snapshot({ products: [product(2370, { title: '<b>국어</b>, "최종"\n교재' })] }));
  assert.equal(result.rows[0].title, '국어, "최종" 교재');
  const csv = serializeMetaCatalogRows(result.rows);
  assert.ok(csv.includes('"국어, ""최종"" 교재"'));
  assert.equal(csv.split("\r\n").length, 3);
});

function pageResponse(rows, remaining = rows.length, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-range": `${rows.length ? `0-${rows.length - 1}` : "*"}/${remaining}` }), json: async () => rows };
}

test("DB 응답 상한이 요청보다 작아도 끝까지 읽고 일시적 오류는 재시도한다", async () => {
  const requests = [];
  let failed = false;
  const data = snapshot({ products: [product(2370), product(2371)], books: [book(1, 2370), book(2, 2371)] });
  const result = await readMetaCatalogSnapshot({ url: "https://test.supabase.co", key: "test-only", scope: "jeonil", retryDelayMs: 0,
    fetchImpl: async (url, options) => {
      const request = new URL(url);
      const table = request.pathname.split("/").at(-1);
      requests.push(request);
      assert.equal(options.method, undefined); // 쓰기 요청 금지
      assert.equal(options.headers.Prefer, "count=exact");
      if (table === "books" && !failed) { failed = true; return pageResponse([], 0, 503); }
      if (table === "pre_release_products") return pageResponse([]);
      const cursor = Number(request.searchParams.getAll("id").find((filter) => filter.startsWith("gt.")).slice(3));
      const remaining = data[table].filter((row) => row.id > cursor);
      return pageResponse(remaining.slice(0, 1), remaining.length);
    },
  });
  assert.equal(result.products.length, 2);
  assert.equal(result.books.length, 2);
  assert.ok(requests.filter((request) => request.pathname.endsWith("/products")).every((request) => request.searchParams.getAll("id").includes("in.(2370,2371,2437)")));
  assert.ok(requests.filter((request) => request.pathname.endsWith("/books")).every((request) => request.searchParams.get("is_public") === "eq.true"));
});

test("누락된 count·멈춘 페이지·페이지 상한·권한 오류는 부분 결과 대신 실패한다", async () => {
  const base = { url: "https://test.supabase.co", key: "test-only", scope: "all", retryDelayMs: 0 };
  await assert.rejects(readMetaCatalogSnapshot({ ...base, fetchImpl: async () => ({ ok: true, headers: new Headers(), json: async () => [] }) }), /incomplete/);
  await assert.rejects(readMetaCatalogSnapshot({ ...base, fetchImpl: async () => pageResponse([], 5) }), /incomplete/);
  await assert.rejects(readMetaCatalogSnapshot({ ...base, maxPages: 1, fetchImpl: async () => pageResponse([{ id: 1, product_id: 1 }], 5) }), /limit/);
  await assert.rejects(readMetaCatalogSnapshot({ ...base, fetchImpl: async () => pageResponse([], 0, 403) }), /failed/);
});

test("API: 기본 범위, CSV/HEAD, 쿼리 거부, 오류 시 503/no-store", async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  t.after(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  });
  let fail = false;
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (fail) return pageResponse([], 0, 403);
    const path = new URL(url).pathname;
    if (path.endsWith("/sync_meta_catalog_snapshot")) {
      const args = JSON.parse(options.body);
      assert.equal(args.p_scope, "jeonil");
      assert.equal(args.p_rows[0].id, "gxav9zwrza");
      return pageResponse(args.p_rows);
    }
    return pageResponse(path.endsWith("/products") ? [product(2370)] : path.endsWith("/books") ? [book(1, 2370)] : []);
  });
  const request = async (req) => {
    const result = { headers: {}, code: 0, body: undefined };
    const res = { setHeader(name, value) { result.headers[name] = value; }, status(code) { result.code = code; return this; }, send(body) { result.body = body; }, json(body) { result.body = body; }, end() {} };
    await handler({ method: "GET", ...req }, res);
    return result;
  };
  const ok = await request({});
  assert.equal(ok.code, 200);
  assert.match(ok.body, /gxav9zwrza/);
  assert.match(ok.headers["Content-Type"], /text\/csv/);
  assert.equal((await request({ method: "HEAD" })).body, undefined);
  assert.equal((await request({ query: { scope: ["jeonil", "all"] } })).code, 400);
  assert.equal((await request({ query: { scope: "other" } })).code, 400);
  assert.equal((await request({ method: "POST" })).code, 405);
  fail = true;
  const error = await request({});
  assert.equal(error.code, 503);
  assert.equal(error.headers["Cache-Control"], "no-store");
  assert.deepEqual(error.body, { error: "catalog temporarily unavailable", code: 503 });
});
