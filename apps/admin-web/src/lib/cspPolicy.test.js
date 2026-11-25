import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 관리자 화면은 콘텐츠 보안 정책(CSP)으로 "이 사이트의 스크립트 파일만 실행"을 강제한다.
// 정책과 코드가 어긋나면 화면이 통째로 멈추므로, 어긋나기 쉬운 지점을 여기서 지킨다.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const deployConfig = JSON.parse(read("../../vercel.deploy.json"));
const headers = Object.fromEntries(
  deployConfig.headers.find((entry) => entry.source === "/(.*)").headers.map(({ key, value }) => [key, value]),
);
const directive = (policy, name) =>
  policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";

test("관리자 HTML 진입 파일에는 인라인 스크립트가 없다", () => {
  for (const file of ["../../index.html", "../../label-preview.html"]) {
    const scripts = [...read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, `${file}: 스크립트 없음`);
    for (const [, attrs, body] of scripts) {
      assert.match(attrs, /\bsrc="\//, `${file}: 외부 주소 또는 인라인 스크립트`);
      assert.equal(body.trim(), "", `${file}: 인라인 스크립트`);
    }
  }
});

test("차단 정책은 같은 사이트의 스크립트만 허용한다", () => {
  const scriptSrc = directive(headers["Content-Security-Policy"], "script-src");
  assert.deepEqual(
    scriptSrc.split(/\s+/).slice(1).sort(),
    ["'report-sample'", "'self'", "'wasm-unsafe-eval'"],
  );
  // PDF 미리보기·오류 화면 녹화(Sentry)가 워커를 쓴다.
  assert.equal(directive(headers["Content-Security-Policy"], "worker-src"), "worker-src 'self' blob:");
  assert.match(headers["Content-Security-Policy"], /object-src 'none'/);
  assert.match(headers["Content-Security-Policy"], /report-uri https:\/\/subook\.kr\/api\/csp-report\?app=admin&mode=enforce/);
});

test("관찰 정책도 인라인·eval을 열어 두지 않는다", () => {
  const scriptSrc = directive(headers["Content-Security-Policy-Report-Only"], "script-src");
  assert.ok(scriptSrc);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
});
