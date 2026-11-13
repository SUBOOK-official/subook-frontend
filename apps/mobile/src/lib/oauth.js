import * as WebBrowser from "expo-web-browser";
import { completeOAuthSignIn, getOAuthSignInUrl } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { APP_SCHEME } from "../config.js";
import { supabase } from "./supabase.js";

// 소셜 로그인 뒤 앱으로 돌아오는 주소. Supabase 로그인 설정의 Redirect URLs에 등록돼 있어야 한다.
// App.js의 화면 이동 주소 목록에는 없는 주소라 화면이 초기화되지 않는다.
export const OAUTH_REDIRECT = `${APP_SCHEME}://auth-callback`;

// 카카오·구글 로그인: 기기 브라우저 창(Chrome 탭·iOS 인증 창)에서 인증하고 앱으로 돌아온다.
// 구글은 앱 안 웹 화면(WebView) 로그인을 막기 때문에 이 방식을 쓴다.
// 반환: "success" | "cancel". 실패하면 오류를 던진다.
export async function signInWithProvider(provider) {
  if (!supabase) throw new Error("서비스 연결을 준비하고 있어요.");
  const url = await getOAuthSignInUrl(supabase, provider, OAUTH_REDIRECT);
  const result = await WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT);
  if (result.type !== "success" || !result.url) return "cancel";
  await completeOAuthSignIn(supabase, result.url);
  return "success";
}
