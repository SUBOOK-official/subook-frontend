import test from "node:test";
import assert from "node:assert/strict";
import { getSettlementInfo, PICKUP_FEE_POLICY_VERSION } from "../../../../packages/shared-domain/src/settlement.js";

test("새 정책은 1만원 경계를 유지하며 명시적으로 지정된 수거에만 적용한다", () => {
  for (const [price, expected] of [[9999, 50], [10000, 45], [10001, 45]]) {
    assert.equal(getSettlementInfo(price, "2026-09-10", PICKUP_FEE_POLICY_VERSION).feePercent, expected);
  }
});

test("기존 수거는 나중에 입고·판매되어도 기존 수수료를 유지한다", () => {
  for (const date of [null, "2026-09-10", "2027-01-01"]) {
    assert.equal(getSettlementInfo(9999, date).feePercent, 45);
    assert.equal(getSettlementInfo(10000, date).feePercent, 40);
  }
  assert.equal(getSettlementInfo(9999, "2026-02-02").feePercent, 35);
  assert.equal(getSettlementInfo(10000, "2026-02-02").feePercent, 30);
  assert.equal(getSettlementInfo(10000, "2026-02-03").feePercent, 40);
});

test("정책 스냅샷이 날짜보다 우선하며 잘못된 금액을 계산하지 않는다", () => {
  assert.equal(getSettlementInfo(10000, "2026-02-01", PICKUP_FEE_POLICY_VERSION).feePercent, 45);
  assert.equal(getSettlementInfo(10000, null, "unknown").feePercent, 40);
  for (const value of [null, undefined, "", -1, "invalid"]) assert.equal(getSettlementInfo(value), null);
});
