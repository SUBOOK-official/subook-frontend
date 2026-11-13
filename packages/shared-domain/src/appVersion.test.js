import test from "node:test";
import assert from "node:assert/strict";
import { compareAppVersions, resolveAppUpdate } from "./appVersion.js";

test("앱 버전을 숫자 자리별로 비교한다", () => {
  assert.equal(compareAppVersions("0.2.0", "0.10.0"), -1);
  assert.equal(compareAppVersions("1.0", "1.0.0"), 0);
  assert.equal(compareAppVersions("1.2.3", "1.2.2"), 1);
  assert.equal(compareAppVersions("abc", "1.0.0"), 0);
});

test("최소 버전보다 낮으면 필수, 최신보다 낮고 스토어 주소가 있으면 권유", () => {
  const config = { android: { minimum: "0.2.0", latest: "0.3.0", storeUrl: "https://play.google.com/store/apps/details?id=kr.subook.app" } };
  assert.equal(resolveAppUpdate(config, "android", "0.1.0").status, "required");
  assert.deepEqual(resolveAppUpdate(config, "android", "0.2.0"), { status: "optional", latest: "0.3.0", storeUrl: config.android.storeUrl });
  assert.equal(resolveAppUpdate(config, "android", "0.3.0").status, "ok");
});

test("설정이 없거나 이상하면 앱 사용을 막지 않는다", () => {
  assert.equal(resolveAppUpdate(null, "android", "0.1.0").status, "ok");
  assert.equal(resolveAppUpdate({ android: "x" }, "android", "0.1.0").status, "ok");
  assert.equal(resolveAppUpdate({ android: { minimum: "9.0.0" } }, "ios", "0.1.0").status, "ok");
  assert.equal(resolveAppUpdate({ android: { minimum: "9.0.0" } }, "android", "?").status, "ok");
  // 스토어 주소가 없으면 권유는 띄우지 않는다. 필수 업데이트는 주소 없이도 알린다.
  assert.equal(resolveAppUpdate({ android: { latest: "9.0.0", storeUrl: "" } }, "android", "0.1.0").status, "ok");
  assert.deepEqual(resolveAppUpdate({ android: { minimum: "9.0.0", storeUrl: "javascript:alert(1)" } }, "android", "0.1.0"), { status: "required", latest: null, storeUrl: null });
});
