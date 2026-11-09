import * as WebBrowser from "expo-web-browser";
import { resolveNativeRoute } from "../../../../packages/shared-domain/src/appBridge.js";
import { SITE_ORIGIN } from "../config.js";

export const TAB_SCREENS = new Set(["Home", "Search", "Sell", "Wishlist", "My"]);

// 하단 탭 화면으로 이동한다. React Navigation 7은 pop 없이 navigate하면 탭 묶음을 새로 쌓는다.
export function goToTab(navigation, screen, params) {
  navigation.navigate("Main", { screen, params }, { pop: true });
}

// resolveNativeRoute 결과({ screen, params })로 앱 화면을 연다.
export function openNativeRoute(navigation, route) {
  if (!route?.screen) return false;
  if (TAB_SCREENS.has(route.screen)) {
    goToTab(navigation, route.screen, route.params);
  } else if (route.screen === "Product") {
    navigation.push("Product", route.params);
  } else {
    navigation.navigate(route.screen, route.params, { pop: true });
  }
  return true;
}

// 수북 주소·경로는 앱 화면(있으면) 또는 앱 안 웹 화면으로, 다른 사이트는 인앱 브라우저로 연다.
export function openSiteLink(navigation, href, title) {
  if (typeof href !== "string" || !href) return;
  let url;
  try {
    url = new URL(href, SITE_ORIGIN);
  } catch {
    return;
  }
  if (url.origin === SITE_ORIGIN) {
    if (openNativeRoute(navigation, resolveNativeRoute(url.href))) return;
    // 웹 화면 위에서 열어도 기존 화면(작성 중인 내용)을 지키도록 새로 쌓는다.
    navigation.push("Web", { path: `${url.pathname}${url.search}${url.hash}`, title });
    return;
  }
  if (url.protocol === "https:") void WebBrowser.openBrowserAsync(url.href).catch(() => {});
}
