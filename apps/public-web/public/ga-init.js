// Google tag (gtag.js) — GA4 수집 시작. index.html <head>에서 가장 먼저 실행된다.
// 인라인 스크립트로 두면 콘텐츠 보안 정책(CSP)이 막기 때문에 별도 파일로 둔다.
// SPA 라우트 전환 page_view는 향상된 측정(브라우저 방문 기록 이벤트)이 자동 처리하고,
// 전자상거래 이벤트는 src/lib/analytics.js가 보낸다.
//
// 운영 방문만 수집한다. 로컬·preview·PG 심사·추적 거부 환경은 태그 자체를 로드하지 않는다.
if (location.origin === "https://subook.kr" && navigator.globalPrivacyControl !== true &&
    new URLSearchParams(location.search).get("pg_review_mode") !== "true") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", "G-EMNCLZKPMS", { send_page_view: false });
  var gaScript = document.createElement("script");
  gaScript.async = true;
  gaScript.src = "https://www.googletagmanager.com/gtag/js?id=G-EMNCLZKPMS";
  document.head.appendChild(gaScript);
}
