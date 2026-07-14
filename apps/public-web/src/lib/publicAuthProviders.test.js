import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSocialDuplicateSignupMessage,
  buildSocialOnlyLoginMessage,
  getSocialProviderLabels,
  isSocialOnlyAccount,
  normalizeProviders,
} from "./publicAuthProviders.js";

test("normalizeProviders filters non-strings and dedupes", () => {
  assert.deepEqual(normalizeProviders(["kakao", "kakao", "", null, 3, "email"]), [
    "kakao",
    "email",
  ]);
  assert.deepEqual(normalizeProviders(null), []);
  assert.deepEqual(normalizeProviders("kakao"), []);
});

test("isSocialOnlyAccount is true only when providers exist without email", () => {
  assert.equal(isSocialOnlyAccount(["kakao"]), true);
  assert.equal(isSocialOnlyAccount(["kakao", "google"]), true);
  assert.equal(isSocialOnlyAccount(["kakao", "email"]), false);
  assert.equal(isSocialOnlyAccount(["email"]), false);
  assert.equal(isSocialOnlyAccount([]), false);
  assert.equal(isSocialOnlyAccount(null), false);
});

test("getSocialProviderLabels maps known providers and passes unknown through", () => {
  assert.deepEqual(getSocialProviderLabels(["kakao", "google"]), ["카카오", "Google"]);
  assert.deepEqual(getSocialProviderLabels(["email"]), []);
  assert.deepEqual(getSocialProviderLabels(["apple"]), ["apple"]);
});

test("buildSocialOnlyLoginMessage names the provider and its button", () => {
  const single = buildSocialOnlyLoginMessage(["kakao"]);
  assert.match(single, /카카오 로그인으로 가입된 계정/);
  assert.match(single, /'카카오로 시작하기'/);

  const both = buildSocialOnlyLoginMessage(["kakao", "google"]);
  assert.match(both, /카카오 또는 Google 로그인으로 가입된 계정/);

  assert.equal(buildSocialOnlyLoginMessage(["email"]), "");
  assert.equal(buildSocialOnlyLoginMessage([]), "");
});

test("buildSocialDuplicateSignupMessage names the provider", () => {
  assert.match(buildSocialDuplicateSignupMessage(["google"]), /Google 로그인으로 가입된 이메일/);
  assert.equal(buildSocialDuplicateSignupMessage([]), "");
});
