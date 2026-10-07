export function couponScopeLabel(coupon) {
  return [coupon?.scope_brand, coupon?.scope_subject].filter(Boolean).join(" · ");
}

// 제한 쿠폰의 대상 금액은 서버가 실제 book_id의 브랜드·과목으로 계산한다.
// 대상 금액이 없는 구 응답에서는 전체 주문금액으로 할인하지 않는다.
export function couponEligibleSubtotal(coupon, subtotal) {
  const orderSubtotal = Math.max(0, Number(subtotal) || 0);
  if (!coupon?.scope_brand && !coupon?.scope_subject) return orderSubtotal;
  return Math.min(orderSubtotal, Math.max(0, Number(coupon.eligible_subtotal) || 0));
}

export function estimateCouponDiscountAmount(coupon, subtotal) {
  if (!coupon) return 0;
  const eligible = couponEligibleSubtotal(coupon, subtotal);
  if (coupon.discount_type === "fixed") return Math.min(coupon.discount_value || 0, eligible);
  if (coupon.discount_type === "percentage") {
    const discount = Math.floor((eligible * (coupon.discount_value || 0)) / 100);
    return coupon.max_discount_amount == null ? discount : Math.min(discount, coupon.max_discount_amount);
  }
  // 무료배송은 상품 할인액에 포함하지 않는다.
  return 0;
}
