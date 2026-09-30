import test from "node:test";
import assert from "node:assert/strict";
import { summarizeJeonilSettlements } from "./jeonilSettlement.js";

test("전일학원은 주문 가격 스냅샷과 수량을 합산하고 옵션별로 구분한다", () => {
  const row = { product_id: 2370, book_title: "FULL", quantity: 1, sale_amount: 59000, fee_amount: 29500, net_amount: 29500 };
  const summary = summarizeJeonilSettlements([row, { ...row, quantity: 2, sale_amount: 118000, fee_amount: 59000, net_amount: 59000 }, { ...row, product_id: 2437, book_title: "미니", book_option: "SET A", sale_amount: 39000, fee_amount: 19500, net_amount: 19500 }]);
  assert.equal(summary.quantity, 4);
  assert.equal(summary.products.length, 2);
  assert.equal(summary.products[0].quantity, 3);
  assert.equal(summary.netAmount, 108000);
  assert.equal(summary.saleAmount, summary.feeAmount + summary.netAmount);
});
test("잘못된 금액을 0원 지급으로 숨기지 않는다", () => {
  assert.throws(() => summarizeJeonilSettlements([{ quantity: 1, sale_amount: "invalid" }]));
  assert.equal(summarizeJeonilSettlements([]).netAmount, 0);
});
