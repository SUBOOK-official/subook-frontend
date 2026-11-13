import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_VERSION_PATH, resolveAppUpdate } from "../../../../packages/shared-domain/src/appVersion.js";
import { APP_VERSION, SITE_ORIGIN } from "../config.js";

const PROMPTED_KEY = "subook.update.prompted.v1";

// 앱이 켜질 때 한 번, 지금 버전이 계속 써도 되는 버전인지 확인한다.
// 네트워크 오류·시간 초과·형식 오류는 모두 "ok"로 처리해 앱 사용을 막지 않는다.
// 반환: { status: "ok" | "optional" | "required", latest, storeUrl }
export async function checkAppUpdate() {
  if (Platform.OS === "web") return { status: "ok", latest: null, storeUrl: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${SITE_ORIGIN}${APP_VERSION_PATH}`, { signal: controller.signal, headers: { "cache-control": "no-cache" } });
    if (!response.ok) return { status: "ok", latest: null, storeUrl: null };
    return resolveAppUpdate(await response.json(), Platform.OS, APP_VERSION);
  } catch {
    return { status: "ok", latest: null, storeUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

// 권유는 최신 버전마다 한 번만 띄운다.
export async function shouldPromptOptionalUpdate(latest) {
  try {
    if ((await AsyncStorage.getItem(PROMPTED_KEY)) === latest) return false;
    await AsyncStorage.setItem(PROMPTED_KEY, latest);
    return true;
  } catch {
    return false;
  }
}
