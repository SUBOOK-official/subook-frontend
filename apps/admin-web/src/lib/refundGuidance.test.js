import { test } from "node:test";
import assert from "node:assert/strict";
import { getUndiscountedRefundSuggestion, getReturnGuideStage, hasPreDispatchReason } from "./refundGuidance.js";

const order = { total_amount: 72000, subtotal: 72000, shipping_fee: 0, refunded_amount: 0,
  points_used: 0, discount_amount: 0, coupon_discount_amount: 0,
  items: [{ id: 1, total_price: 4000, option_label: "7월" }, { id: 2, total_price: 4000, option_label: "8월" }, { id: 3, total_price: 64000 }] };

test("같은 제목이어도 선택한 옵션의 품목 ID만 금액 제안에 포함", () => {
  assert.equal(getUndiscountedRefundSuggestion(order, [1]), 4000);
  assert.equal(getUndiscountedRefundSuggestion(order, [1, 2]), 8000);
  assert.equal(getUndiscountedRefundSuggestion(order, [1, 2, 3]), null);
  assert.equal(getUndiscountedRefundSuggestion(order, []), null);
  assert.equal(getUndiscountedRefundSuggestion(order, [999]), null);
});

test("할인·포인트·기환불·불완전하거나 맞지 않는 장부로 단순 상품값을 제안하지 않음", () => {
  for (const overrides of [
    { total_amount: 70000 }, { discount_amount: 1000 }, { coupon_discount_amount: 1000 }, { points_used: 1000 },
    { refunded_amount: 4000 }, { points_used: undefined }, { subtotal: null }, { shipping_fee: -1 },
    { discount_amount: undefined, coupon_discount_amount: undefined }, { subtotal: 72000.5 },
    { items: order.items.map(item => item.id === 2 ? { ...item, refunded_at: "2026-09-30" } : item) },
  ]) assert.equal(getUndiscountedRefundSuggestion({ ...order, ...overrides }, [1]), null, JSON.stringify(overrides));
  assert.equal(getUndiscountedRefundSuggestion({ ...order, shipping_fee: 3000, total_amount: 75000 }, [1]), 4000);
});

test("미발송과 반품 검수 단계를 구분하고 부분 도착은 계속 도착 확인으로 안내", () => {
  const active = { status: "requested", requires_return: true, items: [{ received_at: "2026-09-30" }, { received_at: null }] };
  assert.equal(getReturnGuideStage(active).number, 2);
  assert.equal(getReturnGuideStage({ ...active, requires_return: false }).number, 3);
  assert.equal(getReturnGuideStage({ ...active, status: "approved" }).number, 4);
  assert.equal(getReturnGuideStage({ ...active, status: "attention" }).title, "결제 결과 확인");
  assert.equal(hasPreDispatchReason("출고 전 재검수 탈락"), true);
  assert.equal(hasPreDispatchReason("재검수 과정 탈락"), true);
  assert.equal(hasPreDispatchReason("고객 반송 교재 훼손으로 폐기"), false);
});
