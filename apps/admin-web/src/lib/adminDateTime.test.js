import test from "node:test";
import assert from "node:assert/strict";
import { toKstInput, fromKstInput, kstDateBounds, kstDateString, couponAvailability } from "./adminDateTime.js";

test("UTC midnight boundary round trips through KST regardless of browser timezone", () => {
  assert.equal(toKstInput("2026-09-28T15:00:00+00:00"), "2026-09-29T00:00");
  assert.equal(fromKstInput("2026-09-29T00:00"), "2026-09-28T15:00:00.000Z");
  assert.deepEqual(kstDateBounds("2026-09-29", "2026-09-29"), { from: "2026-09-28T15:00:00.000Z", to: "2026-09-29T15:00:00.000Z" });
  assert.equal(fromKstInput(""), null);
  assert.throws(() => fromKstInput("2026-02-30T00:00"));
});
test("enabled expired coupons are not described as available", () => {
  assert.equal(couponAvailability({ is_active: true, valid_until: "2026-09-01" }, Date.parse("2026-10-01")), "만료");
  assert.equal(couponAvailability({ is_active: true, total_quantity: 5, issued_count: 5 }), "발급 소진");
});
test("KST date string does not slip to the previous day before 9am", () => {
  // 2026-11-16 06:00 KST = 2026-11-15 21:00 UTC
  const earlyMorning = Date.parse("2026-11-15T21:00:00Z");
  assert.equal(kstDateString(0, earlyMorning), "2026-11-16");
  assert.equal(kstDateString(-7, earlyMorning), "2026-11-09");
  assert.equal(kstDateString(0, Date.parse("2026-12-31T15:00:00Z")), "2027-01-01");
});
