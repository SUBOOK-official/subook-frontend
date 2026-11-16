import test from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_EMAIL_DOMAIN,
  generateStaffPassword,
  isStaffEmail,
  isValidStaffId,
  normalizeStaffId,
  staffEmailFromId,
  staffIdFromEmail,
  staffPasswordProblem,
  toLoginEmail,
} from "../../api/_lib/staffAccount.js";

test("직원 아이디 규칙", () => {
  assert.equal(normalizeStaffId("  Alba01 "), "alba01");
  for (const ok of ["alba01", "book", "register2026", "a123"]) assert.equal(isValidStaffId(ok), true, ok);
  for (const bad of ["", "ab", "1alba", "alba 01", "alba@01", "알바01", "alba-01", "a".repeat(21)]) {
    assert.equal(isValidStaffId(bad), false, bad);
  }
});

test("아이디 ↔ 로그인 이메일", () => {
  assert.equal(staffEmailFromId("Alba01"), `alba01@${STAFF_EMAIL_DOMAIN}`);
  assert.equal(staffIdFromEmail(`alba01@${STAFF_EMAIL_DOMAIN}`), "alba01");
  assert.equal(staffIdFromEmail("owner@example.com"), "owner@example.com");
  assert.equal(isStaffEmail(`ALBA01@${STAFF_EMAIL_DOMAIN}`), true);
  assert.equal(isStaffEmail("owner@example.com"), false);
});

test("로그인 입력: 아이디만 넣으면 직원 주소로, 이메일은 그대로", () => {
  assert.equal(toLoginEmail(" alba01 "), `alba01@${STAFF_EMAIL_DOMAIN}`);
  assert.equal(toLoginEmail("owner@example.com"), "owner@example.com");
  assert.equal(toLoginEmail(""), "");
});

test("비밀번호 규칙", () => {
  assert.equal(staffPasswordProblem("abcd1234ef"), "");
  assert.match(staffPasswordProblem("abc123"), /10자 이상/);
  assert.match(staffPasswordProblem("abcdefghijkl"), /영문과 숫자/);
  assert.match(staffPasswordProblem("1234567890123"), /영문과 숫자/);
  assert.match(staffPasswordProblem("abcd 1234 efgh"), /공백/);
});

test("자동 생성 비밀번호는 규칙을 통과하고 헷갈리는 글자가 없다", () => {
  let seed = 7;
  const fakeRandom = (array) => {
    for (let index = 0; index < array.length; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      array[index] = seed;
    }
    return array;
  };
  for (let round = 0; round < 200; round += 1) {
    const password = generateStaffPassword(fakeRandom);
    assert.equal(password.length, 12);
    assert.equal(staffPasswordProblem(password), "", password);
    assert.equal(/[0O1lI]/.test(password), false, password);
  }
});
