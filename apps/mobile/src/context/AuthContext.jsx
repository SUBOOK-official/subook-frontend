import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../lib/supabase.js";
import { showDialog } from "../components/Dialog.jsx";

const AuthContext = createContext(null);

export const LOGIN_WEB_ROUTE = { path: "/app/login?next=/app/done", title: "로그인" };

// 앱이 로그인 상태의 주인이다. 앱 안 웹 화면에서 로그인·갱신·로그아웃하면
// 그 결과를 받아 앱 세션에 반영한다(lib/webBridge.js, screens/WebScreen.jsx).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!supabase);
  const knownRefreshToken = useRef(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        knownRefreshToken.current = data.session?.refresh_token ?? null;
        setSession(data.session ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      knownRefreshToken.current = next?.refresh_token ?? null;
      setSession(next ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const adoptWebSession = useCallback(async (sessionJson) => {
    if (!supabase) return;
    if (!sessionJson) {
      // 웹 화면에서 로그아웃했다.
      if (knownRefreshToken.current) {
        knownRefreshToken.current = null;
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(sessionJson);
    } catch {
      return;
    }
    const accessToken = parsed?.access_token;
    const refreshToken = parsed?.refresh_token;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") return;
    // 앱이 넣어 준 세션을 웹이 그대로 다시 저장한 경우는 건너뛴다.
    if (refreshToken === knownRefreshToken.current) return;
    knownRefreshToken.current = refreshToken;
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) knownRefreshToken.current = null;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    ready,
    session,
    user: session?.user ?? null,
    isSignedIn: Boolean(session?.user),
    adoptWebSession,
    signOut,
  }), [ready, session, adoptWebSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider가 필요합니다.");
  return value;
}

// 로그인이 필요한 동작 앞에서 부른다. 로그인되어 있으면 true.
export function useRequireLogin(navigation) {
  const { isSignedIn } = useAuth();
  return useCallback((message = "로그인하고 이용해 주세요.") => {
    if (isSignedIn) return true;
    showDialog("로그인이 필요해요", message, [
      { text: "취소", style: "cancel" },
      { text: "로그인", onPress: () => navigation.navigate("Web", LOGIN_WEB_ROUTE) },
    ]);
    return false;
  }, [isSignedIn, navigation]);
}
