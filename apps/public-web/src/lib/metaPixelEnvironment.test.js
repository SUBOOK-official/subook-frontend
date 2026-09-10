import { test } from "node:test";
import assert from "node:assert/strict";
import { installMetaPixel, isMetaTrackingAllowed, readMetaCheckoutCookies } from "./metaPixel.js";

test("Meta: 운영 도메인만 허용하고 개발·preview·유사 도메인·GPC를 제외한다", () => {
  assert.equal(isMetaTrackingAllowed({ origin: "https://subook.kr" }, {}), true);
  for (const origin of ["http://localhost:5183", "http://127.0.0.1:5183", "http://[::1]:5183", "https://preview.vercel.app", "https://subook.kr.evil.test", "http://subook.kr", "https://subook.kr:5183"]) {
    assert.equal(isMetaTrackingAllowed({ origin }, {}), false, origin);
  }
  assert.equal(isMetaTrackingAllowed({ origin: "https://subook.kr" }, { globalPrivacyControl: true }), false);
});

test("Meta 초기화는 운영 빌드에서 한 번만 실행되고 개발 환경에서는 SDK조차 로드하지 않는다", () => {
  const scripts = [];
  const document = { createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } };
  const window = { location: { origin: "https://subook.kr" }, navigator: {} };
  assert.equal(installMetaPixel({ production: false, window, document }), false);
  assert.equal(scripts.length, 0);
  assert.equal(window.fbq, undefined);
  assert.equal(installMetaPixel({ production: true, window, document }), true);
  assert.equal(installMetaPixel({ production: true, window, document }), false);
  assert.equal(scripts.length, 1);
  assert.deepEqual(window.fbq.queue.map((args) => Array.from(args)), [["init", "27962792746720705"], ["track", "PageView"]]);
});

test("Meta 쿠키는 실제 유효한 값만 전달하고 fbclid·잘못된 인코딩을 생성/복원하지 않는다", () => {
  const fbp = "fb.1.1789000000000.123456789";
  const fbc = "fb.1.1789000000000.ActualClick_123";
  assert.deepEqual(readMetaCheckoutCookies(`session=private; _fbp=${fbp}; _fbc=${fbc}`), { fbp, fbc });
  assert.deepEqual(readMetaCheckoutCookies("_fbc=%E0%A4%A; _fbp=made-up; fbclid=abc"), { fbp: null, fbc: null });
});
