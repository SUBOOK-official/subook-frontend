import test from "node:test";
import assert from "node:assert/strict";
import { buildAutomaticBookBanners, summarizeBannerText } from "./automaticBookBanners.js";

test("keeps recommendation order and selects only the first nine", () => {
  const products = Array.from({ length: 12 }, (_, i) => ({ id: 30 - i, title: `교재 ${i}`, priceRangeLabel: "6,000원" }));
  const banners = buildAutomaticBookBanners(products);
  assert.deepEqual(banners.map((row) => row.productId), products.slice(0, 9).map((row) => row.id));
  assert.equal(banners[0].summary, "다음 공부를 함께할 한 권");
  assert.equal(banners[0].href, "/store/30");
  assert.equal(banners[0].priceLabel, "6,000원");
});
test("uses factual metadata when there is no summary and handles unknown prices", () => {
  assert.equal(summarizeBannerText({ subject: "수학", bookType: "모의고사" }), "실전처럼 풀며 완성하는 시험 감각");
  assert.equal(buildAutomaticBookBanners([{ id: 1, priceRangeLabel: "미입력" }])[0].priceLabel, "가격 확인하기");
  assert.equal(buildAutomaticBookBanners([{ id: 2, isPublic: false }]).length, 0);
});

test("edited and fallback banner copy stays within 20 characters including spaces", () => {
  const products = [2370, 2371, 376, 9, 2317, 2328, 2333, 2437, 2570].map((id) => ({ id }));
  products.push(...["모의고사", "기출", "개념", "N제", "주간지", ""].map((bookType) => ({ bookType })));
  for (const product of products) {
    const copy = summarizeBannerText(product);
    assert.ok([...copy].length <= 20, copy);
    assert.ok(!copy.includes("…"), copy);
  }
});

test("manual banners plus at least eight recommendations fill both two and three card pages", async () => {
  const { getRecommendedBannerCount } = await import('./automaticBookBanners.js');
  for (let manual = 0; manual < 40; manual++) {
    const recommended = getRecommendedBannerCount(manual);
    assert.ok(recommended >= 8 && recommended <= 13);
    assert.equal((manual + recommended) % 6, 0);
  }
  assert.equal(getRecommendedBannerCount(0), 12);
  assert.equal(getRecommendedBannerCount(3), 9);
  assert.equal(getRecommendedBannerCount(4), 8);
  assert.equal(getRecommendedBannerCount(5), 13);
  assert.equal(buildAutomaticBookBanners(Array.from({length:15},(_,i)=>({id:i+1})),13).length,13);
});
