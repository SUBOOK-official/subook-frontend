import test from "node:test";
import assert from "node:assert/strict";
import { PICKUP_BOX_TYPES, validatePickupBoxes, resizePickupBoxTypes } from "../../../../packages/shared-domain/src/pickupBoxes.js";

test("CJ 공식 서적 규격은 대2=07까지, 이형·취급제한 제외", () => {
  assert.deepEqual(PICKUP_BOX_TYPES.map(({ code, maxCm, maxKg }) => [code, maxCm, maxKg]), [
    ["01", 80, 2], ["02", 100, 5], ["03", 120, 10], ["04", 140, 15], ["07", 160, 20],
  ]);
  assert.equal(validatePickupBoxes(2, ["02", "07"]), "");
  for (const codes of [null, [], ["01"], ["01", ""], ["01", "05"], ["01", "06"], ["01", 7]]) {
    assert.ok(validatePickupBoxes(2, codes));
  }
  for (const count of [0, -1, 1.5, 6, "1oops", ""]) assert.ok(validatePickupBoxes(count, ["01"]));
});

test("박스 수 변경 시 기존 선택만 보존하고 새 박스는 미선택", () => {
  assert.deepEqual(resizePickupBoxTypes(["02", "07"], 3), ["02", "07", ""]);
  assert.deepEqual(resizePickupBoxTypes(["02", "07"], 1), ["02"]);
  assert.deepEqual(resizePickupBoxTypes(null, 2), ["", ""]);
  assert.equal(resizePickupBoxTypes([], 999).length, 5);
});
