import { createContext, useContext, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { getPublicAccountAccessState } from "../lib/publicAuthAccess";

const PublicAuthContext = createContext(null);

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

  const signOut = async () => {
    if (!supabase) {
      return { error: new Error("Supabase is not configured.") };
    }

    const result = await supabase.auth.signOut();

    if (!result.error) {
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

  useEffect(() => {
    if (isOAuthUser && state.accountRole === "member" && !isEmailVerified && supabase) {
      supabase.rpc("complete_member_email_verification").catch(() => {});
    }
  }, [isOAuthUser, state.accountRole, isEmailVerified]);

  // 게이트:
  //   - 이메일 사용자: email_verified_at만 필요 (PublicSignupPage에서 약관 동의 강제됨)
  //   - OAuth 사용자: terms_agreed_at 필수 (트리거 자동 채움 제거됨)
  const isMemberVerified =
    state.accountRole === "member" &&
    (isOAuthUser ? hasAgreedToTerms : isEmailVerified);

  const value = {
    ...state,
    isAuthenticated: isMemberVerified,
    isAdminAccount: state.accountRole === "admin",
    isOAuthUser,
    hasAgreedToTerms,
    needsOAuthConsent:
      state.accountRole === "member" && isOAuthUser && termsAgreedAt === null,
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
