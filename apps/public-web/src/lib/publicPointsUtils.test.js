import assert from "node:assert/strict";
import test from "node:test";
import {
  POINT_POLICY,
  clampPointsInput,
  computeMaxUsablePoints,
  formatPoints,
  getPointsUnavailableReason,
  isReviewRewardEligible,
  normalizeMyPoints,
} from "./publicPointsUtils.js";

test("POINT_POLICY matches the agreed policy values", () => {
  assert.equal(POINT_POLICY.earnText, 500);
  assert.equal(POINT_POLICY.earnPhoto, 1000);
  assert.equal(POINT_POLICY.minReviewOrderSubtotal, 10000);
  assert.equal(POINT_POLICY.minBalanceToUse, 1000);
  assert.equal(POINT_POLICY.minOrderSubtotal, 15000);
  assert.equal(POINT_POLICY.maxUseRatio, 0.2);
});

test("review rewards require at least 10,000 won in product subtotal", () => {
  assert.equal(isReviewRewardEligible(9999), false);
  assert.equal(isReviewRewardEligible(10000), true);
});

test("computeMaxUsablePoints caps at 20% of subtotal", () => {
  assert.equal(computeMaxUsablePoints({ balance: 5000, subtotal: 21000 }), 4200);
  assert.equal(computeMaxUsablePoints({ balance: 1500, subtotal: 21000 }), 1500);
});

test("computeMaxUsablePoints returns 0 below balance or order thresholds", () => {
  assert.equal(computeMaxUsablePoints({ balance: 999, subtotal: 30000 }), 0);
  assert.equal(computeMaxUsablePoints({ balance: 3000, subtotal: 14999 }), 0);
  assert.equal(computeMaxUsablePoints({ balance: 0, subtotal: 30000 }), 0);
});

test("computeMaxUsablePoints never exceeds subtotal left after coupon", () => {
  assert.equal(computeMaxUsablePoints({ balance: 10000, subtotal: 20000, couponDiscount: 18000 }), 2000);
  assert.equal(computeMaxUsablePoints({ balance: 10000, subtotal: 20000, couponDiscount: 20000 }), 0);
});

test("getPointsUnavailableReason explains thresholds only when balance exists", () => {
  assert.equal(getPointsUnavailableReason({ balance: 0, subtotal: 5000 }), "");
  assert.equal(getPointsUnavailableReason({ balance: 500, subtotal: 30000 }), "1,000P부터 사용할 수 있어요.");
  assert.equal(
    getPointsUnavailableReason({ balance: 2000, subtotal: 10000 }),
    "상품금액 15,000원 이상 주문에서 사용할 수 있어요.",
  );
  assert.equal(getPointsUnavailableReason({ balance: 2000, subtotal: 30000 }), "");
});

test("clampPointsInput strips non-digits and clamps to max", () => {
  assert.equal(clampPointsInput("1,234", 5000), 1234);
  assert.equal(clampPointsInput("99999", 4200), 4200);
  assert.equal(clampPointsInput("abc", 4200), 0);
  assert.equal(clampPointsInput("-50", 4200), 50);
});

test("formatPoints and normalizeMyPoints", () => {
  assert.equal(formatPoints(1500), "1,500P");
  const points = normalizeMyPoints({
    balance: "1500",
    expiring_within_30_days: 500,
    next_expiry_at: "2027-09-02T00:00:00Z",
    transactions: [
      { id: 1, amount: 1000, kind: "review_earn", note: "사진 후기 작성", created_at: "2026-09-02" },
      { id: "x" },
    ],
  });
  assert.equal(points.balance, 1500);
  assert.equal(points.expiringWithin30Days, 500);
  assert.equal(points.transactions.length, 1);
  assert.equal(points.transactions[0].amount, 1000);
  assert.deepEqual(normalizeMyPoints(null).transactions, []);
});
