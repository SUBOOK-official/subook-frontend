import test from "node:test";
import assert from "node:assert/strict";
import { formatPerformanceValue, koreaToday, mergePerformanceDaily, metricChange, metricRatio,
  performanceRange, previousPerformanceRange, validatePerformanceRange } from "./performanceMetrics.js";

test("KST midnight, seven inclusive days, leap day, and comparison across years", () => {
  assert.equal(koreaToday(new Date("2026-09-11T15:00:00Z")), "2026-09-12");
  assert.deepEqual(performanceRange("7d", "2026-09-12"), { from: "2026-09-06", to: "2026-09-12" });
  assert.deepEqual(performanceRange("month", "2024-02-29"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(previousPerformanceRange({ from: "2026-01-01", to: "2026-01-07" }), { from: "2025-12-25", to: "2025-12-31" });
});
test("invalid, reversed, future, and oversized ranges are rejected", () => {
  for (const range of [["2026-02-30", "2026-03-01"], ["2026-09-12", "2026-09-01"], ["2026-09-12", "2026-09-13"], ["2025-01-01", "2026-09-12"], [null, "2026-09-12"]]) {
    assert.ok(validatePerformanceRange(...range, "2026-09-12"));
  }
  assert.equal(validatePerformanceRange("2024-01-01", "2024-12-31", "2026-09-12"), "");
});
test("zero denominator and unavailable data remain distinct from a zero outcome", () => {
  assert.equal(metricRatio(0, 2), 0);
  assert.equal(metricRatio(100, 0), null);
  assert.equal(metricRatio(null, 10), null);
  assert.equal(formatPerformanceValue(null), "—");
  assert.equal(formatPerformanceValue(0), "0");
  assert.equal(metricChange(10, 0), null);
  assert.deepEqual(metricChange(50, 40), { value: 25, unit: "%" });
  assert.deepEqual(metricChange(15, 20, true), { value: -5, unit: "%p" });
});
test("daily gaps fill zero only when source successfully loaded, rates stay undefined", () => {
  const sales = [{ date: "2026-09-12", orders: 2 }];
  assert.equal(mergePerformanceDaily(sales, { status: "error" })[0].visitors, null);
  const row = mergePerformanceDaily(sales, { status: "ready", daily: [] }, { status: "ready", daily: [] })[0];
  assert.equal(row.visitors, 0); assert.equal(row.spend, 0); assert.equal(row.cpa, null); assert.equal(row.cvr, null);
  assert.equal(row.orders, 2);
});
