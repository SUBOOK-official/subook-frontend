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
  const hasAgreedToTerms = Boolean(state.profile?.terms_agreed_at);

  useEffect(() => {
    if (isOAuthUser && state.accountRole === "member" && !isEmailVerified && supabase) {
      supabase.rpc("complete_member_email_verification").catch(() => {});
    }
  }, [isOAuthUser, state.accountRole, isEmailVerified]);

  // OAuth 사용자도 약관 동의 완료(terms_agreed_at)를 isAuthenticated 게이트 필수 조건으로.
  // → 동의 안 거치면 /auth/oauth-consent로 이동시키는 로직은 라우트 가드 또는 콜백 페이지에서 처리.
  const isMemberVerified = state.accountRole === "member" && hasAgreedToTerms && (isOAuthUser || isEmailVerified);

  const value = {
    ...state,
    isAuthenticated: isMemberVerified,
    isAdminAccount: state.accountRole === "admin",
    isOAuthUser,
    hasAgreedToTerms,
    needsOAuthConsent: state.accountRole === "member" && isOAuthUser && !hasAgreedToTerms,
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
