import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { getPasswordStrengthState, hasRequiredPasswordConditions } from "../lib/publicAuthFormUtils";

function buildResetLinkErrorState({ error, errorCode, errorDescription } = {}) {
  const detail = [error, errorCode, errorDescription].filter(Boolean).join(" ").toLowerCase();

  if (
    detail.includes("expired") ||
    detail.includes("invalid") ||
    detail.includes("token") ||
    detail.includes("code") ||
    detail.includes("access_denied")
  ) {
    return {
      phase: "expired",
      message: "링크가 만료되었습니다. 비밀번호 재설정을 다시 요청해주세요.",
    };
  }

  const detailMessage = [error, errorCode].filter(Boolean).join(" / ");

  return {
    phase: "error",
    message: detailMessage
      ? `비밀번호 재설정 링크를 확인하지 못했습니다. (${detailMessage})`
      : "비밀번호 재설정 링크를 확인하지 못했습니다. 다시 요청해 주세요.",
  };
}

function PublicResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("checking");
  const [showPassword, setShowPassword] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formValues, setFormValues] = useState({
    password: "",
    passwordConfirm: "",
  });
  const [fieldErrors, setFieldErrors] = useState({
    password: "",
    passwordConfirm: "",
  });

  const urlInfo = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashString = (location.hash || "").startsWith("#") ? location.hash.slice(1) : location.hash || "";
    const hashParams = new URLSearchParams(hashString);

    return {
      code: searchParams.get("code") || "",
      accessToken: hashParams.get("access_token") || "",
      refreshToken: hashParams.get("refresh_token") || "",
      error: hashParams.get("error") || searchParams.get("error") || "",
      errorCode: hashParams.get("error_code") || searchParams.get("error_code") || "",
      errorDescription: hashParams.get("error_description") || searchParams.get("error_description") || "",
      hasAnyAuthParams: Boolean(
        searchParams.get("code") ||
          hashParams.get("access_token") ||
          hashParams.get("refresh_token") ||
          hashParams.get("error") ||
          searchParams.get("error"),
      ),
    };
  }, [location.hash, location.search]);

  const passwordStrength = useMemo(() => getPasswordStrengthState(formValues.password), [formValues.password]);
  const isPasswordMatch =
    formValues.passwordConfirm.length > 0 && formValues.password === formValues.passwordConfirm;
  const canSubmit =
    phase === "ready" &&
    hasRequiredPasswordConditions(formValues.password) &&
    isPasswordMatch &&
    !fieldErrors.password &&
    !fieldErrors.passwordConfirm;

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setPageError("");
      setPhase("checking");

      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) {
          setPageError("비밀번호 재설정 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
          setPhase("error");
        }
        return;
      }

      if (urlInfo.error) {
        if (isMounted) {
          const nextState = buildResetLinkErrorState(urlInfo);
          setPageError(nextState.message);
          setPhase(nextState.phase);
        }
        return;
      }

      const { data: initialSession } = await supabase.auth.getSession();

      if (!initialSession.session) {
        if (urlInfo.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(urlInfo.code);

          if (exchangeError) {
            if (isMounted) {
              setPageError("링크가 만료되었습니다. 비밀번호 재설정을 다시 요청해주세요.");
              setPhase("expired");
            }
            return;
          }
        } else if (urlInfo.accessToken && urlInfo.refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: urlInfo.accessToken,
            refresh_token: urlInfo.refreshToken,
          });

          if (setSessionError) {
            if (isMounted) {
              setPageError("링크가 만료되었습니다. 비밀번호 재설정을 다시 요청해주세요.");
              setPhase("expired");
            }
            return;
          }
        }
      }

      const { data: sessionAfter } = await supabase.auth.getSession();

      if (!sessionAfter.session) {
        if (isMounted) {
          setPageError("링크가 만료되었습니다. 비밀번호 재설정을 다시 요청해주세요.");
          setPhase("expired");
        }
        return;
      }

      if (isMounted && urlInfo.hasAnyAuthParams && (location.hash || location.search)) {
        window.history.replaceState({}, document.title, location.pathname);
      }

      if (isMounted) {
        setPhase("ready");
      }
    };

    void initialize();

    return () => {
      isMounted = false;
    };
  }, [location.hash, location.pathname, location.search, urlInfo]);

  const handleChange = (key) => (event) => {
    const nextValue = event.target.value;

    setFormValues((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setPageError("");
    setFieldErrors((currentValue) => ({
      ...currentValue,
      password: key === "password" ? "" : currentValue.password,
      passwordConfirm: "",
    }));
  };

  const validateFields = () => {
    const nextErrors = {
      password: "",
      passwordConfirm: "",
    };

    if (!formValues.password) {
      nextErrors.password = "필수 항목입니다.";
    } else if (!hasRequiredPasswordConditions(formValues.password)) {
      nextErrors.password = "영문과 숫자를 포함한 8자 이상으로 입력해주세요.";
    }

    if (!formValues.passwordConfirm) {
      nextErrors.passwordConfirm = "필수 항목입니다.";
    } else if (formValues.password !== formValues.passwordConfirm) {
      nextErrors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
    }

    setFieldErrors(nextErrors);
    return !nextErrors.password && !nextErrors.passwordConfirm;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPageError("");

    if (!isSupabaseConfigured || !supabase) {
      setPageError("비밀번호 재설정 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!validateFields()) {
      return;
    }

    setPhase("saving");

    const { error: updateError } = await supabase.auth.updateUser({
      password: formValues.password,
    });

    if (updateError) {
      setPageError(updateError.message || "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.");
      setPhase("ready");
      return;
    }

    await supabase.auth.signOut();
    setPhase("success");
  };

  return (
    <main className="public-auth-route">
      <div className="public-auth-shell">
        <section aria-labelledby="public-reset-password-heading" className="public-auth-card">
          <div className="public-auth-card__body">
            <div className="public-auth-card__heading public-auth-card__heading--left">
              <h1 className="public-auth-card__title" id="public-reset-password-heading">
                비밀번호 재설정
              </h1>
              <p className="public-auth-card__description">
                새 비밀번호를 입력하고 안전하게 다시 로그인해 주세요.
              </p>
            </div>

            {pageError && phase !== "expired" ? (
              <div className="public-auth-alert public-auth-alert--error">{pageError}</div>
            ) : null}

            {phase === "checking" ? (
              <div className="public-auth-alert public-auth-alert--info">
                재설정 링크를 확인하고 있어요. 잠시만 기다려주세요.
              </div>
            ) : null}

            {phase === "ready" || phase === "saving" ? (
              <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
                <div className={`public-auth-field-row ${fieldErrors.password ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-reset-password-password">
                    새 비밀번호
                  </label>
                  <div className="public-auth-field-row__control public-auth-field-row__control--with-action">
                    <input
                      autoComplete="new-password"
                      className="public-auth-field-row__input"
                      id="public-reset-password-password"
                      onChange={handleChange("password")}
                      placeholder="새 비밀번호를 입력해 주세요."
                      type={showPassword ? "text" : "password"}
                      value={formValues.password}
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
                  <div className="public-password-strength">
                    <div className="public-password-strength__summary">
                      <span>비밀번호 강도</span>
                      <strong className={`public-password-strength__label is-${passwordStrength.tone}`}>
                        {passwordStrength.label}
                      </strong>
                    </div>
                    <div aria-hidden="true" className="public-password-strength__bar">
                      <span
                        className={`public-password-strength__fill is-${passwordStrength.tone}`}
                        style={{ width: `${(passwordStrength.satisfiedCount / passwordStrength.rules.length) * 100}%` }}
                      />
                    </div>
                    <div className="public-password-strength__rules">
                      {passwordStrength.rules.map((rule) => (
                        <span
                          className={`public-password-strength__rule ${rule.satisfied ? "is-satisfied" : ""}`}
                          key={rule.key}
                        >
                          <span aria-hidden="true">{rule.satisfied ? "✓" : "•"}</span>
                          <span>{rule.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {fieldErrors.password ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.password}</p>
                  ) : null}
                </div>

                <div className={`public-auth-field-row ${fieldErrors.passwordConfirm ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-reset-password-password-confirm">
                    새 비밀번호 확인
                  </label>
                  <div className="public-auth-field-row__control">
                    <input
                      autoComplete="new-password"
                      className="public-auth-field-row__input"
                      id="public-reset-password-password-confirm"
                      onChange={handleChange("passwordConfirm")}
                      placeholder="비밀번호를 한 번 더 입력해 주세요."
                      type="password"
                      value={formValues.passwordConfirm}
                    />
                  </div>
                  {fieldErrors.passwordConfirm ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">
                      {fieldErrors.passwordConfirm}
                    </p>
                  ) : formValues.passwordConfirm ? (
                    <p
                      className={`public-auth-inline-message public-auth-inline-message--${
                        isPasswordMatch ? "success" : "error"
                      }`}
                    >
                      {isPasswordMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                    </p>
                  ) : null}
                </div>

                <button
                  className={`public-auth-button ${canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"}`}
                  disabled={!canSubmit || phase === "saving"}
                  type="submit"
                >
                  {phase === "saving" ? (
                    <>
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                      <span>비밀번호 변경 중...</span>
                    </>
                  ) : (
                    "비밀번호 변경"
                  )}
                </button>
              </form>
            ) : null}

            {phase === "success" ? (
              <div className="public-auth-state-card public-auth-state-card--success">
                <div className="public-auth-state-card__header">
                  <span aria-hidden="true" className="public-auth-state-card__icon">
                    ✓
                  </span>
                  <div className="public-auth-state-card__copy">
                    <p className="public-auth-state-card__title">비밀번호가 변경되었습니다</p>
                    <p className="public-auth-state-card__description">새 비밀번호로 로그인해 주세요.</p>
                  </div>
                </div>

                <div className="public-auth-state-card__actions">
                  <button
                    className="public-auth-button public-auth-button--primary"
                    onClick={() =>
                      navigate("/login", {
                        replace: true,
                        state: {
                          notice: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
                        },
                      })
                    }
                    type="button"
                  >
                    로그인하기
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "expired" ? (
              <div className="public-auth-state-card public-auth-state-card--error">
                <div className="public-auth-state-card__header">
                  <span aria-hidden="true" className="public-auth-state-card__icon">
                    !
                  </span>
                  <div className="public-auth-state-card__copy">
                    <p className="public-auth-state-card__title">링크가 만료되었습니다</p>
                    <p className="public-auth-state-card__description">
                      {pageError || "비밀번호 재설정을 다시 요청해주세요."}
                    </p>
                  </div>
                </div>

                <div className="public-auth-state-card__actions">
                  <Link className="public-auth-button public-auth-button--primary" to="/forgot-password">
                    재발송 요청
                  </Link>
                </div>
              </div>
            ) : null}

            {phase === "checking" || phase === "ready" || phase === "saving" || phase === "error" ? (
              <div className="public-auth-link-row public-auth-link-row--single">
                <Link className="public-auth-link-row__link" to="/forgot-password">
                  비밀번호 찾기로 돌아가기
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export default PublicResetPasswordPage;
