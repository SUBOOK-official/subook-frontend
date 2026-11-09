// 배송비 정책 — 웹(public-web)과 앱(mobile)의 표시 기준(source of truth).
// ⚠️ 실제 청구는 백엔드 create_order(v_free_shipping_threshold = 50000)가 결정하므로
// 표시값은 반드시 백엔드와 일치해야 한다. 기준 변경 시 백엔드·환불정책 문구와 함께 조정할 것.
// 2026-07-07 운영 확정: 3,500 → 3,000원 (백엔드 20260707110000 마이그레이션과 동시 변경)
export const SHIPPING_FEE = 3000;
export const FREE_SHIPPING_THRESHOLD = 50000;

export function calculateShippingFee(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}
