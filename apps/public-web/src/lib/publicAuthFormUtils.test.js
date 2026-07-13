import test from "node:test";
import assert from "node:assert/strict";
import {
  getPasswordStrengthState,
  hasOnlyAllowedPasswordCharacters,
  hasRequiredPasswordConditions,
} from "./publicAuthFormUtils.js";

test("hasOnlyAllowedPasswordCharacters는 영문·숫자·ASCII 특수문자만 허용한다", () => {
  assert.equal(hasOnlyAllowedPasswordCharacters("abcXYZ123!@#"), true);
  assert.equal(hasOnlyAllowedPasswordCharacters(""), true);

  // 한글·공백·이모지·전각문자는 전부 거부
  assert.equal(hasOnlyAllowedPasswordCharacters("비밀번호12ab"), false);
  assert.equal(hasOnlyAllowedPasswordCharacters("abcd1234한"), false);
  assert.equal(hasOnlyAllowedPasswordCharacters("abcd 1234"), false);
  assert.equal(hasOnlyAllowedPasswordCharacters("abcd1234🙂"), false);
  assert.equal(hasOnlyAllowedPasswordCharacters("ａｂｃｄ1234"), false);
});

test("hasRequiredPasswordConditions는 한글 섞인 비밀번호를 거부한다", () => {
  // 기존 규칙(8자·영문·숫자)은 그대로 유지
  assert.equal(hasRequiredPasswordConditions("abcd1234"), true);
  assert.equal(hasRequiredPasswordConditions("Abcd123!"), true);
  assert.equal(hasRequiredPasswordConditions("abcd123"), false); // 7자
  assert.equal(hasRequiredPasswordConditions("12345678"), false); // 영문 없음
  assert.equal(hasRequiredPasswordConditions("abcdefgh"), false); // 숫자 없음

  // 회귀 케이스: 8자·영문·숫자를 채워도 한글·공백이 섞이면 거부
  assert.equal(hasRequiredPasswordConditions("안녕하세요abc123"), false);
  assert.equal(hasRequiredPasswordConditions("abcd1234한글"), false);
  assert.equal(hasRequiredPasswordConditions("abcd 1234"), false);
});

test("getPasswordStrengthState는 허용 외 문자를 '사용 불가'로 표시한다", () => {
  const state = getPasswordStrengthState("비밀번호12ab!");
  assert.equal(state.hasDisallowedCharacters, true);
  assert.equal(state.label, "사용 불가");
  assert.equal(state.tone, "danger");
});

test("getPasswordStrengthState 특수문자 규칙은 한글을 특수문자로 집계하지 않는다", () => {
  // 예전 [^A-Za-z0-9] 패턴에서는 한글이 특수문자로 잡혀 '강함'이 되던 버그
  const koreanState = getPasswordStrengthState("abcd1234한");
  const specialRule = koreanState.rules.find((rule) => rule.key === "special");
  assert.equal(specialRule.satisfied, false);

  const asciiSpecialState = getPasswordStrengthState("abcd1234!");
  const asciiSpecialRule = asciiSpecialState.rules.find((rule) => rule.key === "special");
  assert.equal(asciiSpecialRule.satisfied, true);
  assert.equal(asciiSpecialState.label, "강함");
  assert.equal(asciiSpecialState.hasDisallowedCharacters, false);
});
