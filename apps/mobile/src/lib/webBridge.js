import { Linking, Platform } from "react-native";
import {
  APP_BRIDGE_GLOBAL,
  APP_READY_EVENT,
  IOS_PAYMENT_APP_STORE_URLS,
  parseAndroidIntentUrl,
} from "../../../../packages/shared-domain/src/appBridge.js";
import { APP_SCHEME, APP_VERSION, SITE_ORIGIN } from "../config.js";
import { AUTH_STORAGE_KEY } from "./supabase.js";
import { showDialog } from "../components/Dialog.jsx";

// 웹 화면에 넣는 스크립트는 수북 주소에서만 동작한다.
// 카드사·카카오 등 다른 사이트 화면에는 로그인 정보를 절대 넣지 않는다.
function guarded(body) {
  return `(function(){try{if(window.location.origin!==${JSON.stringify(SITE_ORIGIN)})return;${body}}catch(e){}})();true;`;
}

function sessionStatements(sessionJson) {
  if (!AUTH_STORAGE_KEY) return "";
  const key = JSON.stringify(AUTH_STORAGE_KEY);
  return sessionJson
    ? `localStorage.setItem(${key},${JSON.stringify(sessionJson)});`
    : `localStorage.removeItem(${key});`;
}

// 앱 표시, 현재 로그인, 주문할 교재를 웹 화면에 넣고 "준비 끝"을 알린다.
// iOS는 페이지가 그려지기 전에 확실히 실행된다. Android는 그 시점이 보장되지 않아
// 웹이 "ready"를 보내면 한 번 더 넣는다(screens/WebScreen.jsx). 여러 번 실행돼도 결과는 같다.
export function buildBootstrapScript({ sessionJson, checkout }) {
  const context = {
    version: APP_VERSION,
    platform: Platform.OS,
    scheme: `${APP_SCHEME}://`,
    checkout: checkout ?? null,
  };
  return guarded(
    `window[${JSON.stringify(APP_BRIDGE_GLOBAL)}]=${JSON.stringify(context)};${sessionStatements(sessionJson)}`
    + `window.dispatchEvent(new Event(${JSON.stringify(APP_READY_EVENT)}));`,
  );
}

// 웹 화면이 열려 있는 동안 앱이 토큰을 갱신했을 때
export function buildSessionUpdateScript(sessionJson) {
  return guarded(sessionStatements(sessionJson));
}

async function tryOpen(url) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

// 카드사·은행·본인인증 앱, 전화·메일 링크를 연다(나이스페이 앱 연동 가이드 기준).
export async function openExternalAppUrl(url) {
  if (Platform.OS === "android" && /^intent:/i.test(url)) {
    const intent = parseAndroidIntentUrl(url);
    if (intent?.appUrl && (await tryOpen(intent.appUrl))) return;
    if (intent?.fallbackUrl && (await tryOpen(intent.fallbackUrl))) return;
    if (intent?.marketUrl && (await tryOpen(intent.marketUrl))) return;
    showDialog("앱을 열 수 없어요", "결제에 필요한 앱이 설치되어 있는지 확인해 주세요.");
    return;
  }
  if (await tryOpen(url)) return;
  const scheme = url.split(":")[0].toLowerCase();
  const storeUrl = Platform.OS === "ios" ? IOS_PAYMENT_APP_STORE_URLS[scheme] : null;
  if (storeUrl && (await tryOpen(storeUrl))) return;
  showDialog("앱을 열 수 없어요", "결제나 인증에 필요한 앱이 설치되어 있는지 확인해 주세요.");
}
