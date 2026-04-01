import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getAdminAccessState } from "../lib/adminAuth";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";

function AdminRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async (session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setHasSession(false);
        setIsAdmin(false);
        setAuthError("");
        setIsChecking(false);
        return;
      }

      const { isAdmin: admin, error: accessError } = await getAdminAccessState();
      if (!isMounted) {
        return;
      }

      setHasSession(true);
      setIsAdmin(admin);
      setAuthError(accessError);
      setIsChecking(false);
    };

    if (!isSupabaseConfigured || !supabase) {
      setHasSession(false);
      setIsAdmin(false);
      setAuthError("");
      setIsChecking(false);
      return () => {};
    }

    supabase.auth.getSession().then(({ data }) => {
      void checkAuth(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void checkAuth(session ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <main className="app-shell">
        <p className="notice-error">
          `.env` 파일에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해 주세요.
        </p>
      </main>
    );
  }

  if (isChecking) {
    return (
      <main className="app-shell">
        <p className="text-sm font-semibold text-slate-500">관리자 권한을 확인하는 중입니다...</p>
      </main>
    );
  }

  if (!hasSession) {
    return <Navigate to="/admin/login" replace />;
  }

  if (authError) {
    return (
      <main className="app-shell space-y-4">
        <p className="notice-error">{authError}</p>
        <button
          className="btn-secondary"
          onClick={() => window.location.reload()}
          type="button"
        >
          다시 시도
        </button>
        <Link className="btn-secondary" to="/admin/login">
          로그인 화면으로
        </Link>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="app-shell space-y-4">
        <p className="notice-error">
          관리자 권한이 없는 계정입니다. 관리자 계정으로 다시 로그인해 주세요.
        </p>
        <Link className="btn-secondary" to="/admin/login">
          로그인 화면으로
        </Link>
      </main>
    );
  }

  return children;
}

export default AdminRoute;
