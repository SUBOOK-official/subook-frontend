// 전일학원 × 수북 콜라보 상품 레지스트리 (2026-08-31)
//
// 한 곳에서 관리하는 것: ① 홈 '신규 입고' 최상단 고정 ② 전일학원 랜딩(/event/jeon-il)
// 교재 카드 → 상품 상세 링크 ③ 상품 상세의 전용 상세페이지 이미지 사용 여부.
//
// 매칭은 productId 우선, 없으면 상품명(공백 무시)으로 폴백한다.
//   J1 FULL·미니(30일분)는 2026-08-31, 미니(10회분)는 2026-09-03에 등록돼 실제 id가
//   박혀 있어 상품명을 바꿔도 안전하다(9/3 상품명 개편도 id 덕에 무배포로 안전했다).
//   아직 등록 전인 항목(토마토)만 제목 매칭으로 대기 중 — 등록되면 id를 채울 것.
//
// ⚠ 제목을 바꾸면 api/prerender-product.js 의 FEATURED_NEW_BOOK_TITLES 도 같이 고칠 것
//   (서버리스는 의존성 제로 제약이라 이 모듈을 import 하지 못하고 제목을 복제해 둔다).
//
// ⚠ 이 모듈은 Node 단위 테스트(publicHomeLatestBooksUtils)에서 전이 import 되므로
//   이미지 에셋·supabase 클라이언트를 import 하지 않는다 (순수 로직만).
//   · 조회가 필요하면 publicFeaturedProductsApi.js
//   · 상세페이지 이미지는 components/FeaturedProductDetail.jsx

export const JEONIL_BRAND = "전일학원";
// 출시 전 상품 상세에서 '알림 신청하러 가기'로 보낼 이벤트 랜딩.
export const JEONIL_EVENT_PATH = "/event/jeon-il";
// 출시 전에만 덮어씌우는 COMING SOON 티저 표지. 상품의 실제 표지는 DB에 그대로 있어
// 오픈 시각이 지나면 덮어쓰기가 사라지면서 자동으로 실제 표지가 노출된다.
const TEASER_COVER_BASE =
  "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/product-covers/direct-sale";

// 콜라보 오픈 시각 — 2026-09-03 18:00 KST.
// 이 시각이 지나면 배포 없이 자동으로 가격·구매가 열린다(아래 isPreReleaseProduct).
// ⚠ DB 가드(pre_release_products.release_at)에도 같은 시각이 들어가 있다 — 함께 유지할 것.
// ⚠ 전일학원 랜딩(PublicJeonilEventPage OPEN_*)의 날짜와도 같이 맞출 것.
export const COLLAB_OPEN_AT = "2026-09-03T18:00:00+09:00";
// 오전/오후 혼동이 없도록 24시간 표기로 통일한다("6시"는 오전으로 읽힐 수 있다).
export const COLLAB_OPEN_LABEL = "9월 3일 18시";

export const FEATURED_PRODUCTS = [
  {
    key: "j1-full",
    title: "[수능 직전 최종점검] 2027 J1 원트 FULL 모의고사 국어(7회분)",
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
    preReleaseCoverUrl: `${TEASER_COVER_BASE}/1787900000000-teaser-j1-full-v2.png`,
  },
  {
    key: "j1-mini",
    title: "[수능 직전 일일점검] 2027 J1 원트 미니모의고사 국어(30일분)",
    productId: 2371,
    pinToLatest: true,
    preRelease: true,
    releaseAt: COLLAB_OPEN_AT,
    eventPath: JEONIL_EVENT_PATH,
    preReleaseCoverUrl: `${TEASER_COVER_BASE}/1787900000000-teaser-j1-mini-v2.png`,
  },
  {
    // 미니모의고사 10회분 SET A/B/C — 2026-09-03 에 30일분에서 분리한 상품.
    // 썸네일·상세페이지는 미니(30일분)와 같아서 detailKey 로 j1-mini 의 이미지를 재사용한다.
    key: "j1-mini-10",
    title: "2027 J1 원트 미니모의고사 국어(10회분)",
    productId: 2437,
    // 전용 상세페이지 이미지 폴더(assets/product-detail/<detailKey>) — 없으면 key 를 쓴다.
    detailKey: "j1-mini",
    pinToLatest: true,
    preRelease: true,
    releaseAt: COLLAB_OPEN_AT,
    eventPath: JEONIL_EVENT_PATH,
    preReleaseCoverUrl: `${TEASER_COVER_BASE}/1787900000000-teaser-j1-mini-v2.png`,
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

// 표지 URL — 출시 전에는 COMING SOON 티저로 덮고, 오픈 시각이 지나면 원래 표지를 쓴다.
// DB에는 항상 실제 표지가 들어 있어, 오픈 시각에 DB를 건드릴 필요가 없다.
export function resolveFeaturedCoverUrl(product, coverUrl, now = Date.now()) {
  if (!isPreReleaseProduct(product, FEATURED_PRODUCTS, now)) {
    return coverUrl;
  }

  return findFeaturedProductEntry(product)?.preReleaseCoverUrl ?? coverUrl;
}

// 전용 상세페이지 이미지 키 — 다른 상품의 이미지를 그대로 쓰는 항목(10회분 → 미니)은
// detailKey 로 가리킨다. 없으면 자기 key.
export function getFeaturedDetailKey(entry) {
  return entry?.detailKey ?? entry?.key ?? null;
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
