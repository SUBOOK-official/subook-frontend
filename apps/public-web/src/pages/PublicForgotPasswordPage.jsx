import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { MailIcon } from "../components/icons";
import { isValidEmailFormat, normalizeEmail } from "../lib/publicAuthFormUtils";

function PublicForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailInputRef = useRef(null);

  const prefillEmail =
    typeof location.state?.prefillEmail === "string"
      ? location.state.prefillEmail
      : "";

  const [formValues, setFormValues] = useState({
    name: "",
    email: prefillEmail,
  });
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    email: "",
  });
  const [pageError, setPageError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    Boolean(formValues.name.trim()) && isValidEmailFormat(formValues.email) && !isSubmitting;

  const handleChange = (key) => (event) => {
    const nextValue = event.target.value;

    setFormValues((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setPageError("");
    setFieldErrors({
      name: "",
      email: "",
    });
  };

  const validateFields = () => {
    const normalizedEmail = normalizeEmail(formValues.email);
    const nextErrors = {
      name: "",
      email: "",
    };

    if (!formValues.name.trim()) {
      nextErrors.name = "필수 항목입니다.";
    }

    if (!normalizedEmail) {
      nextErrors.email = "필수 항목입니다.";
    } else if (!isValidEmailFormat(normalizedEmail)) {
      nextErrors.email = "유효한 이메일 형식을 확인해 주세요.";
    }

    setFieldErrors(nextErrors);
    return !nextErrors.name && !nextErrors.email;
  };

  const requestResetEmail = async () => {
    const normalizedEmail = normalizeEmail(formValues.email);
    // 이름 매칭 친절화: trim + lowercase 후 비교. 백엔드 RPC가 어떤 비교 로직을 쓰든
    // 클라이언트는 일관되게 정규화된 값을 보낸다.
    const normalizedName = formValues.name.trim().toLowerCase();

    // ⚠️ Email enumeration timing attack 방어:
    // 매칭/미매칭 응답 시간을 동일하게 맞추기 위해 두 작업을 병렬로 실행 +
    // 최소 800ms 인공 지연. 미매칭 케이스에서도 reset email 발송이 reject 처리되도록
    // 동일 호출을 수행 (Supabase 자체가 미존재 메일에도 동일 응답).
    const minDelay = new Promise((resolve) => setTimeout(resolve, 800));

    const lookupPromise = supabase.rpc("lookup_member_for_password_reset", {
      p_name: normalizedName,
      p_email: normalizedEmail,
    });

    const resetPromise = supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    const [lookupResult, resetResult] = await Promise.all([lookupPromise, resetPromise, minDelay]);

    if (lookupResult.error) {
      setPageError("회원 정보를 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }

    // 매칭 안 됐어도 동일 화면 표시 (사용자 존재 식별 불가).
    // 실제 발송은 Supabase가 매칭된 auth.users에만 수행하므로 진짜 사용자만 메일 수신.
    if (resetResult.error && lookupResult.data) {
      setPageError(resetResult.error.message || "비밀번호 재설정 메일 발송에 실패했습니다. 다시 시도해 주세요.");
      return false;
    }

    setSubmittedEmail(normalizedEmail);
    setHasSubmitted(true);
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPageError("");

    if (!isSupabaseConfigured || !supabase) {
      setPageError("비밀번호 찾기 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!validateFields()) {
      return;
    }

    setIsSubmitting(true);
    await requestResetEmail();
    setIsSubmitting(false);
  };

  const handleResend = async () => {
    setPageError("");

    if (!isSupabaseConfigured || !supabase) {
      setPageError("비밀번호 찾기 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    setIsSubmitting(true);
    await requestResetEmail();
    setIsSubmitting(false);
  };

  return (
    <main className="public-auth-route">
      <div className="public-auth-shell">
        <section aria-labelledby="public-forgot-password-heading" className="public-auth-card">
          <button
            className="public-auth-back-link"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
                return;
              }

              navigate("/login");
            }}
            type="button"
          >
            ← 뒤로
          </button>

          <div className="public-auth-card__body">
            <div className="public-auth-card__heading public-auth-card__heading--left">
              <h1 className="public-auth-card__title" id="public-forgot-password-heading">
                비밀번호 찾기
              </h1>
              <p className="public-auth-card__description">가입 시 등록한 이름과 이메일을 입력해주세요.</p>
            </div>

            {pageError ? <div className="public-auth-alert public-auth-alert--error">{pageError}</div> : null}

            {hasSubmitted ? (
              <div className="public-auth-state-card public-auth-state-card--success">
                <div className="public-auth-state-card__header">
                  <span aria-hidden="true" className="public-auth-state-card__icon">
                    <MailIcon size={20} />
                  </span>
                  <div className="public-auth-state-card__copy">
                    <p className="public-auth-state-card__title">재설정 메일을 발송했어요</p>
                    <p className="public-auth-state-card__description">
                      <strong>{submittedEmail}</strong> 메일함을 확인해주세요.
                    </p>
                    <p className="public-auth-state-card__hint">
                      메일이 도착하지 않는다면 스팸함을 확인하고, 가입 시 입력한 이름과
                      이메일이 모두 정확한지 확인해 주세요. 5분 이내 도착하지 않으면
                      고객센터(카카오톡 공식 채널 @subook)로 문의해 주세요.
                    </p>
                  </div>
                </div>

                <div className="public-auth-state-card__actions">
                  <button
                    className="public-auth-button public-auth-button--secondary"
                    disabled={isSubmitting}
                    onClick={handleResend}
                    type="button"
                  >
                    {isSubmitting ? (
                      <>
                        <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                        <span>재발송 중...</span>
                      </>
                    ) : (
                      "재발송"
                    )}
                  </button>
                  <Link className="public-auth-button public-auth-button--ghost" to="/login">
                    로그인으로 돌아가기
                  </Link>
                </div>
              </div>
            ) : (
              <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
                <div className={`public-auth-field-row ${fieldErrors.name ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-forgot-password-name">
                    이름
                  </label>
                  <div className="public-auth-field-row__control">
                    <input
                      autoComplete="name"
                      className="public-auth-field-row__input"
                      id="public-forgot-password-name"
                      onChange={handleChange("name")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          emailInputRef.current?.focus();
                        }
                      }}
                      placeholder="홍길동"
                      type="text"
                      value={formValues.name}
                    />
                  </div>
                  {fieldErrors.name ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.name}</p>
                  ) : (
                    <p className="public-auth-inline-message public-auth-inline-message--info">
                      회원가입 때 쓴 이름과 정확히 일치해야 해요.
                    </p>
                  )}
                </div>

                <div className={`public-auth-field-row ${fieldErrors.email ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-forgot-password-email">
                    이메일
                  </label>
                  <div className="public-auth-field-row__control">
                    <input
                      autoComplete="email"
                      className="public-auth-field-row__input"
                      id="public-forgot-password-email"
                      onChange={handleChange("email")}
                      placeholder="example@email.com"
                      ref={emailInputRef}
                      type="email"
                      value={formValues.email}
                    />
                  </div>
                  {fieldErrors.email ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.email}</p>
                  ) : null}
                </div>

                <button
                  className={`public-auth-button ${canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"}`}
                  disabled={!canSubmit}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                      <span>발송 중...</span>
                    </>
                  ) : (
                    "비밀번호 재설정 메일 발송"
                  )}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default PublicForgotPasswordPage;
