import { createPublicCatalogClient } from "../../../../packages/shared-supabase/src/publicCatalogClient.js";
import { getPublicThemePage, listPublicHeroProducts } from "../../../../packages/shared-supabase/src/curatedContentClient.js";
import { listContentThemes } from "../../../../packages/shared-supabase/src/contentThemesClient.js";
import { listPromotions } from "../../../../packages/shared-supabase/src/sitePromotionsClient.js";
import { activePromotions, isPromotionUrl } from "../../../../packages/shared-domain/src/sitePromotions.js";
import { normalizeMobileProduct } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";
import { summarizeBannerText } from "../../../public-web/src/lib/automaticBookBanners.js";
import { bannerCopyMap } from "../../../public-web/src/lib/bannerCopies.js";
import { SITE_ORIGIN, SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "../config.js";
import { supabase } from "./supabase.js";

// 공개 목록·상세(세션 없이 읽기만)
export const catalogClient = createPublicCatalogClient({ url: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY });

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

async function loadHeroSlides() {
  if (!supabase) return [];
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
  const banners = activePromotions(Array.isArray(promotions) ? promotions : [])
    .filter((row) => row.placement === "home_hero")
    .map((row) => ({
      kind: "image",
      id: row.id,
      title: row.alt_text || row.title || "수북 이벤트",
      imageUrl: isPromotionUrl(row.mobile_image_url) ? row.mobile_image_url : row.image_url,
      href: isPromotionUrl(row.link_url) ? row.link_url : null,
    }));
  return [...books, ...banners];
}

async function loadBestProducts() {
  if (!catalogClient) return [];
  const rows = await catalogClient.list({ p_search: null, p_subjects: null, p_sort: "popular", p_limit: 12, p_offset: 0 });
  return rows.map(normalizeMobileProduct).filter(Boolean);
}

// 홈 화면 데이터. 한 구역이 실패해도 나머지는 보여 준다(웹 홈과 같은 원칙).
export async function loadHomeSections() {
  const [slides, themes, best] = await Promise.all([
    loadHeroSlides().catch(() => []),
    supabase ? listContentThemes(supabase).catch(() => []) : [],
    loadBestProducts().catch(() => []),
  ]);
  return {
    slides,
    themes: (Array.isArray(themes) ? themes : []).filter((theme) => theme?.id && theme?.title),
    best,
  };
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
