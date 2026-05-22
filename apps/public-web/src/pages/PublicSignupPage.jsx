import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

const RESEND_COOLDOWN_SECONDS = 60;

function normalizeVerificationCode(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 6);
}

function buildVerificationErrorMessage(error) {
  const rawMessage = error?.message?.toLowerCase?.() ?? "";
  if (rawMessage.includes("expired") || rawMessage.includes("token")) {
    return "인증코드가 만료되었거나 올바르지 않습니다. 다시 확인해주세요.";
  }
  return error?.message || "인증코드 확인에 실패했습니다. 다시 시도해주세요.";
}

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
  const location = useLocation();
  const { hasSession, isAdminAccount, isAuthenticated, signOut } = usePublicAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
  // 2026-05-19: signUp 직후 navigate 대신 같은 페이지에서 verification 카드로 전환.
  // phase: 'form' = 기존 가입 폼, 'verifying' = 6자리 인증코드 입력 단계.
  // 인증 완료 시점에만 진짜 가입이 활성화되며, 인증 전 이탈 사용자는
  // 같은 이메일로 재시도 시 자동으로 verifying 모드로 다시 진입.
  const [phase, setPhase] = useState("form");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    cooldownTimerRef.current = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [resendCooldown]);

  // PublicLoginPage 등에서 "인증 진행 중" 사용자가 navigate('/signup', { state: {email, requiresEmailConfirmation: true}})로
  // 전달되면 자동으로 verification 모드로 진입.
  useEffect(() => {
    const stateEmail = location.state?.email;
    if (location.state?.requiresEmailConfirmation && stateEmail) {
      setVerificationEmail(stateEmail);
      setVerificationCode("");
      setCodeError("");
      setPhase("verifying");
    }
    // location.state 전체 변경을 deps에 — 한 번 진입 후 다시 trigger되지 않도록
    // history.replaceState로 cleanup도 가능하지만, mount 시 1회만 동작해도 충분.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const isRequiredAllAgreed = hasRequiredAgreements;
  // "전체 동의" 체크박스 표시 상태 — 마케팅까지 모두 동의됐을 때만 체크 표시.
  const isAllAgreed = agreements.terms && agreements.privacy && agreements.marketing;
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

  // 2026-05-19 정책: "전체 동의"는 마케팅 정보 수신까지 함께 동의되도록 통합.
  // (사용자가 "전체 동의" 클릭 시 마케팅 동의율이 자연스럽게 올라감.
  //  라벨에 "마케팅 정보 수신 포함"을 명시해 다크 패턴이 아닌 명시적 안내로 처리.)
  const handleToggleRequiredAgreements = () => {
    const nextValue = !isAllAgreed;
    setAgreements({
      terms: nextValue,
      privacy: nextValue,
      marketing: nextValue,
    });
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
        // 인증 미완료 사용자가 같은 이메일로 재시도 시: resend로 코드 재발송하고 verification 모드로.
        // 이미 인증된 사용자라면 resend가 자동 실패하고 안내 메시지가 표시됨.
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
        });
        if (!resendError) {
          setVerificationEmail(normalizedEmail);
          setVerificationCode("");
          setCodeError("");
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
          setPhase("verifying");
          setIsSubmitting(false);
          setToastState({
            message: "이미 가입 진행 중인 이메일이에요. 인증코드를 다시 보냈어요.",
            tone: "info",
          });
          return;
        }
        // resend 실패 = 이미 완전히 가입된 계정. 기존 안내 유지.
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
        // 내부 마이그레이션 상태 노출은 운영팀 콘솔/Sentry에만 남기고
        // 사용자에게는 안전한 일반 메시지만 표시한다.
        console.warn("[signup] member_profiles 트리거/스키마 적용 상태 확인 필요:", rawMessage);
        setToastState({
          message: "회원가입을 진행할 수 없습니다. 잠시 후 다시 시도하거나 고객센터(subook2025@gmail.com)로 문의해 주세요.",
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

    // 가입 직후 세션이 자동 발급된 경우(이메일 인증이 비활성화된 Supabase 설정 등):
    //   1) 비-회원 계정(어드민 등)이라면 곧바로 signOut + 가입 차단
    //   2) 정상 회원이라면 이메일 인증 흐름과 일관성을 맞추기 위해 signOut 후
    //      /signup-success 에서 인증 안내를 보여준다.
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

      await supabase.auth.signOut();
      signupPayload.requiresEmailConfirmation = true;
    }

    // 가입 정보는 SuccessPage fallback 대비 localStorage에도 보관 (예전 흐름 유지).
    saveSignupSuccessState(signupPayload);
    // 같은 페이지에서 verification 모드로 전환. navigate 하지 않음.
    setVerificationEmail(normalizedEmail);
    setVerificationCode("");
    setCodeError("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setPhase("verifying");
    setIsSubmitting(false);
  };

  // 6자리 코드 검증 → 인증 완료 + 세션 발급 → 홈으로.
  const verifyCodeWithValue = async (codeValue) => {
    setCodeError("");

    if (!verificationEmail) {
      setToastState({
        message: "인증할 이메일 정보가 없어요. 회원가입을 다시 진행해 주세요.",
        tone: "error",
      });
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setToastState({
        message: "인증코드 확인 기능을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      return;
    }

    const normalizedCode = normalizeVerificationCode(codeValue);
    if (normalizedCode.length !== 6) {
      setCodeError("숫자 6자리 인증코드를 입력해주세요.");
      return;
    }

    setIsVerifying(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: verificationEmail,
      token: normalizedCode,
      type: "email",
    });

    if (verifyError) {
      setCodeError(buildVerificationErrorMessage(verifyError));
      setIsVerifying(false);
      return;
    }

    const { error: completeError } = await supabase.rpc("complete_member_email_verification");
    if (completeError) {
      setToastState({
        message: completeError.message || "이메일 인증 완료 처리를 마무리하지 못했습니다.",
        tone: "error",
      });
      setIsVerifying(false);
      return;
    }

    setIsVerifying(false);
    setToastState({
      message: "이메일 인증이 완료되었어요. 환영합니다!",
      tone: "success",
    });
    navigate("/", { replace: true });
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    await verifyCodeWithValue(verificationCode);
  };

  const handleResendCode = async () => {
    if (!verificationEmail || !isSupabaseConfigured || !supabase) return;
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: verificationEmail,
    });
    setIsResending(false);

    if (error) {
      setToastState({
        message: error.message || "인증코드 재발송에 실패했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      return;
    }

    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setToastState({
      message: "인증코드를 다시 보냈어요. 메일함을 확인해 주세요.",
      tone: "success",
    });
  };

  // verification 모드에서 "이메일 변경" 클릭 시 폼으로 복귀.
  const handleResetToForm = () => {
    setPhase("form");
    setVerificationCode("");
    setCodeError("");
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
              aria-label="이전 페이지로 돌아가기"
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
              <span aria-hidden="true" className="public-auth-back-link__chevron">
                ‹
              </span>
              <span>뒤로</span>
            </button>

            <div className="public-auth-brand-lockup">
              <Link className="public-auth-brand" to="/">
                SUBOOK
              </Link>
              <p className="public-auth-brand-lockup__tagline">수능 교재, 똑똑하게 거래</p>
            </div>

            <div className="public-auth-card__heading public-auth-card__heading--left">
              <h1 className="public-auth-card__title" id="public-signup-heading">
                회원가입
              </h1>
              <p className="public-auth-card__description">
                기본 정보와 약관 동의를 완료하면 바로 회원가입을 진행할 수 있어요.
              </p>
            </div>

            <PublicOAuthButtons
              contextLabel="회원가입"
              dividerLabel="또는 이메일로 계속"
              dividerPosition="bottom"
              placement="top"
              redirectTo={`${window.location.origin}/auth/callback?next=${encodeURIComponent("/mypage")}`}
            />

            {hasSession && isAdminAccount ? (
              <div className="public-auth-alert public-auth-alert--info public-auth-alert--action">
                <span>운영자 세션이 연결되어 있습니다. 일반 회원가입은 회원 계정에서만 진행할 수 있습니다.</span>
                <button className="public-auth-inline-button" onClick={handleClearSession} type="button">
                  현재 세션 로그아웃
                </button>
              </div>
            ) : null}

            {pageAlert ? <div className="public-auth-alert public-auth-alert--error">{pageAlert}</div> : null}

            {phase === "verifying" ? (
              <div className="public-auth-form-card public-auth-form-card--verifying">
                <div className="public-auth-card__heading public-auth-card__heading--left">
                  <h2 className="public-auth-card__title" style={{ fontSize: 20 }}>이메일 인증</h2>
                  <p className="public-auth-card__description">
                    <strong>{verificationEmail}</strong> 으로 보낸 <strong>6자리 인증코드</strong>를 입력해 주세요.
                    인증 완료 전까지는 가입이 마무리되지 않아요.
                  </p>
                </div>

                <form noValidate onSubmit={handleVerifySubmit}>
                  <div className={`public-auth-field-row ${codeError ? "is-error" : ""}`}>
                    <label className="public-auth-field-row__label" htmlFor="public-signup-verify-code">
                      인증코드 <span className="public-auth-field-row__required">*</span>
                    </label>
                    <div className="public-auth-field-row__control">
                      <input
                        autoComplete="one-time-code"
                        autoFocus
                        className="public-auth-field-row__input"
                        id="public-signup-verify-code"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => {
                          const nextCode = normalizeVerificationCode(event.target.value);
                          setVerificationCode(nextCode);
                          setCodeError("");
                          if (nextCode.length === 6 && !isVerifying) {
                            void verifyCodeWithValue(nextCode);
                          }
                        }}
                        placeholder="6자리 숫자"
                        type="text"
                        value={verificationCode}
                      />
                      {codeError ? (
                        <p className="public-auth-inline-message public-auth-inline-message--error">{codeError}</p>
                      ) : null}
                    </div>
                  </div>

                  <button
                    className="public-auth-submit-button"
                    disabled={isVerifying || verificationCode.length !== 6}
                    type="submit"
                  >
                    {isVerifying ? (
                      <>
                        <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                        <span>인증 중...</span>
                      </>
                    ) : (
                      "인증 완료하고 가입 마치기"
                    )}
                  </button>
                </form>

                <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    className="public-auth-link-row__link"
                    disabled={isResending || resendCooldown > 0}
                    onClick={handleResendCode}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                    type="button"
                  >
                    {isResending
                      ? "재발송 중..."
                      : resendCooldown > 0
                        ? `${resendCooldown}초 후 다시 보낼 수 있어요`
                        : "인증코드 다시 보내기"}
                  </button>
                  <button
                    className="public-auth-link-row__link"
                    onClick={handleResetToForm}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "#6a728d" }}
                    type="button"
                  >
                    이메일 변경
                  </button>
                </div>
              </div>
            ) : (
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
                    className="public-auth-field-row__toggle public-auth-field-row__toggle--icon"
                    onClick={() => setShowPassword((currentValue) => !currentValue)}
                    type="button"
                  >
                    <span aria-hidden="true">{showPassword ? "🙈" : "👁"}</span>
                    <span className="public-auth-sr-only">{showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}</span>
                  </button>
                </div>
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
                          <span aria-hidden="true">{rule.satisfied ? "✓" : "•"}</span>
                          <span>
                            {rule.label}{" "}
                            <span className="public-password-strength__rule-tag">{tagLabel}</span>
                          </span>
                        </span>
                      );
                    })}
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
                {/*
                  2026-05-19 정책: "전체 동의" 토글에 마케팅 정보 수신까지 함께 포함.
                  라벨에 "(마케팅 정보 수신 포함)"을 명시해서 다크 패턴이 아닌
                  사용자가 인지한 일괄 동의로 처리.
                */}
                <label className="public-auth-agreement-box__all">
                  <span className="public-auth-checkmark">
                    <input checked={isAllAgreed} onChange={handleToggleRequiredAgreements} type="checkbox" />
                    <span aria-hidden="true" className="public-auth-checkmark__indicator">
                      ✓
                    </span>
                  </span>
                  <span>
                    약관 전체 동의
                    <span className="public-auth-agreement-box__all-hint"> (마케팅 정보 수신 포함)</span>
                  </span>
                </label>

                <div aria-hidden="true" className="public-auth-agreement-box__divider" />

                <div className="public-auth-agreement-box__list">
                  {agreementItems
                    .filter((item) => item.required)
                    .map((item) => (
                      <div className="public-auth-agreement-box__item" key={item.key}>
                        <label className="public-auth-agreement-box__item-label">
                          <span className="public-auth-checkmark">
                            <input checked={agreements[item.key]} onChange={() => handleToggleAgreement(item.key)} type="checkbox" />
                            <span aria-hidden="true" className="public-auth-checkmark__indicator">
                              ✓
                            </span>
                          </span>
                          <span className="public-auth-agreement-box__item-copy">
                            <span className="public-auth-agreement-box__item-tag public-auth-agreement-box__item-tag--required">
                              {item.tagLabel}
                            </span>
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

                <div aria-hidden="true" className="public-auth-agreement-box__divider" />

                <div className="public-auth-agreement-box__list">
                  {agreementItems
                    .filter((item) => !item.required)
                    .map((item) => (
                      <div className="public-auth-agreement-box__item" key={item.key}>
                        <label className="public-auth-agreement-box__item-label">
                          <span className="public-auth-checkmark">
                            <input checked={agreements[item.key]} onChange={() => handleToggleAgreement(item.key)} type="checkbox" />
                            <span aria-hidden="true" className="public-auth-checkmark__indicator">
                              ✓
                            </span>
                          </span>
                          <span className="public-auth-agreement-box__item-copy">
                            <span className="public-auth-agreement-box__item-tag public-auth-agreement-box__item-tag--optional">
                              {item.tagLabel}
                            </span>
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
            )}
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
