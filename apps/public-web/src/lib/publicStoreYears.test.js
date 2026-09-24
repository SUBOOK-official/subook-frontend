import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesStorefrontYear,
  toStorefrontRpcYears,
} from "../../../../packages/shared-domain/src/storefrontYears.js";

test("RPC year filters preserve exact years and encode other without broadening invalid input", () => {
  assert.deepEqual(toStorefrontRpcYears(["2027", "2026", "2025"]), [2027, 2026, 2025]);
  assert.deepEqual(toStorefrontRpcYears(["other"]), [0]);
  assert.deepEqual(toStorefrontRpcYears(["2027", "other", "2027"]), [2027, 0]);
  assert.deepEqual(toStorefrontRpcYears([null, "", "invalid", "0", -1]), []);
});

test("other includes old, future and missing years, and combines with exact selections", () => {
  const years = [2027, 2026, 2025, 2024, 2023, 2028, null];
  const matching = (selected) => years.filter((year) => matchesStorefrontYear(year, selected));
  assert.deepEqual(matching([]), years);
  assert.deepEqual(matching(["2027"]), [2027]);
  assert.deepEqual(matching(["other"]), [2024, 2023, 2028, null]);
  assert.deepEqual(matching(["2026", "other"]), [2026, 2024, 2023, 2028, null]);
  assert.deepEqual(matching(["2027", "2026", "2025", "other"]), years);
});
