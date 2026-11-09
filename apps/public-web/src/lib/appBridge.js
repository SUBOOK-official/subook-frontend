// 수북 앱 안 웹 화면(WebView)에서 열렸을 때만 동작하는 연결부.
// 일반 브라우저 방문자에게는 아무 영향이 없다.
import {
  APP_BRIDGE_GLOBAL,
  APP_MESSAGE,
  SUBOOK_APP_SCHEME,
  resolveNativeRoute,
} from "@shared-domain/appBridge";
import { isSubookAppWebView, subookAppReady } from "@shared-supabase/publicSupabaseClient";

export function getSubookAppContext() {
  if (!isSubookAppWebView) return null;
  const context = window[APP_BRIDGE_GLOBAL];
  return context && typeof context === "object" ? context : null;
}

export function isSubookApp() {
  return isSubookAppWebView;
}

// 앱이 세션·주문 정보를 넣어 준 뒤의 앱 정보(일반 브라우저에서는 null).
export async function whenSubookAppReady() {
  await subookAppReady;
  return getSubookAppContext();
}

export function postToApp(type, payload = {}) {
  if (!isSubookAppWebView) return;
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
  } catch {
    // 앱 연결이 끊겨도 웹 화면은 계속 동작한다.
  }
}

// 결제창에서 카드사 앱 인증 후 수북 앱으로 돌아오기 위한 주소 (나이스페이 appScheme)
export function getAppPaymentScheme() {
  return isSubookAppWebView ? `${SUBOOK_APP_SCHEME}://` : null;
}

// 새 창으로 열던 주소. 앱 안 웹 화면은 새 창이 없어 앱이 대신 연다.
export function openNewWindow(url) {
  if (isSubookAppWebView) {
    postToApp(APP_MESSAGE.OPEN, { href: new URL(url, window.location.href).href });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

let installed = false;

export function installAppBridge() {
  if (!isSubookAppWebView || installed) return;
  installed = true;
  document.documentElement.classList.add("subook-app");

  // 링크를 웹 라우터보다 먼저 가로챈다.
  //  - 홈·상품·장바구니 같은 화면은 앱 화면으로 연다.
  //  - 새 창 링크(target="_blank")는 앱이 새 화면·브라우저로 연다(작성 중인 화면을 지키려고).
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download")) return;
      if (!/^https?:$/.test(anchor.protocol)) return;
      const isNativeRoute = Boolean(resolveNativeRoute(anchor.href));
      if (!isNativeRoute && anchor.target !== "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      postToApp(isNativeRoute ? APP_MESSAGE.NAVIGATE : APP_MESSAGE.OPEN, { href: anchor.href });
    },
    true,
  );

  // 버튼·자동 이동처럼 링크가 아닌 방식으로 앱 화면 경로에 들어선 경우도 앱에 알린다.
  const reportRoute = (mode) => {
    if (resolveNativeRoute(window.location.href)) {
      postToApp(APP_MESSAGE.NAVIGATE, { href: window.location.href, mode });
    }
  };
  for (const [method, mode] of [["pushState", "push"], ["replaceState", "replace"]]) {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      reportRoute(mode);
      return result;
    };
  }

  // 주문 완료 등으로 장바구니가 바뀌면 앱의 장바구니 숫자를 새로 고친다.
  window.addEventListener("cart-updated", () => postToApp(APP_MESSAGE.CART));
}
