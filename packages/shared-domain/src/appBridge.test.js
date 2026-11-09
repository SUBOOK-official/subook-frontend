import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupabaseAuthStorageKey,
  isExternalAppUrl,
  normalizeAppNextPath,
  parseAndroidIntentUrl,
  resolveNativeRoute,
} from "./appBridge.js";

test("웹 주소를 앱 네이티브 화면으로 바꾼다", () => {
  assert.deepEqual(resolveNativeRoute("https://subook.kr/"), { screen: "Home" });
  assert.deepEqual(resolveNativeRoute("/store/2437"), { screen: "Product", params: { productId: "2437" } });
  assert.deepEqual(resolveNativeRoute("https://subook.kr/cart"), { screen: "Cart" });
  assert.deepEqual(resolveNativeRoute("https://subook.kr/?q=%EC%8B%9C%EB%8C%80"), { screen: "Search", params: { query: "시대" } });
  assert.deepEqual(resolveNativeRoute("/store/subject/%EA%B5%AD%EC%96%B4"), { screen: "Search", params: { subject: "국어" } });
  assert.deepEqual(resolveNativeRoute("/themes/sdij"), { screen: "Theme", params: { themeId: "sdij" } });
});

test("웹 화면에서 계속 볼 주소와 다른 사이트는 바꾸지 않는다", () => {
  assert.equal(resolveNativeRoute("https://subook.kr/order"), null);
  assert.equal(resolveNativeRoute("https://subook.kr/mypage"), null);
  assert.equal(resolveNativeRoute("https://subook.kr/store/abc"), null);
  assert.equal(resolveNativeRoute("https://evil.example/store/1"), null);
  assert.equal(resolveNativeRoute("https://subook.kr.evil.example/"), null);
});

test("결제·인증 앱 주소만 외부 앱으로 연다", () => {
  assert.equal(isExternalAppUrl("ispmobile://pay"), true);
  assert.equal(isExternalAppUrl("intent://pay#Intent;scheme=ispmobile;end"), true);
  assert.equal(isExternalAppUrl("tel:15880000"), true);
  assert.equal(isExternalAppUrl("https://subook.kr/order"), false);
  assert.equal(isExternalAppUrl("about:blank"), false);
  assert.equal(isExternalAppUrl("javascript:void(0)"), false);
});

test("Android intent 주소를 앱 주소와 스토어 주소로 나눈다", () => {
  const parsed = parseAndroidIntentUrl("intent://pay?x=1#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;end");
  assert.deepEqual(parsed, {
    appUrl: "ispmobile://pay?x=1",
    packageName: "kvp.jjy.MispAndroid320",
    marketUrl: "market://details?id=kvp.jjy.MispAndroid320",
    fallbackUrl: null,
  });
  assert.equal(parseAndroidIntentUrl("https://subook.kr"), null);
  // 이상한 값은 버린다
  assert.equal(parseAndroidIntentUrl("intent://x#Intent;scheme=java script;package=a/b;end").appUrl, null);
});

test("로그인 뒤 이동 경로는 허용 목록만", () => {
  assert.equal(normalizeAppNextPath("/app/checkout"), "/app/checkout");
  assert.equal(normalizeAppNextPath("https://evil.example"), "/app/done");
  assert.equal(normalizeAppNextPath(undefined), "/app/done");
});

test("Supabase 세션 저장 키를 웹과 같게 만든다", () => {
  assert.equal(getSupabaseAuthStorageKey("https://abcd.supabase.co"), "sb-abcd-auth-token");
  assert.equal(getSupabaseAuthStorageKey("not a url"), null);
});
