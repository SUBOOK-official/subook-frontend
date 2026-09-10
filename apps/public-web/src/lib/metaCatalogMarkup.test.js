import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/prerender-product.js";

test("Meta 크롤러의 Product JSON-LD는 픽셀과 같은 ID·URL·가격·재고를 가진다", async (t) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://catalog-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  const product = { id: 2370, title: "테스트 교재", brand: "시대인재", subject: "국어", cover_image_url: "https://subook.kr/cover.jpg" };
  let bookStatus = "on_sale";
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    const rows = path.endsWith("/products") ? [product]
      : path.endsWith("/books") ? [{ price: 59000, condition_grade: "S", status: bookStatus, is_public: true }]
      : [];
    return { ok: true, json: async () => rows };
  });
  async function readProduct() {
    let html;
    const res = {
      setHeader() {},
      status(code) { assert.equal(code, 200); return this; },
      send(value) { html = value; },
    };
    await handler({ method: "GET", query: { id: "2370" } }, res);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    return scripts.flatMap(([, json]) => JSON.parse(json)).find((item) => item["@type"] === "Product");
  }
  const available = await readProduct();
  assert.equal(available.productID, "2370");
  assert.equal(available.url, "https://subook.kr/store/2370");
  assert.equal(available.offers.price, 59000);
  assert.equal(available.offers.priceCurrency, "KRW");
  assert.equal(available.offers.availability, "https://schema.org/InStock");
  bookStatus = "sold";
  const soldOut = await readProduct();
  assert.equal(soldOut.productID, available.productID);
  assert.equal(soldOut.url, available.url);
  assert.equal(soldOut.offers.availability, "https://schema.org/OutOfStock");
});
