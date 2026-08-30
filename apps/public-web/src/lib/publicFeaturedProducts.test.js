import assert from "node:assert/strict";
import test from "node:test";
import {
  FEATURED_PRODUCTS,
  findFeaturedProductEntry,
  mapFeaturedProductsByKey,
  matchesFeaturedEntry,
  normalizeFeaturedTitleKey,
  pinFeaturedProductsFirst,
} from "./publicFeaturedProducts.js";

test("normalizeFeaturedTitleKey absorbs spacing and case differences", () => {
  assert.equal(
    normalizeFeaturedTitleKey("2027 J1 원트 미니 모의고사 국어"),
    normalizeFeaturedTitleKey("2027 J1 원트 미니모의고사 국어"),
  );
  assert.equal(
    normalizeFeaturedTitleKey("2027 J1 원트 FULL 모의고사 국어"),
    normalizeFeaturedTitleKey("2027 j1  원트 full 모의고사 국어"),
  );
  assert.equal(normalizeFeaturedTitleKey(null), "");
});

test("findFeaturedProductEntry matches by title and ignores unrelated products", () => {
  assert.equal(
    findFeaturedProductEntry({ id: 1, title: "2027 J1 원트 FULL 모의고사 국어" })?.key,
    "j1-full",
  );
  // 등록 시 띄어쓰기가 달라져도 같은 상품으로 인식해야 한다.
  assert.equal(
    findFeaturedProductEntry({ id: 2, title: "2027 J1 원트 미니모의고사 국어" })?.key,
    "j1-mini",
  );
  assert.equal(findFeaturedProductEntry({ id: 3, title: "시대인재 서바이벌 국어" }), null);
  assert.equal(findFeaturedProductEntry(null), null);
  // 제목이 비어 있는 상품이 전부 매칭되어 버리는 사고 방지
  assert.equal(findFeaturedProductEntry({ id: 4, title: "" }), null);
});

test("matchesFeaturedEntry prefers an explicit productId over the title", () => {
  const entry = { key: "j1-full", title: "2027 J1 원트 FULL 모의고사 국어", productId: 4242 };

  // productId가 지정되면 상품명이 바뀌어도 id로 매칭된다.
  assert.equal(matchesFeaturedEntry(entry, { id: 4242, title: "이름이 바뀐 상품" }), true);
  // 반대로 제목이 같아도 id가 다르면 매칭되지 않는다 (동명 상품 오매칭 방지).
  assert.equal(
    matchesFeaturedEntry(entry, { id: 99, title: "2027 J1 원트 FULL 모의고사 국어" }),
    false,
  );
  // bigint id가 문자열로 오는 경로(RPC 응답)도 같은 상품으로 본다.
  assert.equal(matchesFeaturedEntry(entry, { id: "4242", title: "" }), true);
});

test("every registry entry carries a key and a title", () => {
  for (const entry of FEATURED_PRODUCTS) {
    assert.ok(entry.key.trim().length > 0, "key");
    assert.ok(entry.title.trim().length > 0, `${entry.key} title`);
  }
});

test("pinFeaturedProductsFirst hoists pinned products in registry order", () => {
  const products = [
    { id: 10, title: "메가스터디 파이널 국어" },
    { id: 11, title: "2027 J1 원트 미니 모의고사 국어" },
    { id: 12, title: "강남대성 봉투모의고사" },
    { id: 13, title: "2027 J1 원트 FULL 모의고사 국어" },
  ];

  // 레지스트리 순서가 FULL → 미니 이므로 목록 순서와 무관하게 FULL이 먼저 온다.
  assert.deepEqual(
    pinFeaturedProductsFirst(products).map((product) => product.id),
    [13, 11, 10, 12],
  );
});

test("pinFeaturedProductsFirst leaves non-pinned featured products in place", () => {
  const products = [
    { id: 20, title: "메가스터디 파이널 국어" },
    // 랜딩 카드 링크 대상이지만 홈 고정 대상은 아니다.
    { id: 21, title: "2027 J1 약술논술 토마토 모의고사" },
    { id: 22, title: "2027 J1 원트 FULL 모의고사 국어" },
  ];

  assert.deepEqual(
    pinFeaturedProductsFirst(products).map((product) => product.id),
    [22, 20, 21],
  );
});

test("pinFeaturedProductsFirst keeps order when nothing matches", () => {
  const products = [{ id: 30, title: "이감 국어" }, { id: 31, title: "EBS 수능특강" }];

  assert.deepEqual(
    pinFeaturedProductsFirst(products).map((product) => product.id),
    [30, 31],
  );
  assert.deepEqual(pinFeaturedProductsFirst([]), []);
  assert.deepEqual(pinFeaturedProductsFirst(null), []);
});

test("mapFeaturedProductsByKey keeps the first match per key", () => {
  const byKey = mapFeaturedProductsByKey([
    { id: 40, title: "2027 J1 원트 FULL 모의고사 국어" },
    { id: 41, title: "2027 J1 원트 FULL 모의고사 국어" },
    { id: 42, title: "2027 J1 약술논술 토마토 모의고사" },
    { id: 43, title: "시대인재 서바이벌" },
  ]);

  assert.equal(byKey["j1-full"].id, 40);
  assert.equal(byKey["j1-tomato"].id, 42);
  assert.equal(byKey["j1-mini"], undefined);
});
