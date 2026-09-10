// 2026-09-10 커머스 관리자에서 상품 링크와 대조한 기존 수동 등록 항목.
// 카탈로그 1603666397994237의 콘텐츠 ID는 생성 후 수정 불가이므로 기존 광고
// 상품을 유지하고 Meta로 보내는 ID만 변환한다. GA4·주문/재고 ID는 바꾸지 않는다.
// api/prerender-product.js의 동일 매핑과 함께 관리 (서버리스 배포 경로 분리).
const META_CATALOG_CONTENT_IDS = Object.freeze({
  "2370": "gxav9zwrza", // FULL 7회분
  "2371": "417vdy5t1z", // 미니 30일분
  "2437": "n7llsz4qrh", // 미니 10회분
});

export function getMetaContentId(productId) {
  if (productId == null) return null;
  const id = String(productId).trim();
  if (!id) return null;
  return META_CATALOG_CONTENT_IDS[id] ?? id;
}
