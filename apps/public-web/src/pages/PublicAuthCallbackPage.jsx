import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";

const WITHDRAWAL_RECOVERY_NOTICE =
  "탈퇴 처리 중인 계정입니다. 복구가 필요하면 subook2025@gmail.com 으로 메일을 보내거나 아래 안내를 따라주세요.";

/**
 * OAuth provider 콜백 후 도착하는 페이지.
 * Supabase가 URL fragment의 access_token을 처리하고 onAuthStateChange가 발화되면
 * PublicAuthContext가 정착한다. 그 정착이 끝나기 전에 보호 페이지로 가면 race로
 * "로그인 → 즉시 로그아웃"처럼 보이는 문제가 발생하므로, 이 페이지에서 대기 후
 * 안전하게 분기 라우팅한다.
 *
 * - 인증 실패: /login
 * - 어드민 계정: /login (admin은 admin.subook.kr 전용)
 * - 탈퇴 대기/탈퇴 완료: /login + 안내
 * - OAuth인데 약관 동의 미완료: /auth/oauth-consent
 * - 정상 회원: ?next=... 으로 (없으면 /)
 */
function PublicAuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isLoading,
    hasSession,
    isAuthenticated,
    isAdminAccount,
    accountRole,
    needsOAuthConsent,
    signOut,
  } = usePublicAuth();

  const search = new URLSearchParams(location.search);
  const next = search.get("next") || "/";
  const [showStuckHint, setShowStuckHint] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShowStuckHint(true), 5000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // 세션 자체가 없음 → 로그인으로
    if (!hasSession) {
      navigate("/login", { replace: true, state: { notice: "로그인이 만료되었거나 실패했어요. 다시 시도해 주세요." } });
      return;
    }

    // 어드민 계정으로 일반 도메인에 로그인 시도한 케이스
    if (isAdminAccount) {
      void signOut();
      navigate("/login", { replace: true, state: { notice: "관리자 계정은 admin.subook.kr에서 로그인해 주세요." } });
      return;
    }

    // 탈퇴 처리 중인 회원
    if (accountRole === "withdrawal_pending" || accountRole === "withdrawn") {
      void signOut();
      navigate("/login", { replace: true, state: { notice: WITHDRAWAL_RECOVERY_NOTICE } });
      return;
    }

    // OAuth 신규 가입자 → 약관 동의 페이지
    if (needsOAuthConsent) {
      navigate(`/auth/oauth-consent?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // 정상 인증
    if (isAuthenticated) {
      navigate(next, { replace: true });
    }
  }, [
    isLoading,
    hasSession,
    isAuthenticated,
    isAdminAccount,
    accountRole,
    needsOAuthConsent,
    next,
    navigate,
    signOut,
  ]);

  // SPA에서 처음 진입 시 URL fragment(#access_token=...)는 Supabase가 처리 후 제거.
  // 그동안 빈 화면 보이지 않도록 로딩 안내.
  if (!isLoading && !hasSession) {
    return <Navigate replace to="/login" />;
  }

  return (
    <main className="public-auth-callback-loading">
      <div role="status" aria-live="polite" className="public-auth-callback-loading__inner">
        <span className="public-auth-spinner" aria-hidden="true" />
        <p>로그인 처리 중입니다. 잠시만 기다려 주세요...</p>
        {showStuckHint ? (
          <p className="public-auth-callback-loading__hint">
            5초 이상 이 화면이 멈춰 있다면 새로고침해 주세요.
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default PublicAuthCallbackPage;
