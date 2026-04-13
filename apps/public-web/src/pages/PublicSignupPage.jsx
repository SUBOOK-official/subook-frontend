import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAgreementDialog from "../components/PublicAgreementDialog";
import PublicOAuthButtons from "../components/PublicOAuthButtons";
import PublicToastMessage from "../components/PublicToastMessage";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { getPublicAccountAccessState } from "../lib/publicAuthAccess";
import {
  formatPhoneNumber,
  getPasswordStrengthState,
  hasRequiredPasswordConditions,
  hasValidPhoneNumber,
  isValidEmailFormat,
  normalizeEmail,
} from "../lib/publicAuthFormUtils";
import { saveSignupSuccessState } from "../lib/publicSignupSuccessState";

const agreementItems = [
  {
    key: "terms",
    label: "이용약관",
    required: true,
    tagLabel: "[필수]",
    title: "이용약관",
    paragraphs: [
      "SUBOOK은 회원이 등록한 수능 교재를 위탁 판매하고, 구매자는 상태와 가격 정보를 확인한 뒤 안전하게 거래할 수 있도록 중개합니다.",
      "회원은 가입 시 정확한 정보를 입력해야 하며, 타인의 정보를 도용하거나 허위 정보를 등록할 수 없습니다.",
      "플랫폼 운영 정책과 검수 결과에 따라 등록 상품의 판매 여부, 가격, 노출 상태가 조정될 수 있습니다.",
    ],
  },
  {
    key: "privacy",
    label: "개인정보 수집 및 이용",
    required: true,
    tagLabel: "[필수]",
    title: "개인정보 수집 및 이용 동의",
    paragraphs: [
      "수북은 회원 식별, 주문 처리, 배송, 정산, 고객 응대를 위해 이름, 이메일, 연락처 등 최소한의 정보를 수집합니다.",
      "수집한 정보는 서비스 제공 목적 범위 안에서만 사용하며, 관련 법령 또는 회원 동의 없이 제3자에게 임의 제공하지 않습니다.",
      "회원은 언제든지 개인정보 열람, 수정, 삭제를 요청할 수 있으며, 법령상 보관 의무가 있는 정보는 해당 기간 동안 안전하게 보관됩니다.",
    ],
  },
  {
    key: "marketing",
    label: "마케팅 정보 수신",
    required: false,
    tagLabel: "[선택]",
    title: "마케팅 정보 수신 동의",
    paragraphs: [
      "이벤트, 할인, 신규 서비스 안내를 이메일 또는 SNS 알림으로 받아볼 수 있습니다.",
      "선택 동의이며, 거부해도 회원가입과 기본 서비스 이용에는 제한이 없습니다.",
      "마이페이지 또는 알림 설정에서 언제든지 수신 동의를 철회할 수 있습니다.",
    ],
  },
];

function PublicSignupPage() {
  const navigate = useNavigate();
  const { hasSession, isAdminAccount, isAuthenticated, signOut } = usePublicAuth();

  const [formValues, setFormValues] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
  });
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    agreements: "",
  });
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailStatus, setEmailStatus] = useState({
    state: "idle",
    email: "",
    message: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [activeAgreementKey, setActiveAgreementKey] = useState("");
  const [toastState, setToastState] = useState({
    message: "",
    tone: "info",
  });
  const [pageAlert, setPageAlert] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = normalizeEmail(formValues.email);
  const passwordStrength = useMemo(() => getPasswordStrengthState(formValues.password), [formValues.password]);
  const isPasswordMatch =
    formValues.passwordConfirm.length > 0 && formValues.password === formValues.passwordConfirm;
  const hasRequiredAgreements = agreementItems
    .filter((item) => item.required)
    .every((item) => agreements[item.key]);
  const isAllAgreed = agreementItems.every((item) => agreements[item.key]);
  const isEmailAvailable = emailStatus.state === "available" && emailStatus.email === normalizedEmail;
  const canSubmit =
    !hasSession &&
    normalizedEmail &&
    formValues.name.trim() &&
    hasValidPhoneNumber(formValues.phone) &&
    hasRequiredPasswordConditions(formValues.password) &&
    isPasswordMatch &&
    hasRequiredAgreements &&
    isEmailAvailable &&
    !isSubmitting;

  useEffect(() => {
    if (!emailTouched) {
      return undefined;
    }

    if (!normalizedEmail) {
      setEmailStatus({
        state: "idle",
        email: "",
        message: "",
      });
      return undefined;
    }

    if (!isValidEmailFormat(normalizedEmail)) {
      setEmailStatus({
        state: "invalid",
        email: normalizedEmail,
        message: "유효한 이메일 형식인지 확인해 주세요.",
      });
      return undefined;
    }

    if (!isSupabaseConfigured || !supabase) {
      setEmailStatus({
        state: "error",
        email: normalizedEmail,
        message: "이메일 확인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
      return undefined;
    }

    setEmailStatus({
      state: "checking",
      email: normalizedEmail,
      message: "이메일 사용 가능 여부를 확인하고 있어요.",
    });

    let isMounted = true;
    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("check_member_email_availability", {
        p_email: normalizedEmail,
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setEmailStatus({
          state: "error",
          email: normalizedEmail,
          message: "이메일 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (row?.is_available) {
        setEmailStatus({
          state: "available",
          email: normalizedEmail,
          message: "사용 가능한 이메일입니다.",
        });
        return;
      }

      if (row?.account_role === "member") {
        setEmailStatus({
          state: "duplicate",
          email: normalizedEmail,
          message: "이미 가입된 이메일입니다.",
        });
        return;
      }

      setEmailStatus({
        state: "unavailable",
        email: normalizedEmail,
        message: "사용할 수 없는 이메일입니다. 다른 이메일을 입력해 주세요.",
      });
    }, 500);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [emailTouched, normalizedEmail]);

  const activeAgreement = agreementItems.find((item) => item.key === activeAgreementKey) ?? null;

  const handleChangeValue = (key) => (event) => {
    const nextValue = key === "phone" ? formatPhoneNumber(event.target.value) : event.target.value;

    setFormValues((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setPageAlert("");
    setFieldErrors((currentValue) => ({
      ...currentValue,
      [key]: "",
    }));

    if (key === "email") {
      setFieldErrors((currentValue) => ({
        ...currentValue,
        email: "",
      }));
    }
  };

  const handleEmailBlur = () => {
    setEmailTouched(true);

    if (!formValues.email.trim()) {
      return;
    }

    if (!isValidEmailFormat(formValues.email)) {
      setFieldErrors((currentValue) => ({
        ...currentValue,
        email: "유효한 이메일 형식인지 확인해 주세요.",
      }));
      return;
    }

    setFieldErrors((currentValue) => ({
      ...currentValue,
      email: "",
    }));
  };

  const handleToggleAgreement = (key) => {
    setAgreements((currentValue) => ({
      ...currentValue,
      [key]: !currentValue[key],
    }));
    setFieldErrors((currentValue) => ({
      ...currentValue,
      agreements: "",
    }));
  };

  const handleToggleAllAgreements = () => {
    const nextValue = !isAllAgreed;
    setAgreements(
      agreementItems.reduce(
        (result, item) => ({
          ...result,
          [item.key]: nextValue,
        }),
        {},
      ),
    );
    setFieldErrors((currentValue) => ({
      ...currentValue,
      agreements: "",
    }));
  };

  const handleClearSession = async () => {
    setPageAlert("");
    await signOut();
  };

  const validateFields = () => {
    const nextErrors = {
      email: "",
      password: "",
      passwordConfirm: "",
      name: "",
      phone: "",
      agreements: "",
    };

    if (!normalizedEmail) {
      nextErrors.email = "필수 항목입니다.";
    } else if (!isValidEmailFormat(normalizedEmail)) {
      nextErrors.email = "유효한 이메일 형식인지 확인해 주세요.";
    } else if (emailStatus.state === "duplicate") {
      nextErrors.email = "이미 가입된 이메일입니다.";
    } else if (emailStatus.state === "unavailable") {
      nextErrors.email = "사용할 수 없는 이메일입니다.";
    } else if (!isEmailAvailable) {
      nextErrors.email = "이메일 중복 확인을 완료해 주세요.";
    }

    if (!formValues.password) {
      nextErrors.password = "필수 항목입니다.";
    } else if (!hasRequiredPasswordConditions(formValues.password)) {
      nextErrors.password = "비밀번호 조건을 확인해 주세요.";
    }

    if (!formValues.passwordConfirm) {
      nextErrors.passwordConfirm = "필수 항목입니다.";
    } else if (!isPasswordMatch) {
      nextErrors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
    }

    if (!formValues.name.trim()) {
      nextErrors.name = "필수 항목입니다.";
    }

    if (!formValues.phone.trim()) {
      nextErrors.phone = "필수 항목입니다.";
    } else if (!hasValidPhoneNumber(formValues.phone)) {
      nextErrors.phone = "연락처 형식을 확인해 주세요.";
    }

    if (!hasRequiredAgreements) {
      nextErrors.agreements = "필수 약관 동의가 필요합니다.";
    }

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((value) => !value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setToastState({
      message: "",
      tone: "info",
    });
    setPageAlert("");

    if (!isSupabaseConfigured || !supabase) {
      setToastState({
        message: "회원가입 기능을 사용하려면 Supabase 환경 변수가 필요합니다.",
        tone: "error",
      });
      return;
    }

    if (!validateFields()) {
      return;
    }

    setIsSubmitting(true);

    const signupPayload = {
      email: normalizedEmail,
      name: formValues.name.trim(),
      requiresEmailConfirmation: true,
    };
    const agreedAt = new Date().toISOString();

    const { data, error: signupError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: formValues.password,
      options: {
        data: {
          name: formValues.name.trim(),
          nickname: formValues.name.trim(),
          phone: formValues.phone.trim(),
          marketing_opt_in: agreements.marketing,
          terms_agreed_at: agreedAt,
          privacy_agreed_at: agreedAt,
          marketing_agreed_at: agreements.marketing ? agreedAt : null,
        },
      },
    });

    if (signupError) {
      const rawMessage = signupError.message?.toLowerCase() ?? "";

      if (rawMessage.includes("already registered")) {
        setEmailStatus({
          state: "duplicate",
          email: normalizedEmail,
          message: "이미 가입된 이메일입니다.",
        });
        setFieldErrors((currentValue) => ({
          ...currentValue,
          email: "이미 가입된 이메일입니다.",
        }));
      } else if (rawMessage.includes("database error saving new user")) {
        setToastState({
          message: "회원가입 저장 중 서버 설정 오류가 발생했습니다. Supabase 마이그레이션 적용 상태를 확인해 주세요.",
          tone: "error",
        });
      } else {
        setToastState({
          message: signupError.message || "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          tone: "error",
        });
      }

      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      const accessState = await getPublicAccountAccessState(data.session.user);

      if (accessState.accountRole !== "member") {
        await supabase.auth.signOut();
        setToastState({
          message:
            accessState.accountRole === "admin"
              ? "이 이메일은 운영자 계정으로 연결되어 있어 공개 회원가입에 사용할 수 없습니다."
              : "회원 계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          tone: "error",
        });
        setIsSubmitting(false);
        return;
      }

      signupPayload.requiresEmailConfirmation = false;
    }

    if (data.session) {
      await supabase.auth.signOut();
      signupPayload.requiresEmailConfirmation = true;
    }

    saveSignupSuccessState(signupPayload);
    setIsSubmitting(false);
    navigate("/signup-success", {
      replace: true,
      state: signupPayload,
    });
  };

  return (
    <>
      <PublicToastMessage
        message={toastState.message}
        onClose={() =>
          setToastState({
            message: "",
            tone: "info",
          })
        }
        tone={toastState.tone}
      />

      <main className="public-auth-route">
        <div className="public-auth-shell">
          <section aria-labelledby="public-signup-heading" className="public-auth-card public-auth-card--signup">
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

            <div className="public-auth-card__heading public-auth-card__heading--left">
              <h1 className="public-auth-card__title" id="public-signup-heading">
                회원가입
              </h1>
              <p className="public-auth-card__description">
                기본 정보와 약관 동의를 완료하면 바로 회원가입을 진행할 수 있어요.
              </p>
            </div>

            {isAuthenticated ? (
              <div className="public-auth-alert public-auth-alert--info">
                이미 로그인된 상태입니다. 다른 계정으로 회원가입하려면 먼저 로그아웃해 주세요.
              </div>
            ) : hasSession && isAdminAccount ? (
              <div className="public-auth-alert public-auth-alert--info public-auth-alert--action">
                <span>운영자 세션이 연결되어 있습니다. 일반 회원가입은 회원 계정에서만 진행할 수 있습니다.</span>
                <button className="public-auth-inline-button" onClick={handleClearSession} type="button">
                  현재 세션 로그아웃
                </button>
              </div>
            ) : null}

            {pageAlert ? <div className="public-auth-alert public-auth-alert--error">{pageAlert}</div> : null}

            <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
              <div className={`public-auth-field-row ${fieldErrors.email ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-signup-email">
                  이메일 <span className="public-auth-field-row__required">*</span>
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="email"
                    className="public-auth-field-row__input"
                    id="public-signup-email"
                    onBlur={handleEmailBlur}
                    onChange={handleChangeValue("email")}
                    placeholder="example@email.com"
                    type="email"
                    value={formValues.email}
                  />
                </div>
                {emailStatus.state === "duplicate" ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">
                    <span>{emailStatus.message}</span>
                    <Link className="public-auth-inline-message__link" to="/login">
                      로그인하기 →
                    </Link>
                  </p>
                ) : fieldErrors.email ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.email}</p>
                ) : emailStatus.message ? (
                  <p
                    className={`public-auth-inline-message public-auth-inline-message--${
                      emailStatus.state === "available"
                        ? "success"
                        : emailStatus.state === "checking"
                          ? "info"
                          : "error"
                    }`}
                  >
                    {emailStatus.message}
                  </p>
                ) : null}
              </div>

              <div className={`public-auth-field-row ${fieldErrors.password ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-signup-password">
                  비밀번호 <span className="public-auth-field-row__required">*</span>
                </label>
                <div className="public-auth-field-row__control public-auth-field-row__control--with-action">
                  <input
                    autoComplete="new-password"
                    className="public-auth-field-row__input"
                    id="public-signup-password"
                    onChange={handleChangeValue("password")}
                    placeholder="비밀번호를 입력해 주세요."
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
                <label className="public-auth-field-row__label" htmlFor="public-signup-password-confirm">
                  비밀번호 확인 <span className="public-auth-field-row__required">*</span>
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="new-password"
                    className="public-auth-field-row__input"
                    id="public-signup-password-confirm"
                    onChange={handleChangeValue("passwordConfirm")}
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

              <div className={`public-auth-field-row ${fieldErrors.name ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-signup-name">
                  이름 <span className="public-auth-field-row__required">*</span>
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="name"
                    className="public-auth-field-row__input"
                    id="public-signup-name"
                    onChange={handleChangeValue("name")}
                    placeholder="홍길동"
                    type="text"
                    value={formValues.name}
                  />
                </div>
                {fieldErrors.name ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div className={`public-auth-field-row ${fieldErrors.phone ? "is-error" : ""}`}>
                <label className="public-auth-field-row__label" htmlFor="public-signup-phone">
                  연락처 <span className="public-auth-field-row__required">*</span>
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="tel"
                    className="public-auth-field-row__input"
                    id="public-signup-phone"
                    inputMode="numeric"
                    onChange={handleChangeValue("phone")}
                    placeholder="010-1234-5678"
                    type="tel"
                    value={formValues.phone}
                  />
                </div>
                {fieldErrors.phone ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.phone}</p>
                ) : null}
              </div>

              <div className={`public-auth-agreement-box ${fieldErrors.agreements ? "is-error" : ""}`}>
                <label className="public-auth-agreement-box__all">
                  <span className="public-auth-checkmark">
                    <input checked={isAllAgreed} onChange={handleToggleAllAgreements} type="checkbox" />
                    <span aria-hidden="true" className="public-auth-checkmark__indicator">
                      ✓
                    </span>
                  </span>
                  <span>전체 동의</span>
                </label>

                <div aria-hidden="true" className="public-auth-agreement-box__divider" />

                <div className="public-auth-agreement-box__list">
                  {agreementItems.map((item) => (
                    <div className="public-auth-agreement-box__item" key={item.key}>
                      <label className="public-auth-agreement-box__item-label">
                        <span className="public-auth-checkmark">
                          <input checked={agreements[item.key]} onChange={() => handleToggleAgreement(item.key)} type="checkbox" />
                          <span aria-hidden="true" className="public-auth-checkmark__indicator">
                            ✓
                          </span>
                        </span>
                        <span className="public-auth-agreement-box__item-copy">
                          <span className="public-auth-agreement-box__item-tag">{item.tagLabel}</span>
                          <span>{item.label}</span>
                        </span>
                      </label>
                      <button
                        className="public-auth-agreement-box__view"
                        onClick={() => setActiveAgreementKey(item.key)}
                        type="button"
                      >
                        보기
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {fieldErrors.agreements ? (
                <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.agreements}</p>
              ) : null}

              <button className="public-auth-button public-auth-button--primary" disabled={!canSubmit} type="submit">
                {isSubmitting ? (
                  <>
                    <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                    <span>가입 중...</span>
                  </>
                ) : (
                  "가입하기"
                )}
              </button>
            </form>

            <PublicOAuthButtons contextLabel="회원가입" redirectTo={`${window.location.origin}/mypage`} />

            <div className="public-auth-link-row public-auth-link-row--single">
              <Link className="public-auth-link-row__link" to="/login">
                로그인하기
              </Link>
            </div>
          </section>
        </div>
      </main>

      <PublicAgreementDialog
        documentItem={activeAgreement}
        onClose={() => setActiveAgreementKey("")}
        open={Boolean(activeAgreement)}
      />
    </>
  );
}

export default PublicSignupPage;
