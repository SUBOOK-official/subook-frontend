import { AppState, Platform } from "react-native";
import { createMobileSupabaseClient } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { getSupabaseAuthStorageKey } from "../../../../packages/shared-domain/src/appBridge.js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "../config.js";
import { secureStorage } from "./secureStorage.js";

export const supabase = createMobileSupabaseClient({
  url: SUPABASE_URL,
  publicKey: SUPABASE_PUBLIC_KEY,
  storage: secureStorage,
});

// 앱 안 웹 화면이 같은 키로 세션을 읽는다.
export const AUTH_STORAGE_KEY = getSupabaseAuthStorageKey(SUPABASE_URL);

// 앱이 화면에 있을 때만 토큰을 자동 갱신한다(Supabase React Native 권장 방식).
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
