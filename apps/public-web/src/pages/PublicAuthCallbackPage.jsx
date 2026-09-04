import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { makeOnceGuard, trackEvent } from "../lib/analytics";
import {
  buildOAuthCallbackErrorNotice,
  classifyOAuthCallbackError,
  parseOAuthCallbackError,
} from "../lib/publicOAuthCallbackError";

const WITHDRAWAL_RECOVERY_NOTICE =
  "탈퇴 처리 중인 계정입니다. 복구가 필요하면 subook2025@gmail.com 으로 메일을 보내거나 아래 안내를 따라주세요.";

const BLOCKED_ACCOUNT_NOTICE =
  "이용이 제한된 계정입니다. 문의가 필요하시면 subook2025@gmail.com 으로 연락해 주세요.";

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
  // next는 URL로 노출되는 파라미터 — 내부 경로만 허용 (open-redirect/경로 강제 이동 방지).
  const rawNext = search.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("\\")
    ? rawNext
    : "/";
  const [showStuckHint, setShowStuckHint] = useState(false);
  // GoTrue가 에러와 함께 되돌려보낸 콜백 (?error=... 또는 #error=...).
  // 세션이 생길 수 없는 URL이므로 정착을 기다리지 않고 바로 로그인으로 안내한다.
  const [oauthErrorInfo] = useState(() =>
    parseOAuthCallbackError(window.location.search, window.location.hash),
  );
  const [oauthErrorNotice] = useState(() => buildOAuthCallbackErrorNotice(oauthErrorInfo));
  // 아래 effect들은 의존성 배열이 커서 여러 번 재실행된다 — 모든 계측은 1회 가드를 통과시킨다.
  const trackOnceRef = useRef(makeOnceGuard());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      // GA4 oauth_callback_stuck — 콜백이 5초 넘게 정착하지 못한 비율(사용자 체감 실패)
      if (trackOnceRef.current("stuck")) {
        trackEvent("oauth_callback_stuck", { waitedSeconds: 5 });
      }
      setShowStuckHint(true);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (oauthErrorNotice) {
      // GA4 oauth_callback_error — provider가 에러로 되돌려보낸 콜백(사유별 분포)
      if (trackOnceRef.current("callback_error")) {
        trackEvent("oauth_callback_error", {
          errorReason: classifyOAuthCallbackError(oauthErrorInfo),
          errorCode: oauthErrorInfo?.errorCode ?? "",
          errorMessage: oauthErrorInfo?.errorDescription ?? "",
        });
      }
      navigate("/login", { replace: true, state: { notice: oauthErrorNotice } });
    }
  }, [oauthErrorInfo, oauthErrorNotice, navigate]);

  useEffect(() => {
    if (oauthErrorNotice) return;
    if (isLoading) return;

    // 세션 자체가 없음 → 로그인으로
    if (!hasSession) {
      // GA4 oauth_callback_fail — 콜백까지 왔는데 세션이 안 잡힌 케이스
      if (trackOnceRef.current("fail")) {
        trackEvent("oauth_callback_fail", { errorReason: "no_session" });
      }
      navigate("/login", { replace: true, state: { notice: "로그인이 만료되었거나 실패했어요. 다시 시도해 주세요." } });
      return;
    }

    // 어드민 계정으로 일반 도메인에 로그인 시도한 케이스
    if (isAdminAccount) {
      // GA4 oauth_callback_fail — 운영자 계정의 공개 도메인 진입
      if (trackOnceRef.current("fail")) {
        trackEvent("oauth_callback_fail", { errorReason: "admin_account" });
      }
      void signOut("forced_admin_account");
      navigate("/login", { replace: true, state: { notice: "관리자 계정은 admin.subook.kr에서 로그인해 주세요." } });
      return;
    }

    // 탈퇴 처리 중인 회원
    if (accountRole === "withdrawal_pending" || accountRole === "withdrawn") {
      // GA4 oauth_callback_fail — 탈퇴 대기/완료 계정의 재로그인 시도
      if (trackOnceRef.current("fail")) {
        trackEvent("oauth_callback_fail", { errorReason: accountRole });
      }
      void signOut(`forced_${accountRole}`);
      navigate("/login", { replace: true, state: { notice: WITHDRAWAL_RECOVERY_NOTICE } });
      return;
    }

    // 차단된 회원 — OAuth 로그인은 밴 반영 전 토큰이 발급될 수 있어 여기서도 차단
    if (accountRole === "blocked") {
      // GA4 oauth_callback_fail — 차단 계정
      if (trackOnceRef.current("fail")) {
        trackEvent("oauth_callback_fail", { errorReason: "blocked" });
      }
      void signOut("forced_blocked");
      navigate("/login", { replace: true, state: { notice: BLOCKED_ACCOUNT_NOTICE } });
      return;
    }

    // OAuth 신규 가입자 → 약관 동의 페이지
    if (needsOAuthConsent) {
      // GA4 oauth_callback_route — 신규(동의 필요) vs 기존(바로 복귀) 비율
      if (trackOnceRef.current("route")) {
        trackEvent("oauth_callback_route", { destination: "consent" });
      }
      navigate(`/auth/oauth-consent?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // 정상 인증
    if (isAuthenticated) {
      if (trackOnceRef.current("route")) {
        trackEvent("oauth_callback_route", { destination: "next" });
      }
      navigate(next, { replace: true });
    }
  }, [
    oauthErrorNotice,
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
  if (!oauthErrorNotice && !isLoading && !hasSession) {
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
