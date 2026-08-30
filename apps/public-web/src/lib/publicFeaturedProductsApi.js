// 콜라보 고정 상품 조회 — publicFeaturedProducts.js(순수 로직)와 달리 supabase를 탄다.
// 홈 '신규 입고' 고정과 전일학원 랜딩 카드 링크가 같은 조회를 공유한다.
import { JEONIL_BRAND, mapFeaturedProductsByKey } from "./publicFeaturedProducts";
import { fetchStorefrontProducts } from "./storefront";

// 브랜드 하나에 걸린 상품 수는 많지 않지만, 옵션/회차별로 여러 건이 등록될 수 있어
// 최신순으로 넉넉히 받아 온 뒤 레지스트리 제목 매칭으로 걸러낸다.
const FEATURED_FETCH_LIMIT = 30;

// 등록 전이거나 조회에 실패하면 빈 배열 — 호출부는 고정 없이 정상 동작해야 한다.
export async function fetchFeaturedProducts() {
  const result = await fetchStorefrontProducts({
    brands: [JEONIL_BRAND],
    sort: "latest",
    limit: FEATURED_FETCH_LIMIT,
  });

  if (result.error) {
    throw result.error;
  }

  return result.products ?? result.books ?? [];
}

// key → 상품 맵. 조회가 실패해도 화면이 죽지 않도록 여기서 흡수한다.
export async function fetchFeaturedProductsByKey() {
  try {
    return mapFeaturedProductsByKey(await fetchFeaturedProducts());
  } catch {
    return {};
  }
}
