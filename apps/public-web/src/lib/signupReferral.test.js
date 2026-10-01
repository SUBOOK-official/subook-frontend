import test from "node:test";
import assert from "node:assert/strict";
import { clearSignupReferral, getSignupReferralCode, referralReturnPath, referralSignupPath, rememberSignupReferral } from "./signupReferral.js";

test("초대 링크는 이메일 가입·OAuth 복귀에 유지하고 정상 발급 후 제거한다", () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) };
  const code = "a".repeat(32);
  clearSignupReferral(storage);
  assert.equal(getSignupReferralCode(`?ref=${code}`, storage), code);
  assert.equal(getSignupReferralCode("?next=/mypage", storage), code);
  assert.equal(referralSignupPath(code), `/signup?ref=${code}`);
  assert.equal(referralReturnPath(code), `/event/invite?ref=${code}`);
  clearSignupReferral(storage);
  assert.equal(getSignupReferralCode("", storage), "");
  assert.equal(rememberSignupReferral("<script>", storage), "");
  assert.equal(getSignupReferralCode("?ref=someone@email.com", storage), "");
});

test("브라우저 저장소가 제한되어도 초대 링크와 OAuth 반환 URL로 가입할 수 있다", () => {
  const storage = { setItem() { throw Error("blocked"); }, getItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const code = "b".repeat(32);
  clearSignupReferral(storage);
  assert.equal(getSignupReferralCode(`?ref=${code}`, storage), code);
  assert.equal(getSignupReferralCode("", storage), code);
  clearSignupReferral(storage);
  assert.equal(getSignupReferralCode(referralReturnPath(code).split("?")[1], storage), code);
  clearSignupReferral(storage);
});
