import test from "node:test";
import assert from "node:assert/strict";
import { couponScopeLabel, couponEligibleSubtotal, estimateCouponDiscountAmount } from "../../../../packages/shared-domain/src/coupons.js";

test("쿠폰 제한은 브랜드와 과목을 함께 표시한다", () => {
  assert.equal(couponScopeLabel({ scope_brand: "시대인재", scope_subject: "수학" }), "시대인재 · 수학");
  assert.equal(couponScopeLabel({ scope_subject: "과학" }), "과학");
  assert.equal(couponScopeLabel({}), "");
});

test("혼합 주문의 제한 쿠폰은 서버가 확인한 교재 금액만 할인한다", () => {
  const scoped = { scope_subject: "수학", eligible_subtotal: 12000 };
  assert.equal(estimateCouponDiscountAmount({ ...scoped, discount_type: "fixed", discount_value: 15000 }, 40000), 12000);
  assert.equal(estimateCouponDiscountAmount({ ...scoped, discount_type: "percentage", discount_value: 15, max_discount_amount: 5000 }, 40000), 1800);
  assert.equal(estimateCouponDiscountAmount({ ...scoped, discount_type: "percentage", discount_value: 50, max_discount_amount: 5000 }, 40000), 5000);
  assert.equal(estimateCouponDiscountAmount({ discount_type: "fixed", discount_value: 15000 }, 40000), 15000);
  assert.equal(estimateCouponDiscountAmount({ scope_brand: "전일학원", eligible_subtotal: 12000, discount_type: "percentage", discount_value: 10 }, 40000), 1200);
});

test("대상 금액이 없는 제한 쿠폰과 무료배송은 상품 할인액을 부풀리지 않는다", () => {
  assert.equal(couponEligibleSubtotal({ scope_subject: "수학" }, 40000), 0);
  assert.equal(couponEligibleSubtotal({ scope_subject: "수학", eligible_subtotal: 50000 }, 40000), 40000);
  assert.equal(estimateCouponDiscountAmount({ discount_type: "free_shipping" }, 40000), 0);
  assert.equal(estimateCouponDiscountAmount(null, 40000), 0);
});
