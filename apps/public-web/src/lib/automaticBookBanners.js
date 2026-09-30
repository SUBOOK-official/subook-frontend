// 배너용 편집 문구. 상품 상세의 AI 요약과 별도로 관리한다.
const BOOK_BANNER_COPY = {
  "2370": "실전처럼 풀고, 수능을 완성하다",
  "2371": "매일 쌓는 국어 실전 감각",
  "376": "준킬러 공략, 짧고 굵게",
  "9": "수학 실전 감각을 끌어올리다",
  "2317": "매일 다지는 수능 국어 감각",
  "2328": "손글씨 해설로 익히는 풀이 전략",
  "2333": "고난도 문항으로 한 단계 더",
  "2437": "10회로 다지는 국어 실전 감각",
  "2570": "생명과학, 실전 난도로 완성",
};

export function summarizeBannerText(product = {}) {
  const editedCopy = BOOK_BANNER_COPY[String(product.id)];
  if (editedCopy) return editedCopy;
  // 추천 순위가 바뀌어도 긴 AI 원문을 노출하지 않는다.
  const type = String(product.bookType || "");
  if (/모의고사/.test(type)) return "실전처럼 풀며 완성하는 시험 감각";
  if (/기출/.test(type)) return "기출로 짚어보는 출제의 핵심";
  if (/개념/.test(type)) return "흔들리지 않는 개념의 기초";
  if (/N제/.test(type)) return "다양한 문항으로 넓히는 풀이 경험";
  if (/주간지/.test(type)) return "매일 차곡차곡 쌓는 공부 습관";
  return "다음 공부를 함께할 한 권";
}

// 2장/3장 화면 모두 빈칸 없이 맞추며 추천 교재를 최소 8개 보장한다.
// 필요한 추천 수는 직접 등록한 배너 수에 따라 8~13개다.
export function getRecommendedBannerCount(manualCount) {
  const count = Math.max(0, Math.floor(Number(manualCount) || 0));
  return Math.ceil((count + 8) / 6) * 6 - count;
}

export function buildAutomaticBookBanners(products, limit = 9, copies = new Map()) {
  return products.filter((product) => product.id && product.isPublic !== false).slice(0, limit).map((product) => ({
    id: `book-${product.id}`,
    productId: product.id,
    title: product.title,
    summary: copies.get(String(product.id)) || summarizeBannerText(product),
    priceLabel: product.priceRangeLabel && product.priceRangeLabel !== "미입력" ? product.priceRangeLabel : "가격 확인하기",
    imageDesktop: product.coverImageUrl,
    imageAlt: product.title,
    href: `/store/${product.id}`,
    isSoldOut: product.isSoldOut,
  }));
}
