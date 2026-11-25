import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import handler, { normalizeCspReports } from "../../api/csp-report.js";

const legacyReport = {
  "csp-report": {
    "document-uri": "https://subook.kr/order?token=secret#hash",
    "effective-directive": "script-src-elem",
    "violated-directive": "script-src-elem",
    "blocked-uri": "https://whooo.site/a.js?x=1",
    "source-file": "https://subook.kr/assets/index-abc.js?v=2",
    "line-number": 12,
    "script-sample": "",
    disposition: "report",
  },
};

function createResponseRecorder() {
  const result = { code: 0, headers: {}, ended: false };
  return {
    result,
    res: {
      setHeader(name, value) { result.headers[name] = value; },
      status(code) { result.code = code; return this; },
      end() { result.ended = true; return this; },
    },
  };
}

function createRequest({ method = "POST", url = "/api/csp-report?app=public&mode=report", body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.method = method;
  req.url = url;
  req.headers = { "user-agent": "test-agent", ...headers };
  return req;
}

test("위반 보고는 출처·경로만 남기고 쿼리 문자열을 버린다", () => {
  const [report] = normalizeCspReports(legacyReport, { app: "public", mode: "report", userAgent: "ua" });
  assert.deepEqual(report, {
    app: "public",
    disposition: "report",
    directive: "script-src-elem",
    blocked: "https://whooo.site",
    blockedUrl: "https://whooo.site/a.js",
    documentPath: "subook.kr/order",
    sourceFile: "https://subook.kr/assets/index-abc.js:12",
    sample: "",
    userAgent: "ua",
  });
});

test("인라인·eval 같은 열쇠말과 옛 브라우저 형식을 받는다", () => {
  const [inline] = normalizeCspReports({
    "csp-report": {
      "document-uri": "https://admin.subook.kr/admin/orders",
      "violated-directive": "script-src 'self' 'report-sample'",
      "blocked-uri": "inline",
      "script-sample": "alert(document.cookie)",
    },
  }, { app: "admin", mode: "enforce" });
  assert.equal(inline.app, "admin");
  assert.equal(inline.disposition, "enforce");
  assert.equal(inline.directive, "script-src");
  assert.equal(inline.blocked, "inline");
  assert.equal(inline.sample, "alert(document.cookie)");

  const [dataUri] = normalizeCspReports({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "data" } });
  assert.equal(dataUri.blocked, "data");
  const [empty] = normalizeCspReports({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "" } });
  assert.equal(empty.blocked, "unknown");
});

test("Reporting API 형식도 받고 한 요청에서 5건까지만 처리한다", () => {
  const item = {
    type: "csp-violation",
    body: {
      documentURL: "https://subook.kr/store/12",
      effectiveDirective: "connect-src",
      blockedURL: "wss://evil.example/socket",
      disposition: "enforce",
      sourceFile: "https://subook.kr/assets/a.js",
      lineNumber: 3,
    },
  };
  const reports = normalizeCspReports([{ type: "deprecation", body: {} }, ...Array.from({ length: 8 }, () => item)]);
  assert.equal(reports.length, 5);
  assert.equal(reports[0].blocked, "wss://evil.example");
  assert.equal(reports[0].disposition, "enforce");
});

test("브라우저 확장이 끼워 넣은 것과 형식이 틀린 보고는 버린다", () => {
  const withBlocked = (blocked, extra = {}) => normalizeCspReports({
    "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": blocked, ...extra },
  });
  assert.equal(withBlocked("chrome-extension://abcdef/content.js").length, 0);
  assert.equal(withBlocked("moz-extension://abcdef/content.js").length, 0);
  assert.equal(withBlocked("https://ok.example/a.js", { "source-file": "safari-web-extension://x/y.js" }).length, 0);
  assert.equal(normalizeCspReports({ "csp-report": { "effective-directive": "script-src; x", "blocked-uri": "inline" } }).length, 0);
  assert.equal(normalizeCspReports({ "csp-report": "nope" }).length, 0);
  assert.equal(normalizeCspReports(null).length, 0);
  assert.equal(normalizeCspReports("text").length, 0);
});

test("앱·모드는 정해진 값만 쓴다", () => {
  const [report] = normalizeCspReports(
    { "csp-report": { "effective-directive": "img-src", "blocked-uri": "data" } },
    { app: "evil", mode: "whatever" },
  );
  assert.equal(report.app, "public");
  assert.equal(report.disposition, "report");
});

test("수집 함수는 본문을 직접 읽어 service_role RPC로 넘기고 항상 204로 끝낸다", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://project.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const ok = createResponseRecorder();
  await handler(createRequest({
    url: "/api/csp-report?app=admin&mode=enforce",
    body: JSON.stringify(legacyReport),
    headers: { "content-type": "application/csp-report" },
  }), ok.res);
  assert.equal(ok.result.code, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://project.supabase.co/rest/v1/rpc/record_csp_violation");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-key");
  const sent = JSON.parse(calls[0].init.body).p_report;
  assert.equal(sent.app, "admin");
  assert.equal(sent.disposition, "report");
  assert.equal(sent.blocked, "https://whooo.site");
  assert.equal(sent.userAgent, "test-agent");

  const broken = createResponseRecorder();
  await handler(createRequest({ body: "{not json" }), broken.res);
  assert.equal(broken.result.code, 204);

  const tooLarge = createResponseRecorder();
  await handler(createRequest({ body: JSON.stringify({ "csp-report": { pad: "x".repeat(20_000) } }) }), tooLarge.res);
  assert.equal(tooLarge.result.code, 204);
  assert.equal(calls.length, 1);

  const wrongMethod = createResponseRecorder();
  await handler(createRequest({ method: "GET" }), wrongMethod.res);
  assert.equal(wrongMethod.result.code, 405);
});

// ── 정책과 코드가 어긋나지 않게 지키는 검사 ─────────────────────────────────
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const deployConfig = JSON.parse(readFileSync(new URL("../../vercel.deploy.json", import.meta.url), "utf8"));
const deployHeaders = Object.fromEntries(
  deployConfig.headers.find((entry) => entry.source === "/(.*)").headers.map(({ key, value }) => [key, value]),
);

test("index.html에는 인라인 실행 스크립트를 두지 않는다 (CSP가 막는다)", () => {
  const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  for (const [, attrs, body] of scripts) {
    if (/type="application\/ld\+json"/i.test(attrs)) continue;
    assert.match(attrs, /\bsrc="/, `인라인 스크립트 발견: ${body.trim().slice(0, 60)}`);
    assert.equal(body.trim(), "");
  }
});

test("배포 설정의 CSP는 외부 스크립트 출처를 모두 허용 목록에 담고 있다", () => {
  const policy = deployHeaders["Content-Security-Policy-Report-Only"] ?? deployHeaders["Content-Security-Policy"];
  const scriptSrc = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src "));
  assert.ok(scriptSrc);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
  // GA(ga-init.js)·Meta 픽셀·나이스페이·토스·우편번호 — 코드가 실제로 불러오는 외부 스크립트
  for (const origin of [
    "https://www.googletagmanager.com",
    "https://connect.facebook.net",
    "https://pay.nicepay.co.kr",
    "https://js.tosspayments.com",
    "https://t1.daumcdn.net",
  ]) {
    assert.ok(scriptSrc.split(/\s+/).includes(origin), `${origin} 누락`);
  }
  assert.match(deployHeaders["Content-Security-Policy"], /object-src 'none'/);
  assert.match(policy, /report-uri \/api\/csp-report\?app=public/);
});
