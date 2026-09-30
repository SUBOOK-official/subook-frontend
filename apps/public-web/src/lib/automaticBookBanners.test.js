import test from "node:test";
import assert from "node:assert/strict";
import { buildAutomaticBookBanners, summarizeBannerText } from "./automaticBookBanners.js";

test("keeps every configured banner in the administrator's order", () => {
  const products = Array.from({ length: 12 }, (_, i) => ({ id: 30 - i, title: `교재 ${i}`, priceRangeLabel: "6,000원" }));
  const banners = buildAutomaticBookBanners(products);
  assert.deepEqual(banners.map((row) => row.productId), products.map((row) => row.id));
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

test("uses manual copy before AI copy and never fills an empty selection", () => {
  const banners = buildAutomaticBookBanners([{ id: 1, bannerHeadline: "직접 설정한 문구" }, { id: 2 }], 2,
    new Map([["1", "AI 문구"], ["2", "저장된 AI 문구"]]));
  assert.deepEqual(banners.map((row) => row.summary), ["직접 설정한 문구", "저장된 AI 문구"]);
  assert.deepEqual(buildAutomaticBookBanners([]), []);
});
