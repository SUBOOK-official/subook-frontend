import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { usePublicAuth } from "../contexts/PublicAuthContext";

/**
 * OAuth(카카오/네이버 등) 신규 가입자가 약관·개인정보를 명시적으로 동의하는 페이지.
 * 트리거가 자동으로 terms_agreed_at을 채우지 않으므로 사용자가 여기서 동의해야
 * isAuthenticated=true가 되어 보호된 페이지에 접근 가능.
 */
function PublicOAuthConsentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isLoading,
    hasSession,
    needsOAuthConsent,
    isAuthenticated,
    refreshProfile,
  } = usePublicAuth();

  const search = new URLSearchParams(location.search);
  const next = search.get("next") || "/";

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 이미 동의 완료된 사용자는 next로 즉시 이동
  useEffect(() => {
    if (isLoading) return;
    if (!hasSession) {
      navigate("/login", { replace: true });
      return;
    }
    if (isAuthenticated && !needsOAuthConsent) {
      navigate(next, { replace: true });
    }
  }, [isLoading, hasSession, isAuthenticated, needsOAuthConsent, next, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!agreeTerms || !agreePrivacy) {
      setErrorMessage("필수 약관에 모두 동의해 주세요.");
      return;
    }
    if (!supabase) {
      setErrorMessage("일시적으로 동의 처리가 어렵습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc("complete_oauth_signup", {
        p_marketing_opt_in: agreeMarketing,
      });
      if (error) {
        setErrorMessage(`동의 처리에 실패했어요. ${error.message ?? ""}`);
        setIsSubmitting(false);
        return;
      }
      await refreshProfile();
      navigate(next, { replace: true });
    } catch (err) {
      console.error("complete_oauth_signup failed", err);
      setErrorMessage("동의 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
      setIsSubmitting(false);
    }
  };

  const handleAgreeAll = () => {
    const allChecked = agreeTerms && agreePrivacy && agreeMarketing;
    setAgreeTerms(!allChecked);
    setAgreePrivacy(!allChecked);
    setAgreeMarketing(!allChecked);
  };

  if (isLoading) {
    return (
      <main className="public-auth-callback-loading">
        <span className="public-auth-spinner" aria-hidden="true" />
        <p>로그인 정보를 확인하는 중...</p>
      </main>
    );
  }

  if (!hasSession) {
    return <Navigate replace to="/login" />;
  }

  return (
    <main className="public-auth-shell">
      <section className="public-auth-card" aria-labelledby="oauth-consent-title">
        <h1 className="public-auth-card__title" id="oauth-consent-title">
          서비스 이용 약관 동의
        </h1>
        <p className="public-auth-card__subtitle">
          서비스를 이용하시려면 아래 약관에 동의해 주세요.
        </p>

        <form className="public-auth-form" onSubmit={handleSubmit}>
          <div className="public-auth-agree-block">
            <label className="public-auth-agree-row public-auth-agree-row--all">
              <input
                checked={agreeTerms && agreePrivacy && agreeMarketing}
                onChange={handleAgreeAll}
                type="checkbox"
              />
              <span>전체 동의하기</span>
            </label>

            <div className="public-auth-agree-divider" aria-hidden="true" />

            <label className="public-auth-agree-row">
              <input
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>(필수)</strong> 이용약관 동의{" "}
                <a href="/terms" rel="noopener noreferrer" target="_blank">
                  내용 보기
                </a>
              </span>
            </label>

            <label className="public-auth-agree-row">
              <input
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>(필수)</strong> 개인정보처리방침 동의{" "}
                <a href="/privacy" rel="noopener noreferrer" target="_blank">
                  내용 보기
                </a>
              </span>
            </label>

            <label className="public-auth-agree-row">
              <input
                checked={agreeMarketing}
                onChange={(e) => setAgreeMarketing(e.target.checked)}
                type="checkbox"
              />
              <span>(선택) 마케팅 정보 수신 동의 (이메일/SMS 알림)</span>
            </label>
          </div>

          {errorMessage ? (
            <p className="public-auth-inline-message public-auth-inline-message--error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="public-auth-submit"
            disabled={isSubmitting || !agreeTerms || !agreePrivacy}
            type="submit"
          >
            {isSubmitting ? "처리 중..." : "동의하고 시작하기"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default PublicOAuthConsentPage;
