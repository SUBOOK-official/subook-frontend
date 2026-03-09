import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { checkIsAdminUser } from "../lib/adminAuth";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";

function AdminRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async (session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setHasSession(false);
        setIsAdmin(false);
        setIsChecking(false);
        return;
      }

      const admin = await checkIsAdminUser();
      if (!isMounted) {
        return;
      }

      setHasSession(true);
      setIsAdmin(admin);
      setIsChecking(false);
    };

    if (!isSupabaseConfigured || !supabase) {
      setHasSession(false);
      setIsAdmin(false);
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

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

export default AdminRoute;
