// 수북 앱(iOS·Android) ↔ subook.kr 웹 화면 연결 약속.
// 앱은 결제·수거 신청·마이페이지 등 일부 화면을 앱 안 웹 화면(WebView)으로 띄운다.
// 웹(public-web)과 앱(mobile)이 같은 값을 써야 하므로 이 파일 한 곳에서만 정의한다.

export const SUBOOK_SITE_ORIGIN = "https://subook.kr";
export const SUBOOK_APP_SCHEME = "subook";
export const SUBOOK_APP_UA_TOKEN = "SubookApp";
// 앱이 웹 화면에 심는 전역 객체 이름 (window.__SUBOOK_APP__)
export const APP_BRIDGE_GLOBAL = "__SUBOOK_APP__";
// 앱이 전역 객체와 로그인 세션을 다 넣었을 때 웹 화면에 보내는 이벤트
export const APP_READY_EVENT = "subook-app-ready";

export const APP_MESSAGE = Object.freeze({
  READY: "ready", // 웹 → 앱: 세션·주문 정보를 넣어 주세요
  AUTH: "auth", // 웹 → 앱: 로그인·갱신·로그아웃 결과
  NAVIGATE: "navigate", // 웹 → 앱: 앱 화면(홈·상품·장바구니 등)으로 이동
  OPEN: "open", // 웹 → 앱: 새 창으로 열 주소(앱이 새 화면·브라우저로 연다)
  CLOSE: "close", // 웹 → 앱: 이 웹 화면 닫기
  CART: "cart", // 웹 → 앱: 장바구니가 바뀜
});

// 앱 안 웹 화면에서 로그인 뒤 이어갈 수 있는 경로(열린 리다이렉트 방지용 허용 목록)
export const APP_LOGIN_NEXT_PATHS = Object.freeze(["/app/done", "/app/checkout"]);

export function normalizeAppNextPath(value) {
  return APP_LOGIN_NEXT_PATHS.includes(value) ? value : "/app/done";
}

// Supabase JS가 세션을 저장하는 기본 키(sb-<프로젝트 ref>-auth-token).
// 웹과 앱이 같은 키를 써야 앱이 넣어 준 로그인을 웹이 그대로 읽는다.
export function getSupabaseAuthStorageKey(supabaseUrl) {
  try {
    const { hostname } = new URL(supabaseUrl);
    const projectRef = hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 웹 주소 → 앱 네이티브 화면. null이면 웹 화면 안에서 계속 본다.
export function resolveNativeRoute(input) {
  let url;
  try {
    url = new URL(input, SUBOOK_SITE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== SUBOOK_SITE_ORIGIN) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams.get("q")?.trim();

  if (path === "/") return query ? { screen: "Search", params: { query } } : { screen: "Home" };
  if (path === "/store") return { screen: "Search", params: query ? { query } : {} };
  if (path === "/cart") return { screen: "Cart" };
  if (path === "/sell") return { screen: "Sell" };

  const product = path.match(/^\/store\/(\d+)$/);
  if (product) return { screen: "Product", params: { productId: product[1] } };

  const subject = path.match(/^\/store\/subject\/([^/]+)$/);
  if (subject) return { screen: "Search", params: { subject: safeDecode(subject[1]) } };

  const theme = path.match(/^\/themes\/([^/]+)$/);
  if (theme) return { screen: "Theme", params: { themeId: safeDecode(theme[1]) } };

  return null;
}

// 앱이 직접 열어야 하는(웹 화면이 처리할 수 없는) 주소인지.
// 카드사·은행·본인인증 앱 호출(ispmobile://, intent:// 등)과 전화·메일 링크가 해당된다.
export function isExternalAppUrl(url) {
  if (typeof url !== "string" || !url) return false;
  return !/^(https?|about|data|blob|javascript):/i.test(url);
}

// Android 결제창의 intent:// 주소를 앱이 열 수 있는 형태로 바꾼다.
// 예) intent://pay#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;end
//   → appUrl ispmobile://pay, 설치 안 됐으면 marketUrl로 Play 스토어 이동
export function parseAndroidIntentUrl(url) {
  if (typeof url !== "string" || !/^intent:/i.test(url)) return null;
  const hashIndex = url.indexOf("#Intent;");
  const target = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const params = {};
  if (hashIndex >= 0) {
    for (const part of url.slice(hashIndex + "#Intent;".length).split(";")) {
      if (part === "end") break;
      const separator = part.indexOf("=");
      if (separator > 0) params[part.slice(0, separator)] = part.slice(separator + 1);
    }
  }
  const rest = target.replace(/^intent:(\/\/)?/i, "");
  const scheme = /^[a-z][a-z0-9+.-]*$/i.test(params.scheme ?? "") ? params.scheme : null;
  const packageName = /^[A-Za-z0-9_.]+$/.test(params.package ?? "") ? params.package : null;
  const fallback = params["S.browser_fallback_url"] ? safeDecode(params["S.browser_fallback_url"]) : null;
  return {
    appUrl: scheme ? `${scheme}://${rest}` : null,
    packageName,
    marketUrl: packageName ? `market://details?id=${packageName}` : null,
    fallbackUrl: fallback && /^https:\/\//i.test(fallback) ? fallback : null,
  };
}

// iOS에서 앱이 설치되지 않은 결제 앱 → App Store 설치 페이지 (나이스페이 앱 연동 가이드 기준)
export const IOS_PAYMENT_APP_STORE_URLS = Object.freeze({
  ispmobile: "https://apps.apple.com/kr/app/id369125087",
  "kftc-bankpay": "https://apps.apple.com/kr/app/id398456030",
});
