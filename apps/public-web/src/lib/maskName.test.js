import assert from "node:assert/strict";
import test from "node:test";
import { maskAddress, maskName } from "../../../../packages/shared-domain/src/format.js";

test("maskName masks the middle of Korean names, keeping first and last", () => {
  assert.equal(maskName("홍길동"), "홍*동");
  assert.equal(maskName("남궁민수"), "남**수");
});

test("maskName masks the last char of two-character names", () => {
  assert.equal(maskName("홍길"), "홍*");
});

test("maskName leaves single-character names unchanged", () => {
  assert.equal(maskName("김"), "김");
});

test("maskName returns dash for empty/nullish input", () => {
  assert.equal(maskName(""), "-");
  assert.equal(maskName(null), "-");
  assert.equal(maskName(undefined), "-");
  assert.equal(maskName("   "), "-");
});

test("maskName masks each whitespace-separated token (foreign names)", () => {
  assert.equal(maskName("John Smith"), "J**n S***h");
  assert.equal(maskName("Al Bo"), "A* B*");
});

test("maskName trims surrounding whitespace before masking", () => {
  assert.equal(maskName("  홍길동  "), "홍*동");
});

test("maskAddress keeps postal code + region head, masks the detailed part", () => {
  assert.equal(
    maskAddress("[06234] 서울 강남구 테헤란로 123 401호"),
    "[06234] 서울 강남구 테헤란로 ***",
  );
});

test("maskAddress works without a postal code", () => {
  assert.equal(maskAddress("서울 강남구 테헤란로 123"), "서울 강남구 테헤란로 ***");
});

test("maskAddress leaves short addresses (<= 3 tokens) unmasked", () => {
  assert.equal(maskAddress("서울 강남구 역삼동"), "서울 강남구 역삼동");
  assert.equal(maskAddress("[12345] 서울 강남구"), "[12345] 서울 강남구");
});

test("maskAddress returns dash for empty/nullish input", () => {
  assert.equal(maskAddress(""), "-");
  assert.equal(maskAddress(null), "-");
  assert.equal(maskAddress(undefined), "-");
  assert.equal(maskAddress("   "), "-");
});

test("maskAddress keeps postal code even when nothing else remains", () => {
  assert.equal(maskAddress("[06234]"), "[06234]");
});
