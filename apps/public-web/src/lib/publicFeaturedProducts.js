// 전일학원 × 수북 콜라보 상품 레지스트리 (2026-08-31)
//
// 한 곳에서 관리하는 것: ① 홈 '신규 입고' 최상단 고정 ② 전일학원 랜딩(/event/jeon-il)
// 교재 카드 → 상품 상세 링크 ③ 상품 상세의 전용 상세페이지 이미지 사용 여부.
//
// 매칭은 productId 우선, 없으면 상품명(공백 무시)으로 폴백한다.
//   J1 FULL·미니는 2026-08-31에 등록돼 실제 id가 박혀 있어 상품명을 바꿔도 안전하다.
//   아직 등록 전인 항목(토마토)만 제목 매칭으로 대기 중 — 등록되면 id를 채울 것.
//
// ⚠ 이 모듈은 Node 단위 테스트(publicHomeLatestBooksUtils)에서 전이 import 되므로
//   이미지 에셋·supabase 클라이언트를 import 하지 않는다 (순수 로직만).
//   · 조회가 필요하면 publicFeaturedProductsApi.js
//   · 상세페이지 이미지는 components/FeaturedProductDetail.jsx

export const JEONIL_BRAND = "전일학원";
// 출시 전 상품 상세에서 '알림 신청하러 가기'로 보낼 이벤트 랜딩.
export const JEONIL_EVENT_PATH = "/event/jeon-il";

// 콜라보 오픈 시각 — 2026-09-03 18:00 KST.
// 이 시각이 지나면 배포 없이 자동으로 가격·구매가 열린다(아래 isPreReleaseProduct).
// ⚠ DB 가드(pre_release_products.release_at)에도 같은 시각이 들어가 있다 — 함께 유지할 것.
// ⚠ 전일학원 랜딩(PublicJeonilEventPage OPEN_*)의 날짜와도 같이 맞출 것.
export const COLLAB_OPEN_AT = "2026-09-03T18:00:00+09:00";
// 카드 뱃지처럼 좁은 자리는 짧은 라벨, 문장 안에서는 시각까지 쓴다.
export const COLLAB_OPEN_LABEL = "9월 3일 6시";
export const COLLAB_OPEN_TIME_LABEL = "9월 3일 오후 6시";

export const FEATURED_PRODUCTS = [
  {
    key: "j1-full",
    title: "2027 J1 원트 FULL 모의고사 국어",
    // 실제 products.id — 지정돼 있으면 제목 매칭보다 우선한다(상품명을 바꿔도 안전).
    productId: 2370,
    // 홈 '신규 입고' 캐러셀 최상단 고정 대상
    pinToLatest: true,
    // 출시 전 — 가격을 감추고 주문(장바구니·구매)을 막는다. 오픈일에 false로 바꾸면
    // 별도 배포 없이 가격·구매가 한 번에 열린다.
    // ⚠ UI 차단일 뿐이라 DB 가드(pre_release_products 테이블)와 짝으로 유지할 것.
    preRelease: true,
    releaseAt: COLLAB_OPEN_AT,
    eventPath: JEONIL_EVENT_PATH,
  },
  {
    key: "j1-mini",
    title: "2027 J1 원트 미니 모의고사 국어",
    productId: 2371,
    pinToLatest: true,
    preRelease: true,
    releaseAt: COLLAB_OPEN_AT,
    eventPath: JEONIL_EVENT_PATH,
  },
  {
    // 랜딩 카드 링크 대상이지만 고정·전용 상세페이지 대상은 아니다.
    key: "j1-tomato",
    title: "2027 J1 약술논술 토마토 모의고사",
    productId: null,
    pinToLatest: false,
    preRelease: true,
    releaseAt: COLLAB_OPEN_AT,
    eventPath: JEONIL_EVENT_PATH,
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
export function findFeaturedProductEntry(product, registry = FEATURED_PRODUCTS) {
  return registry.find((entry) => matchesFeaturedEntry(entry, product)) ?? null;
}

// 출시 전 상품인가 — 가격 노출·장바구니·구매를 모두 막는 판단의 단일 기준.
// releaseAt 이 지나면 자동으로 false 가 된다(오픈 시각에 배포할 필요가 없다).
// 브라우저 시계를 믿는 판단이라 어디까지나 화면용 — 실제 주문 차단은 DB 가드가 한다.
export function isPreReleaseProduct(product, registry = FEATURED_PRODUCTS, now = Date.now()) {
  const entry = findFeaturedProductEntry(product, registry);

  if (entry?.preRelease !== true) {
    return false;
  }

  const releaseAt = Date.parse(entry.releaseAt ?? "");
  // releaseAt 이 없거나 이상하면 보수적으로 '출시 전'을 유지한다.
  return !Number.isFinite(releaseAt) || now < releaseAt;
}

// key → 상품 객체 맵. 랜딩 카드 링크·고정 대상 조회에 함께 쓴다.
export function mapFeaturedProductsByKey(products, registry = FEATURED_PRODUCTS) {
  const byKey = {};

  for (const product of Array.isArray(products) ? products : []) {
    const entry = findFeaturedProductEntry(product, registry);

    // 같은 key에 여러 상품이 걸리면 먼저 온 것(= 최신순 상위)을 유지한다.
    if (entry && !byKey[entry.key]) {
      byKey[entry.key] = product;
    }
  }

  return byKey;
}

// 정렬이 끝난 목록에서 고정 대상만 레지스트리 순서대로 앞으로 끌어올린다.
// (나머지 상품의 상대 순서는 그대로 유지)
export function pinFeaturedProductsFirst(products, registry = FEATURED_PRODUCTS) {
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  const pinnedEntries = registry.filter((entry) => entry.pinToLatest);
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
