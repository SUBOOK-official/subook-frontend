import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { isValidEmailFormat, normalizeEmail } from "../lib/publicAuthFormUtils";

function PublicForgotPasswordPage() {
  const navigate = useNavigate();
  const emailInputRef = useRef(null);

  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
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

    const { data: isMatchedMember, error: lookupError } = await supabase.rpc(
      "lookup_member_for_password_reset",
      {
        p_name: formValues.name.trim(),
        p_email: normalizedEmail,
      },
    );

    if (lookupError) {
      setPageError("회원 정보를 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }

    if (!isMatchedMember) {
      setFieldErrors((currentValue) => ({
        ...currentValue,
        email: "입력한 이름과 이메일이 일치하는 회원을 찾지 못했습니다.",
      }));
      return false;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (resetError) {
      setPageError(resetError.message || "비밀번호 재설정 메일 발송에 실패했습니다. 다시 시도해 주세요.");
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
                    ✉
                  </span>
                  <div className="public-auth-state-card__copy">
                    <p className="public-auth-state-card__title">재설정 메일을 발송했어요</p>
                    <p className="public-auth-state-card__description">
                      <strong>{submittedEmail}</strong> 메일함을 확인해주세요.
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
                  ) : null}
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
