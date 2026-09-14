export const RETURN_SHIPPING_FEE = 6000;
export const RETURN_REASONS = [
  { value: "buyer_remorse", label: "단순변심" },
  { value: "seller_fault", label: "상품 하자·오배송" },
  { value: "other", label: "기타·별도 협의" },
];
export const RETURN_STATUS_LABELS = {
  requested: "수거·도착 대기", received: "검수 대기", review_hold: "검수 보류",
  approved: "환불 실행 대기", processing: "환불 결과 확인 중", attention: "환불 결과 확인 필요",
  refunded: "환불 완료", cancelled: "반품 종결",
};
export function requiresPhysicalReturn(order) {
  return ["shipping", "delivered", "confirmed", "returned"].includes(order?.status)
    || Boolean(order?.tracking_number || order?.shipping_tracking_number);
}
// 화면의 예상액 전용. 승인액은 DB가 현재 주문·반품 품목으로 다시 계산해 저장한다.
export function getReturnRefundPreview(order, itemIds, reasonCode, requiresReturn = requiresPhysicalReturn(order)) {
  const items = order?.items ?? [];
  const ids = new Set(itemIds);
  const remaining = Math.max(0, Number(order?.total_amount ?? 0) - Number(order?.refunded_amount ?? 0));
  const isWholeOrder = items.length > 0 && items.every(item => !item.refunded_at && ids.has(item.id))
    && ids.size === items.length && Number(order?.refunded_amount ?? 0) === 0;
  const automatic = isWholeOrder && ["buyer_remorse", "seller_fault"].includes(reasonCode);
  const deduction = automatic && requiresReturn && reasonCode === "buyer_remorse" ? RETURN_SHIPPING_FEE : 0;
  return { automatic, remaining, deduction, amount: automatic ? remaining - deduction : null };
}
export function getBuyerReturnLabel(status) {
  return {
    requested: "반품 접수 · 수거 대기", received: "반품 도착 · 검수 중", review_hold: "반품 상태 확인 중",
    approved: "검수 완료 · 환불 예정", processing: "환불 처리 중", attention: "환불 처리 확인 중", refunded: "반품 환불 완료", cancelled: "반품 접수 종결",
  }[status] ?? null;
}
