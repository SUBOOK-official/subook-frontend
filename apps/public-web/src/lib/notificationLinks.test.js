import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationPath } from "./notificationLinks.js";

test("서버가 만드는 내부 경로는 그대로 통과한다", () => {
  for (const path of ["/mypage", "/mypage#orders", "/store/123", "/order/complete/45", "/"]) {
    assert.equal(resolveNotificationPath(path), path);
  }
});

test("스크립트 스킴과 외부 주소는 이동하지 않는다", () => {
  for (const value of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://evil.example/login",
    "http://subook.kr.evil.example",
    "//evil.example",
    "mypage",
  ]) {
    assert.equal(resolveNotificationPath(value), null);
  }
});

test("브라우저가 외부 주소로 해석할 수 있는 변형 경로를 막는다", () => {
  for (const value of ["/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/mypage\u0000"]) {
    assert.equal(resolveNotificationPath(value), null);
  }
});

test("문자열이 아닌 값은 null", () => {
  for (const value of [null, undefined, 0, {}, ["/mypage"]]) {
    assert.equal(resolveNotificationPath(value), null);
  }
});
