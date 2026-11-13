import { createPublicCatalogClient } from "../../../../packages/shared-supabase/src/publicCatalogClient.js";
import { getPublicThemePage, listPublicHeroProducts } from "../../../../packages/shared-supabase/src/curatedContentClient.js";
import { listContentThemes } from "../../../../packages/shared-supabase/src/contentThemesClient.js";
import { listPromotions } from "../../../../packages/shared-supabase/src/sitePromotionsClient.js";
import { fetchMyRecentOrders, fetchProductSignals } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { activePromotions, isPromotionUrl } from "../../../../packages/shared-domain/src/sitePromotions.js";
import { normalizeMobileProduct } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { rankPersonalizedProducts } from "../../../../packages/shared-domain/src/recommendations.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";
import { summarizeBannerText } from "../../../public-web/src/lib/automaticBookBanners.js";
import { bannerCopyMap } from "../../../public-web/src/lib/bannerCopies.js";
import { loadMemberRecommendations } from "../../../public-web/src/lib/memberRecommendations.js";
import { SITE_ORIGIN, SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "../config.js";
import { supabase } from "./supabase.js";

// 공개 목록·상세(세션 없이 읽기만)
export const catalogClient = createPublicCatalogClient({ url: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY });

const RAIL_SIZE = 12;

// 홈 배너 문구(웹 /api/banner-copy와 같은 저장 문구). 실패하면 기본 문구를 쓴다.
async function fetchBannerCopies() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${SITE_ORIGIN}/api/banner-copy`, { signal: controller.signal });
    if (!response.ok) return new Map();
    const data = await response.json();
    return bannerCopyMap(Array.isArray(data?.copies) ? data.copies : []);
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

// 어드민 배너·팝업(/admin/promotions). 배너는 홈 상단 넘김 배너 뒤쪽에, 팝업은 홈 진입 시 띄운다.
function promotionImage(row) {
  return isPromotionUrl(row.mobile_image_url) ? row.mobile_image_url : row.image_url;
}

async function loadHeroAndPopups() {
  if (!supabase) return { slides: [], popups: [] };
  const [rows, copies, promotions] = await Promise.all([
    listPublicHeroProducts(supabase).catch(() => []),
    fetchBannerCopies(),
    listPromotions(supabase, { publishedOnly: true }).catch(() => []),
  ]);
  const books = (Array.isArray(rows) ? rows : []).flatMap((row) => {
    // 공개 여부를 모르는 값(null)은 노출한다. 명시적으로 비공개인 교재만 뺀다.
    if (row?.product?.is_public === false) return [];
    const product = normalizeMobileProduct(row?.product);
    if (!product) return [];
    const headline = typeof row.headline === "string" ? row.headline.trim() : "";
    return [{
      kind: "book",
      id: `book-${product.id}`,
      productId: product.id,
      title: product.title,
      summary: headline || copies.get(product.id) || summarizeBannerText(product),
      priceLabel: `${product.isSoldOut ? "품절 · " : ""}${product.price === null ? "가격 확인하기" : formatCurrency(product.price)}`,
      imageUrl: product.coverUrl,
    }];
  });
  const active = activePromotions(Array.isArray(promotions) ? promotions : []);
  const toPromotion = (row) => ({
    kind: "image",
    id: row.id,
    title: row.alt_text || row.title || "수북 이벤트",
    imageUrl: promotionImage(row),
    href: isPromotionUrl(row.link_url) ? row.link_url : null,
  });
  return {
    slides: [...books, ...active.filter((row) => row.placement === "home_hero").map(toPromotion)],
    popups: active.filter((row) => row.placement === "home_popup").map(toPromotion),
  };
}

// 목록 RPC로 교재를 읽어 추천 순위 계산이 기대하는 모양({ products, error })으로 돌려준다.
async function loadProductsForRanking({ subject, sort = "popular", limit = 24 } = {}) {
  try {
    if (!catalogClient) throw new Error("catalog unavailable");
    const rows = await catalogClient.list({
      p_search: null,
      p_subjects: subject ? [subject] : null,
      p_sort: sort,
      p_limit: Math.max(1, Math.min(Number(limit) || 24, 100)),
      p_offset: 0,
    });
    return { products: rows.map(normalizeMobileProduct).filter(Boolean), error: null };
  } catch (error) {
    return { products: [], error };
  }
}

// BEST 교재: 인기순에서 품절을 뺀 상위 교재(웹 홈과 같은 기준).
async function loadBestProducts() {
  const { products, error } = await loadProductsForRanking({ sort: "popular", limit: RAIL_SIZE * 2 });
  if (error) throw error;
  return rankPersonalizedProducts(products, [], []).slice(0, RAIL_SIZE);
}

// 홈 화면 데이터. 한 구역이 실패해도 나머지는 보여 준다(웹 홈과 같은 원칙).
export async function loadHomeSections() {
  const [hero, themes, best] = await Promise.all([
    loadHeroAndPopups().catch(() => ({ slides: [], popups: [] })),
    supabase ? listContentThemes(supabase).catch(() => []) : [],
    loadBestProducts().catch(() => []),
  ]);
  return {
    slides: hero.slides,
    popups: hero.popups,
    themes: (Array.isArray(themes) ? themes : []).filter((theme) => theme?.id && theme?.title),
    best,
  };
}

// 로그인 회원 맞춤 교재(웹 홈 MemberRecommendations와 같은 계산).
// 최근 구매 → 찜 순으로 과목·유형이 비슷한 교재를 고르고, 신호가 없으면 BEST를 돌려준다.
// 반환: { source: "recent" | "wishlist" | "best", products }
export async function loadMemberRail(favoriteIds = []) {
  if (!supabase) return null;
  const orders = await fetchMyRecentOrders(supabase).catch(() => []);
  const result = await loadMemberRecommendations({
    orders,
    favoriteIds,
    loadSignals: (ids) => fetchProductSignals(supabase, ids),
    loadProducts: loadProductsForRanking,
  });
  return { source: result.source, products: result.products.slice(0, RAIL_SIZE) };
}

export async function loadThemePage(themeId, offset = 0) {
  if (!supabase) throw new Error("교재 서비스 연결을 준비하고 있어요.");
  const data = await getPublicThemePage(supabase, themeId, { limit: 24, offset });
  return {
    theme: data?.theme ?? null,
    products: (Array.isArray(data?.products) ? data.products : []).map(normalizeMobileProduct).filter(Boolean),
    total: Number(data?.total_count) || 0,
  };
}
