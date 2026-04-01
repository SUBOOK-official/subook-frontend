import { createContext, useContext, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const PublicAuthContext = createContext(null);

function buildFallbackProfile(user) {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  const fallbackName =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : user.email?.split("@")[0] ?? "";
  const fallbackPhone =
    typeof metadata.phone === "string" && metadata.phone.trim() ? metadata.phone.trim() : "";

  return {
    user_id: user.id,
    email: user.email ?? "",
    name: fallbackName,
    phone: fallbackPhone,
  };
}

async function loadMemberProfile(user) {
  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("member_profiles")
    .select("user_id, email, name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return buildFallbackProfile(user);
  }

  return data;
}

function PublicAuthProvider({ children }) {
  const [state, setState] = useState({
    session: null,
    user: null,
    profile: null,
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
          isLoading: false,
          isConfigured: isSupabaseConfigured && Boolean(supabase),
        });
        return;
      }

      const profile = await loadMemberProfile(nextSession.user);
      if (!isMounted) {
        return;
      }

      setState({
        session: nextSession,
        user: nextSession.user,
        profile,
        isLoading: false,
        isConfigured: isSupabaseConfigured && Boolean(supabase),
      });
    };

    if (!isSupabaseConfigured || !supabase) {
      setState({
        session: null,
        user: null,
        profile: null,
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

    const profile = await loadMemberProfile(state.user);
    setState((currentState) => ({
      ...currentState,
      profile,
    }));

    return profile;
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
        isLoading: false,
        isConfigured: true,
      });
    }

    return result;
  };

  const value = {
    ...state,
    isAuthenticated: Boolean(state.session?.user),
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
