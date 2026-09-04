import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import {
  trackEmailVerified,
  trackEvent,
  trackLogin,
  trackLogout,
} from "../lib/analytics";
import { getPublicAccountAccessState } from "../lib/publicAuthAccess";

const PublicAuthContext = createContext(null);

// GA4 login 이벤트 중복 방지 — 세션 복원(INITIAL_SESSION)·토큰 갱신·탭 포커스 재발화를
// "직전에 본 사용자 id와 같은가"로 걸러 실제 로그인만 1회 계측한다. 모듈 스코프라
// Provider 리마운트(StrictMode 이중 실행 포함)에도 안전.
let lastSeenAuthUserId = null;

function PublicAuthProvider({ children }) {
  const [state, setState] = useState({
    session: null,
    user: null,
    profile: null,
    accountRole: "guest",
    hasSession: false,
    isLoading: true,
    isConfigured: isSupabaseConfigured && Boolean(supabase),
  });

  useEffect(() => {
    let isMounted = true;

    const applySession = async (nextSession) => {
      // 로그인/복원 어느 경로든 최종 사용자 id를 기록 (login 이벤트 중복 가드의 기준값)
      lastSeenAuthUserId = nextSession?.user?.id ?? null;
      if (!isMounted) {
        return;
      }

      if (!nextSession?.user) {
        setState({
          session: null,
          user: null,
          profile: null,
          accountRole: "guest",
          hasSession: false,
          isLoading: false,
          isConfigured: isSupabaseConfigured && Boolean(supabase),
        });
        return;
      }

      const accessState = await getPublicAccountAccessState(nextSession.user);
      if (!isMounted) {
        return;
      }

      setState({
        session: nextSession,
        user: nextSession.user,
        profile: accessState.accountRole === "member" ? accessState.profile : null,
        accountRole: accessState.accountRole,
        hasSession: true,
        isLoading: false,
        isConfigured: isSupabaseConfigured && Boolean(supabase),
      });
    };

    if (!isSupabaseConfigured || !supabase) {
      setState({
        session: null,
        user: null,
        profile: null,
        accountRole: "guest",
        hasSession: false,
        isLoading: false,
        isConfigured: false,
      });

      return () => {
        isMounted = false;
      };
    }

    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // GA4 login — 실제 로그인(SIGNED_IN + 사용자 전환)만. 복원·재발화는 가드로 스킵.
      // ⚠️ 가입 중 이메일 OTP 인증(verifyOtp)도 SIGNED_IN을 발화시켜 "가입 1건 = login 1건"으로
      //    이중 집계된다(가입 퍼널의 분모를 오염). /signup·/signup-success 경로에서는 스킵하고
      //    가입 완료는 sign_up 이벤트로만 센다.
      const nextUserId = nextSession?.user?.id ?? null;
      const isSignupFlowPath =
        typeof window !== "undefined" &&
        window.location?.pathname?.startsWith("/signup");
      if (
        event === "SIGNED_IN" &&
        nextUserId &&
        nextUserId !== lastSeenAuthUserId &&
        !isSignupFlowPath
      ) {
        trackLogin(nextSession.user.app_metadata?.provider ?? "email");
      }
      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!state.user) {
      return null;
    }

    const accessState = await getPublicAccountAccessState(state.user);
    setState((currentState) => ({
      ...currentState,
      profile: accessState.accountRole === "member" ? accessState.profile : null,
      accountRole: accessState.accountRole,
      hasSession: Boolean(currentState.session?.user),
    }));

    return accessState.profile;
  };

  // source: 로그아웃을 부른 지점(account_menu / mobile_drawer / mypage_settings /
  // consent_cancel / forced_<reason> …). GA4 logout의 ui_surface로 기록된다.
  const signOut = async (source = "unknown") => {
    if (!supabase) {
      return { error: new Error("Supabase is not configured.") };
    }

    const accountRoleBeforeSignOut = state.accountRole;
    const result = await supabase.auth.signOut();

    if (!result.error) {
      // GA4 logout — 성공한 로그아웃만. 어디서 빠져나가는지 표면별로 본다.
      trackLogout(source, { accountRole: accountRoleBeforeSignOut });
      setState({
        session: null,
        user: null,
        profile: null,
        accountRole: "guest",
        hasSession: false,
        isLoading: false,
        isConfigured: true,
      });
    }

    return result;
  };

  const isOAuthUser = state.user?.app_metadata?.provider !== "email" && Boolean(state.user?.app_metadata?.provider);
  const isEmailVerified = Boolean(state.profile?.email_verified_at);
  // terms_agreed_at 컬럼이 응답에 누락된 경우(레거시 RPC 캐시 등) NULL이 아닌 undefined일 수도 있음
  // → undefined인 경우 "이미 동의함"으로 간주 (이메일 가입자는 PublicSignupPage가 동의 강제).
  // OAuth 사용자만 terms_agreed_at = null 체크로 동의 페이지 라우팅.
  const termsAgreedAt = state.profile?.terms_agreed_at;
  const hasAgreedToTerms = termsAgreedAt === undefined ? true : Boolean(termsAgreedAt);

  // 사용자별 1회 계측 가드 — 프로필 갱신 전까지 deps가 그대로라 효과가 다시 돌 수 있다.
  const autoVerifyTrackedUserIdRef = useRef(null);
  const signupCompletionTrackedUserIdRef = useRef(null);

  useEffect(() => {
    if (isOAuthUser && state.accountRole === "member" && !isEmailVerified && supabase) {
      // supabase.rpc()는 .catch()가 없는 thenable → 직접 .catch 호출 시 TypeError.
      // Promise.resolve로 감싸 안전하게 fire-and-forget 한다.
      void Promise.resolve(supabase.rpc("complete_member_email_verification")).catch(() => {});

      // GA4 email_verify_complete — OAuth는 provider가 이메일을 검증했으므로 자동 완료 처리
      const userId = state.user?.id ?? null;
      if (userId && autoVerifyTrackedUserIdRef.current !== userId) {
        autoVerifyTrackedUserIdRef.current = userId;
        trackEmailVerified({
          context: "oauth_auto",
          method: state.user?.app_metadata?.provider ?? "unknown",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOAuthUser, state.accountRole, isEmailVerified, state.user?.id]);

  // 게이트:
  //   - 이메일 사용자: email_verified_at + 약관 동의 모두 필요
  //   - OAuth 사용자: terms_agreed_at 필수 (이메일은 OAuth provider가 검증한 것으로 간주)
  //   기존엔 OTP 가입자가 인증만 하고 약관 못 채운 채 떠나도 isAuthenticated=true가 됐었음(좀비).
  //   strict하게 hasAgreedToTerms를 모든 경로에 필수로 — 미완료 사용자는 사이트 진입 전 가입 마무리 게이트로.
  const isMemberVerified =
    state.accountRole === "member"
    && hasAgreedToTerms
    && (isOAuthUser || isEmailVerified);

  const needsSignupCompletion =
    state.accountRole === "member" && state.hasSession && termsAgreedAt === null;

  // GA4 signup_completion_required — 세션은 있는데 약관 미동의라 가입 마무리 게이트로 보내는 상태.
  // 사용자당 1회만 (프로필 갱신 전까지 같은 상태로 여러 번 렌더된다).
  useEffect(() => {
    if (!needsSignupCompletion) {
      return;
    }
    const userId = state.user?.id ?? null;
    if (!userId || signupCompletionTrackedUserIdRef.current === userId) {
      return;
    }
    signupCompletionTrackedUserIdRef.current = userId;
    trackEvent("signup_completion_required", {
      method: state.user?.app_metadata?.provider ?? "email",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSignupCompletion, state.user?.id]);

  const value = {
    ...state,
    isAuthenticated: isMemberVerified,
    isAdminAccount: state.accountRole === "admin",
    isOAuthUser,
    hasAgreedToTerms,
    needsSignupCompletion,
    // 호환용 — 기존 호출자(App.jsx, PublicOAuthConsentPage, PublicAuthCallbackPage)는 needsOAuthConsent를
    // 참조하지만 의미는 동일하게 "가입 마무리 필요"로 통일. provider 무관 적용.
    needsOAuthConsent: needsSignupCompletion,
    refreshProfile,
    signOut,
  };

  return <PublicAuthContext.Provider value={value}>{children}</PublicAuthContext.Provider>;
}

function usePublicAuth() {
  const context = useContext(PublicAuthContext);

  if (!context) {
    throw new Error("usePublicAuth must be used inside PublicAuthProvider.");
  }

  return context;
}

export { PublicAuthProvider, usePublicAuth };
