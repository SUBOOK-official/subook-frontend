import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import { usePublicAuth } from "../contexts/PublicAuthContext";

function PublicLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = usePublicAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isSupabaseConfigured || !supabase) {
      setError("로그인 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (loginError) {
      const rawMessage = loginError.message?.toLowerCase() ?? "";

      if (rawMessage.includes("email not confirmed")) {
        setError("이메일 인증이 아직 완료되지 않았습니다. 메일함에서 인증을 먼저 완료해 주세요.");
      } else if (rawMessage.includes("invalid login credentials")) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setError(loginError.message || "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    navigate("/", { replace: true });
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-login-heading" className="public-auth-main">
            <div className="public-auth-panel">
              <div className="public-auth-panel__header">
                <h1 className="public-auth-panel__title" id="public-login-heading">
                  로그인
                </h1>
                <p className="public-auth-panel__description">
                  가입한 이메일과 비밀번호로 로그인하고 중고 교재를 바로 둘러보세요.
                </p>
              </div>

              <div className="public-auth-panel__body">
                {isAuthenticated ? (
                  <p className="public-auth-notice public-auth-notice--info">
                    이미 로그인된 상태입니다. 다른 계정으로 로그인 테스트를 하려면 상단의 로그아웃을 먼저 눌러 주세요.
                  </p>
                ) : null}
                {notice ? <p className="public-auth-notice public-auth-notice--success">{notice}</p> : null}
                {error ? <p className="public-auth-notice public-auth-notice--error">{error}</p> : null}

                <form className="public-auth-form" onSubmit={handleSubmit}>
                  <label className="public-auth-field">
                    <span className="public-visually-hidden">이메일</span>
                    <input
                      autoComplete="email"
                      className="public-auth-input"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="이메일을 입력해 주세요."
                      type="email"
                      value={email}
                    />
                  </label>

                  <label className="public-auth-field">
                    <span className="public-visually-hidden">비밀번호</span>
                    <input
                      autoComplete="current-password"
                      className="public-auth-input"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="비밀번호를 입력해 주세요."
                      type="password"
                      value={password}
                    />
                  </label>

                  <button
                    className="public-auth-button public-auth-button--primary"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "로그인 중..." : "로그인"}
                  </button>

                  <Link className="public-auth-button public-auth-button--secondary" to="/guest-order-lookup">
                    비회원 주문 조회
                  </Link>
                </form>

                <div className="public-auth-links">
                  <Link className="public-auth-text-link" to="/forgot-password">
                    비밀번호 찾기
                  </Link>
                  <span aria-hidden="true" className="public-auth-links__separator" />
                  <Link className="public-auth-text-link" to="/signup">
                    회원가입하기
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicLoginPage;
