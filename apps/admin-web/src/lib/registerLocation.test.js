import test from "node:test";
import assert from "node:assert/strict";
import { getRegisterLocation } from "./registerLocation.js";

test("첫 교재와 기존 교재의 빈 위치는 입력 순서에 관계없이 기본 위치를 사용한다", () => {
  for (const location of ["", "  ", null, undefined]) {
    assert.equal(getRegisterLocation(location, "D13"), "D13");
  }
});

test("기본 위치를 고치면 상속한 위치만 바뀌고 교재별 지정값은 유지한다", () => {
  const locations = ["", "C9", "D13"];
  assert.deepEqual(locations.map(location => getRegisterLocation(location, "D13")), ["D13", "C9", "D13"]);
  assert.deepEqual(locations.map(location => getRegisterLocation(location, "D14")), ["D14", "C9", "D13"]);
  assert.deepEqual(locations.map(location => getRegisterLocation(location, "")), ["", "C9", "D13"]);
});

test("초안 복원 후에도 공통 위치와 개별 위치를 구분한다", () => {
  const draft = JSON.parse(JSON.stringify({ batchLocation: "D13", newRows: [{ location: "" }], existingAdditions: [{ location: "C9" }] }));
  assert.equal(getRegisterLocation(draft.newRows[0].location, draft.batchLocation), "D13");
  assert.equal(getRegisterLocation(draft.existingAdditions[0].location, draft.batchLocation), "C9");
});

test("위치를 입력하지 않은 등록과 편집 중인 문자열을 그대로 지원한다", () => {
  assert.equal(getRegisterLocation(undefined, undefined), "");
  assert.equal(getRegisterLocation("", ""), "");
  assert.equal(getRegisterLocation(" A1 ", "D13"), " A1 ");
  assert.equal(getRegisterLocation("", " D13 "), " D13 ");
});
