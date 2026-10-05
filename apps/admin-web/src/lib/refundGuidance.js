// 운영자가 금액을 옮겨 적을 때만 사용하는 제안. 최종 승인액은 기존 RPC가 검증한다.
export function getUndiscountedRefundSuggestion(order, itemIds) {
  const items = order?.items ?? [];
  const ids = new Set(itemIds);
  const selected = items.filter(item => ids.has(item.id));
  if (!ids.size || selected.length !== ids.size || selected.some(item => item.refunded_at)
    || items.some(item => item.refunded_at)) return null;
  const moneyKeys = ["total_amount", "subtotal", "shipping_fee", "refunded_amount", "points_used"];
  if (moneyKeys.some(key => order[key] == null || !Number.isSafeInteger(Number(order[key])) || Number(order[key]) < 0)) return null;
  if (Number(order.refunded_amount) || Number(order.points_used)) return null;
  if (order.discount_amount == null && order.coupon_discount_amount == null) return null;
  if ([order.discount_amount, order.coupon_discount_amount].some(value => value != null && Number(value) !== 0)) return null;
  if (items.some(item => !Number.isSafeInteger(Number(item.total_price)) || Number(item.total_price) <= 0)) return null;
  const subtotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
  if (subtotal !== Number(order.subtotal) || subtotal + Number(order.shipping_fee) !== Number(order.total_amount)) return null;
  const amount = selected.reduce((sum, item) => sum + Number(item.total_price), 0);
  // 전체 환불의 배송비 처리는 기존 자동 계산이 담당한다.
  return ids.size < items.length && amount <= Number(order.total_amount) ? amount : null;
}

export function hasPreDispatchReason(reason) {
  return /(?:출고|배송|발송)\s*전|미발송|포장\s*누락|배송\s*누락|재검수.{0,12}탈락/.test(reason || "");
}

export function getReturnGuideStage(active) {
  if (!active) return { number: 1, title: "환불할 교재와 발송 여부 선택", help: "접수·금액 확인만으로는 돈이 환불되지 않습니다." };
  if (["processing", "attention"].includes(active.status)) return { number: 4, title: "결제 결과 확인", help: "결과가 확인되기 전에는 새 환불을 접수하거나 다시 송금하지 마세요." };
  if (active.status === "approved") return { number: 4, title: "최종 확인 후 환불 실행", help: "아직 환불 전입니다. 아래 대상·금액·재고 처리를 확인해주세요." };
  if (active.requires_return && active.items.some(item => !item.received_at)) return { number: 2, title: "고객이 반송한 교재 도착 확인", help: "실물이 창고에 도착한 교재만 선택합니다. 출고 전 검수 탈락은 반품 도착이 아닙니다." };
  return { number: 3, title: active.requires_return ? "반품 교재 검수·환불액 확인" : active.return_waived ? "배송된 하자 교재·환불액 확인" : "미발송 교재·환불액 확인", help: active.requires_return ? "돌아온 교재의 상태와 환불액을 확인하면 마지막 실행 단계로 이동합니다." : active.return_waived ? "하자 확인으로 회수를 면제한 교재입니다. 반품 도착 확인 없이 환불액을 확인합니다." : "미발송 교재는 고객에게서 회수하거나 도착 처리할 필요가 없습니다." };
}
