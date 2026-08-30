// 전일학원 × 수북 콜라보 상품 레지스트리 (2026-08-31)
//
// 한 곳에서 관리하는 것: ① 홈 '신규 입고' 최상단 고정 ② 전일학원 랜딩(/event/jeon-il)
// 교재 카드 → 상품 상세 링크 ③ 상품 상세의 전용 상세페이지 이미지 사용 여부.
//
// ⚠ 매칭 키가 '상품명'인 이유 — 이 모듈을 만든 시점에 세 상품이 아직 admin에 등록되지
//   않아 products.id가 존재하지 않았다. 공백을 모두 지우고 비교하므로
//   "미니 모의고사" / "미니모의고사" 같은 띄어쓰기 차이는 흡수된다.
//   상품 등록 후에는 각 항목의 productId에 실제 products.id를 적어 둘 것.
//   productId가 있으면 제목 매칭보다 우선하므로, 나중에 상품명을 바꿔도 안전하다.
//
// ⚠ 이 모듈은 Node 단위 테스트(publicHomeLatestBooksUtils)에서 전이 import 되므로
//   이미지 에셋·supabase 클라이언트를 import 하지 않는다 (순수 로직만).
//   · 조회가 필요하면 publicFeaturedProductsApi.js
//   · 상세페이지 이미지는 components/FeaturedProductDetail.jsx

export const JEONIL_BRAND = "전일학원";

export const FEATURED_PRODUCTS = [
  {
    key: "j1-full",
    title: "2027 J1 원트 FULL 모의고사 국어",
    // 등록 후 실제 products.id 를 넣으면 제목 매칭보다 우선한다.
    productId: null,
    // 홈 '신규 입고' 캐러셀 최상단 고정 대상
    pinToLatest: true,
  },
  {
    key: "j1-mini",
    title: "2027 J1 원트 미니 모의고사 국어",
    productId: null,
    pinToLatest: true,
  },
  {
    // 랜딩 카드 링크 대상이지만 고정·전용 상세페이지 대상은 아니다.
    key: "j1-tomato",
    title: "2027 J1 약술논술 토마토 모의고사",
    productId: null,
    pinToLatest: false,
  },
];

// 공백 제거 + 소문자화. "2027 J1 원트 미니 모의고사 국어"와
// "2027 J1 원트 미니모의고사 국어"가 같은 키가 되도록 한다.
export function normalizeFeaturedTitleKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/gu, "");
}

export function matchesFeaturedEntry(entry, product) {
  if (!entry || !product) {
    return false;
  }

  // productId가 지정돼 있으면 그것만 신뢰한다 (제목 변경에 영향받지 않음).
  if (entry.productId !== null && entry.productId !== undefined) {
    return String(entry.productId) === String(product.id ?? product.productId ?? "");
  }

  const productTitle = normalizeFeaturedTitleKey(product.title);
  return productTitle !== "" && productTitle === normalizeFeaturedTitleKey(entry.title);
}

// 스토어 상품 → 레지스트리 항목. 매칭되는 콜라보 상품이 아니면 null.
export function findFeaturedProductEntry(product) {
  return FEATURED_PRODUCTS.find((entry) => matchesFeaturedEntry(entry, product)) ?? null;
}

// key → 상품 객체 맵. 랜딩 카드 링크·고정 대상 조회에 함께 쓴다.
export function mapFeaturedProductsByKey(products) {
  const byKey = {};

  for (const product of Array.isArray(products) ? products : []) {
    const entry = findFeaturedProductEntry(product);

    // 같은 key에 여러 상품이 걸리면 먼저 온 것(= 최신순 상위)을 유지한다.
    if (entry && !byKey[entry.key]) {
      byKey[entry.key] = product;
    }
  }

  return byKey;
}

// 정렬이 끝난 목록에서 고정 대상만 레지스트리 순서대로 앞으로 끌어올린다.
// (나머지 상품의 상대 순서는 그대로 유지)
export function pinFeaturedProductsFirst(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  const pinnedEntries = FEATURED_PRODUCTS.filter((entry) => entry.pinToLatest);
  const pinned = [];
  const rest = [];

  for (const product of products) {
    const rank = pinnedEntries.findIndex((entry) => matchesFeaturedEntry(entry, product));

    if (rank >= 0) {
      pinned.push({ rank, product });
    } else {
      rest.push(product);
    }
  }

  if (pinned.length === 0) {
    return [...products];
  }

  pinned.sort((left, right) => left.rank - right.rank);

  return [...pinned.map((item) => item.product), ...rest];
}
