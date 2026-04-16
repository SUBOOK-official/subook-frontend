import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getPublicAuthSessionPersistence,
  isSupabaseConfigured,
  setPublicAuthSessionPersistence,
  supabase,
} from "@shared-supabase/publicSupabaseClient";
import PublicOAuthButtons from "../components/PublicOAuthButtons";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { getPublicAccountAccessState } from "../lib/publicAuthAccess";
import { isValidEmailFormat, normalizeEmail } from "../lib/publicAuthFormUtils";
import { saveSignupSuccessState } from "../lib/publicSignupSuccessState";

function PublicLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const passwordInputRef = useRef(null);
  const { hasSession, isAdminAccount, isAuthenticated, signOut } = usePublicAuth();
  const nextPath = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search ?? ""}${location.state.from.hash ?? ""}`
    : "/";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => getPublicAuthSessionPersistence());
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    password: "",
  });
  const [pageNotice, setPageNotice] = useState(location.state?.notice ?? "");
  const [pageError, setPageError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectToVerification = (emailAddress, notice) => {
    const verificationState = {
      email: normalizeEmail(emailAddress),
      requiresEmailConfirmation: true,
      notice,
    };

    saveSignupSuccessState(verificationState);
    navigate("/signup-success", {
      replace: true,
      state: verificationState,
    });
  };

  const handleClearSession = async () => {
    setPageError("");
    setPageNotice("");
    await signOut();
  };

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
    setPageError("");
    setFieldErrors((currentValue) => ({
      ...currentValue,
      email: "",
    }));
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    setPageError("");
    setFieldErrors((currentValue) => ({
      ...currentValue,
      password: "",
    }));
  };

  const validateFields = () => {
    const nextErrors = {
      email: "",
      password: "",
    };
    const normalized = normalizeEmail(email);

    if (!normalized) {
      nextErrors.email = "필수 항목입니다.";
    } else if (!isValidEmailFormat(normalized)) {
      nextErrors.email = "이메일 형식을 확인해주세요.";
    }

    if (!password) {
      nextErrors.password = "필수 항목입니다.";
    }

    setFieldErrors(nextErrors);
    return !nextErrors.email && !nextErrors.password;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPageError("");
    setPageNotice("");

    if (!isSupabaseConfigured || !supabase) {
      setPageError("로그인 기능을 사용하려면 Supabase 환경 설정이 필요합니다.");
      return;
    }

    if (!validateFields()) {
      return;
    }

    setPublicAuthSessionPersistence(rememberMe);
    setIsSubmitting(true);

    const normalized = normalizeEmail(email);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (loginError) {
      const rawMessage = loginError.message?.toLowerCase() ?? "";

      if (rawMessage.includes("email not confirmed")) {
        setIsSubmitting(false);
        redirectToVerification(normalized, "이메일 인증코드를 입력하면 회원가입을 완료할 수 있어요.");
        return;
      }

      if (rawMessage.includes("invalid login credentials")) {
        setFieldErrors((currentValue) => ({
          ...currentValue,
          password: "이메일 또는 비밀번호가 일치하지 않습니다.",
        }));
      } else {
        setPageError(loginError.message || "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }

      setIsSubmitting(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessState = await getPublicAccountAccessState(sessionData.session?.user ?? null);

    if (accessState.accountRole === "admin") {
      await supabase.auth.signOut();
      setPageError("관리자 계정은 공개 사용자 페이지에서 로그인할 수 없습니다. 관리자 페이지에서 로그인해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (accessState.accountRole === "withdrawal_pending" || accessState.accountRole === "withdrawn") {
      await supabase.auth.signOut();
      setPageError("회원탈퇴 처리 중인 계정입니다. 복구가 필요하면 고객센터로 문의해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (accessState.accountRole !== "member") {
      await supabase.auth.signOut();
      setPageError("회원 계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (!accessState.profile?.email_verified_at) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      redirectToVerification(normalized, "이메일 인증코드를 먼저 입력해주세요.");
      return;
    }

    setIsSubmitting(false);
    navigate(nextPath, { replace: true });
  };

  return (
    <main className="public-auth-route">
      <div className="public-auth-shell">
        <section aria-labelledby="public-login-heading" className="public-auth-card public-auth-card--login">
          <div className="public-auth-brand-lockup">
            <Link className="public-auth-brand" to="/">
              SUBOOK
            </Link>
            <p className="public-auth-brand-lockup__tagline">수능 교재, 똑똑하게 거래</p>
          </div>

          <div className="public-auth-card__body">
            <div className="public-auth-card__heading">
              <h1 className="public-auth-card__title" id="public-login-heading">
                로그인
              </h1>
              <p className="public-auth-card__description">
                가입한 이메일과 비밀번호로 로그인해 수북의 서비스를 이어서 이용해보세요.
              </p>
            </div>

            {hasSession && isAdminAccount ? (
              <div className="public-auth-alert public-auth-alert--info public-auth-alert--action">
                <span>관리자 세션이 연결되어 있습니다. 공개 사용자 페이지에는 회원 계정만 로그인할 수 있어요.</span>
                <button className="public-auth-inline-button" onClick={handleClearSession} type="button">
                  현재 세션 로그아웃
                </button>
              </div>
            ) : null}

            {pageNotice ? <div className="public-auth-alert public-auth-alert--success">{pageNotice}</div> : null}
            {pageError ? <div className="public-auth-alert public-auth-alert--error">{pageError}</div> : null}

            <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
              <div className={`public-auth-field-row ${fieldErrors.email ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-login-email">
                  이메일
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="email"
                    className="public-auth-field-row__input"
                    id="public-login-email"
                    onChange={handleEmailChange}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        passwordInputRef.current?.focus();
                      }
                    }}
                    placeholder="example@email.com"
                    type="email"
                    value={email}
                  />
                </div>
                {fieldErrors.email ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.email}</p>
                ) : null}
              </div>

              <div className={`public-auth-field-row ${fieldErrors.password ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-login-password">
                  비밀번호
                </label>
                <div className="public-auth-field-row__control public-auth-field-row__control--with-action">
                  <input
                    autoComplete="current-password"
                    className="public-auth-field-row__input"
                    id="public-login-password"
                    onChange={handlePasswordChange}
                    placeholder="비밀번호를 입력해주세요"
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    className="public-auth-field-row__toggle"
                    onClick={() => setShowPassword((currentValue) => !currentValue)}
                    type="button"
                  >
                    {showPassword ? "숨기기" : "보기"}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.password}</p>
                ) : null}
              </div>

              <label className="public-auth-check">
                <input
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <span>로그인 상태 유지</span>
              </label>

              <button className="public-auth-button public-auth-button--primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                    <span>로그인 중...</span>
                  </>
                ) : (
                  "로그인"
                )}
              </button>
            </form>

            <div className="public-auth-link-row">
              <Link className="public-auth-link-row__link" to="/forgot-password">
                비밀번호 찾기
              </Link>
              <span aria-hidden="true" className="public-auth-link-row__separator" />
              <Link className="public-auth-link-row__link" to="/signup">
                회원가입
              </Link>
            </div>

            <PublicOAuthButtons contextLabel="로그인" redirectTo={`${window.location.origin}${nextPath}`} />
          </div>
        </section>
      </div>
    </main>
  );
}

export default PublicLoginPage;
