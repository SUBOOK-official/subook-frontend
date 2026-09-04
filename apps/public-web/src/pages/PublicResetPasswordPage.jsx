import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { AlertTriangleIcon, CheckIcon, EyeIcon, EyeOffIcon } from "../components/icons";
import {
  makeOnceGuard,
  trackEvent,
  trackFormError,
  trackSelectContent,
} from "../lib/analytics";
import {
  getPasswordStrengthState,
  hasOnlyAllowedPasswordCharacters,
  hasRequiredPasswordConditions,
} from "../lib/publicAuthFormUtils";

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
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formValues, setFormValues] = useState({
    password: "",
    passwordConfirm: "",
  });
  const [fieldErrors, setFieldErrors] = useState({
    password: "",
    passwordConfirm: "",
  });
  // 링크 판정 결과는 마운트당 1건만 (initialize effect가 재실행돼도 중복 계측 방지)
  const trackOnceRef = useRef(makeOnceGuard());

  const handlePasswordKeyEvent = (event) => {
    if (typeof event.getModifierState === "function") {
      setIsCapsLockOn(event.getModifierState("CapsLock"));
    }
  };

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

  // 임시 비밀번호 재설정 세션은 페이지 이탈 시 반드시 signOut.
  // 그러지 않으면 사용자가 비밀번호 변경 안 한 채 페이지를 닫아도 1시간가량 세션이
  // 살아 있어, 같은 브라우저의 다른 탭에서 마이페이지/주문이 가능해진다.
  //
  // ⚠️ scope: 'local'을 사용해서 이 탭만 정리 — 다른 탭에서 정상적으로 로그인되어 있던
  // 기존 회원 세션은 건드리지 않는다 (글로벌 signOut을 하면 다른 탭 결제 흐름이 깨짐).
  // 비번 변경에 실제로 성공한 경우(handleSubmit success 분기)에만 global signOut을 호출.
  useEffect(() => {
    return () => {
      if (supabase) {
        void supabase.auth.signOut({ scope: "local" });
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setPageError("");
      setPhase("checking");

      // GA4 password_reset_link_open — 메일 링크가 실제로 열렸을 때의 판정 결과.
      // link_type: pkce(?code=) / implicit(#access_token=) / none(파라미터 없음).
      const linkType = urlInfo.code ? "pkce" : urlInfo.accessToken ? "implicit" : "none";
      const trackLinkOpen = (result, stage, extra) => {
        if (!trackOnceRef.current("link_open")) {
          return;
        }
        trackEvent("password_reset_link_open", {
          result,
          linkType,
          ...(stage ? { stage } : {}),
          ...extra,
        });
      };

      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) {
          setPageError("비밀번호 재설정 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
          setPhase("error");
        }
        trackLinkOpen("error", "not_configured");
        return;
      }

      if (urlInfo.error) {
        const nextState = buildResetLinkErrorState(urlInfo);
        if (isMounted) {
          setPageError(nextState.message);
          setPhase(nextState.phase);
        }
        trackLinkOpen(nextState.phase === "expired" ? "expired" : "error", "url_error", {
          errorCode: urlInfo.errorCode || urlInfo.error || "",
        });
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
            trackLinkOpen("expired", "exchange_code", {
              errorCode: exchangeError.code ?? "",
            });
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
            trackLinkOpen("expired", "set_session", {
              errorCode: setSessionError.code ?? "",
            });
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
        trackLinkOpen("expired", "no_session");
        return;
      }

      if (isMounted && urlInfo.hasAnyAuthParams && (location.hash || location.search)) {
        window.history.replaceState({}, document.title, location.pathname);
      }

      if (isMounted) {
        setPhase("ready");
      }
      trackLinkOpen("valid");
    };

    void initialize();

    return () => {
      isMounted = false;
    };
    // urlInfo는 location.hash/search 기반으로 useMemo한 결과이므로 location 의존만 남기면
    // 중복 트리거를 막을 수 있다 (eslint-disable로 명시적으로 안전성을 표시).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, location.pathname, location.search]);

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
    const errorReasons = { password: "", passwordConfirm: "" };

    if (!formValues.password) {
      nextErrors.password = "필수 항목입니다.";
      errorReasons.password = "required";
    } else if (!hasOnlyAllowedPasswordCharacters(formValues.password)) {
      nextErrors.password = "비밀번호에 한글·공백은 사용할 수 없어요. 영문, 숫자, 특수문자만 사용해 주세요.";
      errorReasons.password = "format";
    } else if (!hasRequiredPasswordConditions(formValues.password)) {
      nextErrors.password = "영문과 숫자를 포함한 8자 이상으로 입력해주세요.";
      errorReasons.password = "too_short";
    }

    if (!formValues.passwordConfirm) {
      nextErrors.passwordConfirm = "필수 항목입니다.";
      errorReasons.passwordConfirm = "required";
    } else if (formValues.password !== formValues.passwordConfirm) {
      nextErrors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
      errorReasons.passwordConfirm = "mismatch";
    }

    setFieldErrors(nextErrors);

    // GA4 form_validation_error — 재설정 폼에서 막히는 사유
    for (const fieldName of ["password", "passwordConfirm"]) {
      if (errorReasons[fieldName]) {
        trackFormError("reset_password", fieldName, errorReasons[fieldName]);
      }
    }

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
      // GA4 password_reset_complete — 링크는 유효했는데 변경에서 실패
      trackEvent("password_reset_complete", {
        result: "fail",
        errorMessage: updateError.message ?? "",
      });
      setPageError(updateError.message || "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.");
      setPhase("ready");
      return;
    }

    // GA4 password_reset_complete — 비밀번호 변경 성공(재설정 퍼널의 최종 전환)
    trackEvent("password_reset_complete", { result: "ok" });
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
                      onBlur={() => setIsCapsLockOn(false)}
                      onChange={handleChange("password")}
                      onKeyDown={handlePasswordKeyEvent}
                      onKeyUp={handlePasswordKeyEvent}
                      placeholder="새 비밀번호를 입력해 주세요."
                      type={showPassword ? "text" : "password"}
                      value={formValues.password}
                    />
                    <button
                      aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      className="public-auth-field-row__toggle public-auth-field-row__toggle--icon"
                      onClick={() => setShowPassword((currentValue) => !currentValue)}
                      type="button"
                    >
                      <span aria-hidden="true">{showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}</span>
                      <span className="public-auth-sr-only">{showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}</span>
                    </button>
                  </div>
                  {isCapsLockOn ? (
                    <p
                      aria-live="polite"
                      className="public-auth-inline-message public-auth-inline-message--warning"
                      role="status"
                    >
                      <AlertTriangleIcon size={13} /> Caps Lock이 켜져 있습니다.
                    </p>
                  ) : null}
                  <div
                    aria-live="polite"
                    className="public-password-strength"
                    role="status"
                  >
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
                      {passwordStrength.rules.map((rule) => {
                        const tagLabel = rule.required ? "(필수)" : "(권장)";
                        const ariaLabel = `${rule.label} ${tagLabel} ${rule.satisfied ? "충족" : "미충족"}`;

                        return (
                          <span
                            aria-label={ariaLabel}
                            className={`public-password-strength__rule ${rule.satisfied ? "is-satisfied" : ""} ${
                              rule.required
                                ? "public-password-strength__rule--required"
                                : "public-password-strength__rule--recommended"
                            }`}
                            key={rule.key}
                          >
                            <span aria-hidden="true">{rule.satisfied ? <CheckIcon size={12} /> : "•"}</span>
                            <span>
                              {rule.label}{" "}
                              <span className="public-password-strength__rule-tag">{tagLabel}</span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    {passwordStrength.hasDisallowedCharacters ? (
                      <p className="public-auth-inline-message public-auth-inline-message--error">
                        한글·공백은 사용할 수 없어요. 영문, 숫자, 특수문자만 입력해 주세요.
                      </p>
                    ) : null}
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
                    <CheckIcon size={18} />
                  </span>
                  <div className="public-auth-state-card__copy">
                    <p className="public-auth-state-card__title">비밀번호가 변경되었습니다</p>
                    <p className="public-auth-state-card__description">새 비밀번호로 로그인해 주세요.</p>
                  </div>
                </div>

                <div className="public-auth-state-card__actions">
                  <button
                    className="public-auth-button public-auth-button--primary"
                    onClick={() => {
                      // GA4 select_content — 변경 완료 후 로그인으로 이어진 비율
                      trackSelectContent("auth_entry", "login", {
                        uiSurface: "reset_password",
                        fromPhase: "success",
                      });
                      navigate("/login", {
                        replace: true,
                        state: {
                          notice: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
                        },
                      });
                    }}
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
                  <Link
                    className="public-auth-button public-auth-button--primary"
                    onClick={() =>
                      // GA4 select_content — 만료 링크에서 재요청으로 살아난 비율
                      trackSelectContent("auth_entry", "request_again", {
                        uiSurface: "reset_password",
                        fromPhase: "expired",
                      })
                    }
                    to="/forgot-password"
                  >
                    재발송 요청
                  </Link>
                </div>
              </div>
            ) : null}

            {phase === "checking" || phase === "ready" || phase === "saving" || phase === "error" ? (
              <div className="public-auth-link-row public-auth-link-row--single">
                <Link
                  className="public-auth-link-row__link"
                  onClick={() =>
                    trackSelectContent("auth_entry", "forgot_password", {
                      uiSurface: "reset_password",
                      fromPhase: phase,
                    })
                  }
                  to="/forgot-password"
                >
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
