import assert from "node:assert/strict";
import test from "node:test";
import {
  FEATURED_PRODUCTS,
  findFeaturedProductEntry,
  getFeaturedDetailKey,
  isPreReleaseProduct,
  mapFeaturedProductsByKey,
  matchesFeaturedEntry,
  normalizeFeaturedTitleKey,
  pinFeaturedProductsFirst,
  resolveFeaturedCoverUrl,
} from "./publicFeaturedProducts.js";

// 로직 검증용 고정 레지스트리 — 실제 레지스트리는 등록된 productId가 박혀 있어
// 제목 매칭 경로를 시험할 수 없다. 두 경로를 각각 확인하려고 픽스처를 쓴다.
const REGISTRY = [
  { key: "by-title-a", title: "2027 J1 원트 FULL 모의고사 국어", productId: null, pinToLatest: true, preRelease: true },
  { key: "by-title-b", title: "2027 J1 원트 미니 모의고사 국어", productId: null, pinToLatest: true },
  { key: "not-pinned", title: "2027 J1 약술논술 토마토 모의고사", productId: null, pinToLatest: false },
];

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
    findFeaturedProductEntry({ id: 1, title: "2027 J1 원트 FULL 모의고사 국어" }, REGISTRY)?.key,
    "by-title-a",
  );
  // 등록 시 띄어쓰기가 달라져도 같은 상품으로 인식해야 한다.
  assert.equal(
    findFeaturedProductEntry({ id: 2, title: "2027 J1 원트 미니모의고사 국어" }, REGISTRY)?.key,
    "by-title-b",
  );
  assert.equal(findFeaturedProductEntry({ id: 3, title: "시대인재 서바이벌 국어" }, REGISTRY), null);
  assert.equal(findFeaturedProductEntry(null, REGISTRY), null);
  // 제목이 비어 있는 상품이 전부 매칭되어 버리는 사고 방지
  assert.equal(findFeaturedProductEntry({ id: 4, title: "" }, REGISTRY), null);
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

// 실제 레지스트리 회귀 방지 — 등록된 콜라보 상품은 id로 걸리고 출시 전 고정 시각에는 잠겨야 한다.
test("registry resolves the registered collab products by id", () => {
  const full = FEATURED_PRODUCTS.find((entry) => entry.key === "j1-full");
  const mini = FEATURED_PRODUCTS.find((entry) => entry.key === "j1-mini");
  const mini10 = FEATURED_PRODUCTS.find((entry) => entry.key === "j1-mini-10");
  const beforeRelease = Date.parse("2026-09-03T17:59:00+09:00");

  assert.equal(findFeaturedProductEntry({ id: full.productId, title: "" })?.key, "j1-full");
  assert.equal(findFeaturedProductEntry({ id: mini.productId, title: "" })?.key, "j1-mini");
  assert.equal(findFeaturedProductEntry({ id: mini10.productId, title: "" })?.key, "j1-mini-10");
  assert.equal(isPreReleaseProduct({ id: full.productId }, FEATURED_PRODUCTS, beforeRelease), true);
  assert.equal(isPreReleaseProduct({ id: mini.productId }, FEATURED_PRODUCTS, beforeRelease), true);
  assert.equal(isPreReleaseProduct({ id: mini10.productId }, FEATURED_PRODUCTS, beforeRelease), true);
  // 10회분은 미니(30일분)의 상세페이지 이미지를 그대로 쓴다.
  assert.equal(getFeaturedDetailKey(mini10), "j1-mini");
  assert.equal(getFeaturedDetailKey(mini), "j1-mini");
  assert.equal(getFeaturedDetailKey(null), null);
  // 무관한 상품은 출시 전 취급되면 안 된다 (전 상품 가격이 가려지는 사고 방지).
  assert.equal(isPreReleaseProduct({ id: 1, title: "시대인재 서바이벌 국어" }), false);
});

test("isPreReleaseProduct opens by itself once releaseAt passes", () => {
  const registry = [
    { key: "timed", title: "예약 상품", productId: 900, preRelease: true, releaseAt: "2026-09-03T18:00:00+09:00" },
    { key: "no-date", title: "무기한 상품", productId: 901, preRelease: true },
  ];
  const product = { id: 900 };
  const openAt = Date.parse("2026-09-03T18:00:00+09:00");

  // 1분 전 = 아직 잠김, 오픈 시각 정각부터 열림
  assert.equal(isPreReleaseProduct(product, registry, openAt - 60_000), true);
  assert.equal(isPreReleaseProduct(product, registry, openAt), false);
  assert.equal(isPreReleaseProduct(product, registry, openAt + 60_000), false);

  // releaseAt이 없으면 보수적으로 계속 잠긴 상태를 유지한다.
  assert.equal(isPreReleaseProduct({ id: 901 }, registry, openAt + 60_000), true);
});

test("every registry entry marked preRelease carries a releaseAt", () => {
  // releaseAt이 빠지면 오픈일이 지나도 영원히 잠긴 채로 남는다.
  for (const entry of FEATURED_PRODUCTS.filter((item) => item.preRelease)) {
    assert.ok(
      Number.isFinite(Date.parse(entry.releaseAt ?? "")),
      `${entry.key} releaseAt`,
    );
  }
});

// 오픈 시각이 지나면 COMING SOON 티저가 사라지고 실제 표지로 돌아와야 한다.
// (DB에는 항상 실제 표지가 들어 있고, 티저는 프론트가 덮어쓰는 구조)
test("resolveFeaturedCoverUrl swaps back to the real cover after release", () => {
  const full = FEATURED_PRODUCTS.find((entry) => entry.key === "j1-full");
  const openAt = Date.parse(full.releaseAt);
  const product = { id: full.productId };
  const realCover = "https://cdn.example/real-cover.png";

  assert.equal(
    resolveFeaturedCoverUrl(product, realCover, openAt - 60_000),
    full.preReleaseCoverUrl,
  );
  assert.equal(resolveFeaturedCoverUrl(product, realCover, openAt), realCover);

  // 콜라보가 아닌 상품은 언제나 원래 표지 그대로.
  assert.equal(
    resolveFeaturedCoverUrl({ id: 1, title: "시대인재 서바이벌" }, realCover, openAt - 60_000),
    realCover,
  );
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
    pinFeaturedProductsFirst(products, REGISTRY).map((product) => product.id),
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
    pinFeaturedProductsFirst(products, REGISTRY).map((product) => product.id),
    [22, 20, 21],
  );
});

test("pinFeaturedProductsFirst keeps order when nothing matches", () => {
  const products = [{ id: 30, title: "이감 국어" }, { id: 31, title: "EBS 수능특강" }];

  assert.deepEqual(
    pinFeaturedProductsFirst(products, REGISTRY).map((product) => product.id),
    [30, 31],
  );
  assert.deepEqual(pinFeaturedProductsFirst([], REGISTRY), []);
  assert.deepEqual(pinFeaturedProductsFirst(null, REGISTRY), []);
});

test("mapFeaturedProductsByKey keeps the first match per key", () => {
  const byKey = mapFeaturedProductsByKey(
    [
      { id: 40, title: "2027 J1 원트 FULL 모의고사 국어" },
      { id: 41, title: "2027 J1 원트 FULL 모의고사 국어" },
      { id: 42, title: "2027 J1 약술논술 토마토 모의고사" },
      { id: 43, title: "시대인재 서바이벌" },
    ],
    REGISTRY,
  );

  assert.equal(byKey["by-title-a"].id, 40);
  assert.equal(byKey["not-pinned"].id, 42);
  assert.equal(byKey["by-title-b"], undefined);
});
