import Constants from "expo-constants";
import { SUBOOK_APP_SCHEME, SUBOOK_APP_UA_TOKEN, SUBOOK_SITE_ORIGIN } from "../../../packages/shared-domain/src/appBridge.js";

export const SITE_ORIGIN = SUBOOK_SITE_ORIGIN;
export const APP_SCHEME = SUBOOK_APP_SCHEME;
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
export const APP_USER_AGENT = `${SUBOOK_APP_UA_TOKEN}/${APP_VERSION}`;

// 번들에 포함되는 공개 설정(공개 publishable/anon 키). 서버 키 금지.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLIC_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function siteUrl(path = "/") {
  return new URL(path, SITE_ORIGIN).href;
}
