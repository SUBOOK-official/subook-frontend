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
  // 2026-05-19: 같은 화면에서 이메일 인증코드 입력 ~ 가입까지 한 번에 처리.
  // 인증코드 받기(signInWithOtp) → 6자리 입력 + 자동 verify → 비번/이름/약관 → 가입(updateUser).
  // verificationStatus: 'idle' = 아직 안 받음, 'sending' = 발송 중,
  //   'sent' = 발송 완료 입력 대기, 'verifying' = 검증 중, 'verified' = 인증 완료.
  const [verificationStatus, setVerificationStatus] = useState("idle");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // OTP 인증으로 인해 isAuthenticated가 true가 됐어도, 사용자는 비번/이름/약관 입력 단계를 마쳐야 함.
  // verificationStatus가 "idle"인 경우(= 이미 가입된 사용자가 /signup 직접 방문)에만 자동 redirect.
  // 가입 완료 시점에는 handleSubmit이 navigate("/")를 명시적으로 호출.
  // (useEffect는 verificationStatus 선언 *이후*에 두어야 TDZ 에러를 피한다.)
  useEffect(() => {
    if (isAuthenticated && verificationStatus === "idle") {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate, verificationStatus]);
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

  // PublicLoginPage 등에서 "인증 진행 중" 사용자가 navigate('/signup', { state: {email}})로
  // 보내면 이메일을 폼에 prefill (verification은 사용자가 다시 "인증코드 받기" 누르면 됨).
  useEffect(() => {
    const stateEmail = location.state?.email;
    if (stateEmail) {
      setFormValues((current) => ({ ...current, email: stateEmail }));
    }
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
  // "필수 약관 전체 동의" 체크박스 표시 상태 — 필수 약관 모두 동의됐을 때만 체크.
  // 마케팅(선택)은 별도 체크박스로 분리. 한 번에 묶어 처리하는 패턴은 방통위 권고에 어긋남.
  const isAllAgreed = agreements.terms && agreements.privacy;
  const isEmailAvailable = emailStatus.state === "available" && emailStatus.email === normalizedEmail;
  // canSubmit은 더 이상 버튼 disabled 결정에 쓰지 않음 (handleSubmit이 validateFields로 책임).
  // hasSession (이미 로그인된 상태)일 때만 별도로 차단.
  const cannotSignupBecauseLoggedIn = Boolean(hasSession);

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

  // 2026-05-25 정책 변경: "필수 약관 전체 동의"는 필수 약관만 일괄 처리.
  // 마케팅(선택)은 사용자가 별도 체크박스에서 의식적으로 선택해야 함.
  // (필수 + 선택을 한 번에 묶어 처리하면 방통위 다크 패턴 권고 위반)
  const handleToggleRequiredAgreements = () => {
    const nextValue = !isAllAgreed;
    setAgreements((current) => ({
      ...current,
      terms: nextValue,
      privacy: nextValue,
    }));
    setFieldErrors((currentValue) => ({
      ...currentValue,
      agreements: "",
    }));
  };

  const handleClearSession = async () => {
    setPageAlert("");
    await signOut();
  };

  // 검증 통과한 첫 에러 필드를 찾아 scrollIntoView + focus.
  // 사용자가 "왜 가입이 안 눌리지?" 혼란 없이, 어떤 필드가 미충족인지 즉시 시각화.
  const focusFirstError = (errors) => {
    const order = ["email", "verification", "password", "passwordConfirm", "name", "phone", "agreements"];
    const firstKey = order.find((key) => errors[key]);
    if (!firstKey) return;

    const elementId =
      firstKey === "passwordConfirm"
        ? "public-signup-password-confirm"
        : firstKey === "verification"
          ? "public-signup-verify-code"
          : firstKey === "agreements"
            ? null
            : `public-signup-${firstKey}`;

    // 약관은 별도 셀렉터로 (id 없음).
    const target = elementId
      ? document.getElementById(elementId)
      : document.querySelector(".public-auth-agreement-box");
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof target.focus === "function") {
      // input의 경우 즉시 focus, 약관 div는 focus 안 됨 — scroll만으로 충분.
      window.setTimeout(() => target.focus({ preventScroll: true }), 300);
    }
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
      nextErrors.password = "비밀번호 조건(8자 이상 · 영문 · 숫자)을 모두 충족해 주세요.";
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

    // 이메일 인증은 별도 코드 input의 에러 메시지(codeError)로 처리하지만,
    // validateFields의 시점에 인증 미완료면 codeError에 안내 + focusFirstError로 코드 input으로 스크롤.
    setFieldErrors(nextErrors);
    const isValid = Object.values(nextErrors).every((value) => !value);
    if (!isValid) {
      focusFirstError(nextErrors);
      return false;
    }
    if (verificationStatus !== "verified") {
      setCodeError("이메일 인증을 먼저 완료해 주세요.");
      focusFirstError({ verification: "이메일 인증을 먼저 완료해 주세요." });
      return false;
    }
    return true;
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

    // 2026-05-19: 이메일 인증은 폼 안에서 verifyOtp로 이미 완료된 상태여야 함.
    // 인증 완료 시 세션이 발급되어 있으므로 updateUser로 비번 + 메타데이터를 설정해 가입 완성.
    if (verificationStatus !== "verified") {
      setCodeError("이메일 인증을 먼저 완료해 주세요. '인증코드 받기'를 누른 뒤 받은 코드를 입력하세요.");
      focusFirstError({ verification: "이메일 인증을 먼저 완료해 주세요." });
      return;
    }

    setIsSubmitting(true);

    // 인증된 user가 admin 이메일이면 차단.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessState = await getPublicAccountAccessState(sessionData.session?.user ?? null);
    if (accessState.accountRole === "admin") {
      await supabase.auth.signOut();
      setToastState({
        message: "이 이메일은 운영자 계정으로 연결되어 있어 공개 회원가입에 사용할 수 없습니다.",
        tone: "error",
      });
      setIsSubmitting(false);
      return;
    }

    const agreedAt = new Date().toISOString();
    const { error: updateError } = await supabase.auth.updateUser({
      password: formValues.password,
      data: {
        name: formValues.name.trim(),
        nickname: formValues.name.trim(),
        phone: formValues.phone.trim(),
        marketing_opt_in: agreements.marketing,
        terms_agreed_at: agreedAt,
        privacy_agreed_at: agreedAt,
        marketing_agreed_at: agreements.marketing ? agreedAt : null,
      },
    });

    if (updateError) {
      setToastState({
        message: updateError.message || "가입 정보 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      setIsSubmitting(false);
      return;
    }

    // member_profiles.email_verified_at 마무리 처리 (트리거가 처리하지만 명시적으로 한 번 더 호출).
    await supabase.rpc("complete_member_email_verification").catch(() => null);

    saveSignupSuccessState({
      email: normalizedEmail,
      name: formValues.name.trim(),
      isVerified: true,
      requiresEmailConfirmation: false,
    });
    setToastState({
      message: "회원가입이 완료되었어요. 환영합니다!",
      tone: "success",
    });
    setIsSubmitting(false);
    navigate("/", { replace: true });
  };

  // 이메일에 6자리 인증코드 발송. user는 임시 생성됨(비번 없음).
  // 사용자는 인증 후 같은 화면에서 비번/이름/약관 등 나머지 입력 → "가입하기" → updateUser로 완성.
  const handleSendOtp = async () => {
    setCodeError("");

    if (!isSupabaseConfigured || !supabase) {
      setToastState({
        message: "인증코드를 보낼 수 없어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      return;
    }
    if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
      setFieldErrors((current) => ({
        ...current,
        email: !normalizedEmail ? "이메일을 입력해 주세요." : "유효한 이메일 형식인지 확인해 주세요.",
      }));
      return;
    }
    if (resendCooldown > 0 || verificationStatus === "sending") return;

    setVerificationStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setVerificationStatus("idle");
      setCodeError(error.message || "인증코드 발송에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setVerificationStatus("sent");
    setVerifiedEmail("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setToastState({
      message: "인증코드를 보냈어요. 메일함을 확인해 주세요.",
      tone: "success",
    });
  };

  // 6자리 코드 검증 → 인증 완료 + 세션 발급. 같은 화면에 머무름.
  const verifyCodeWithValue = async (codeValue) => {
    setCodeError("");
    if (!isSupabaseConfigured || !supabase) return;

    const normalizedCode = normalizeVerificationCode(codeValue);
    if (normalizedCode.length !== 6) return;
    if (verificationStatus === "verifying" || verificationStatus === "verified") return;

    setVerificationStatus("verifying");
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (error) {
      setVerificationStatus("sent");
      setCodeError(buildVerificationErrorMessage(error));
      return;
    }

    setVerificationStatus("verified");
    setVerifiedEmail(normalizedEmail);
    setCodeError("");
    setToastState({
      message: "이메일 인증이 완료되었어요. 나머지 정보를 입력해 주세요.",
      tone: "success",
    });
  };

  // 사용자가 코드 input에 paste/타이핑 → 6자리 채우면 자동 검증.
  const handleVerificationCodeChange = (event) => {
    const nextCode = normalizeVerificationCode(event.target.value);
    setVerificationCode(nextCode);
    setCodeError("");
    if (nextCode.length === 6 && verificationStatus !== "verifying" && verificationStatus !== "verified") {
      void verifyCodeWithValue(nextCode);
    }
  };

  // 이메일이 변경되면 인증 상태 리셋 (다른 이메일은 다시 받아야 함).
  useEffect(() => {
    if (verifiedEmail && normalizedEmail !== verifiedEmail) {
      setVerificationStatus("idle");
      setVerificationCode("");
      setVerifiedEmail("");
      setCodeError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedEmail]);

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

              {/* 이메일이 '사용 가능' 으로 확인된 후에만 인증코드 받기 버튼 노출.
                  - 인증 완료(verified) 후에는 row를 숨김 (인증코드 row 자체가 ✓ 표시).
                  - sending / sent / verifying 중에는 버튼 라벨로 상태 안내. */}
              {isEmailAvailable && verificationStatus !== "verified" ? (
                <div className="public-auth-field-row" style={{ marginTop: -8 }}>
                  <button
                    className="public-auth-button"
                    disabled={verificationStatus === "sending" || verificationStatus === "verifying" || resendCooldown > 0}
                    onClick={handleSendOtp}
                    style={{ width: "100%" }}
                    type="button"
                  >
                    {verificationStatus === "sending"
                      ? "인증코드 보내는 중..."
                      : resendCooldown > 0
                        ? `${resendCooldown}초 후 다시 받을 수 있어요`
                        : verificationStatus === "sent" || verificationStatus === "verifying"
                          ? "인증코드 다시 받기"
                          : "인증코드 받기"}
                  </button>
                </div>
              ) : null}

              {/* 인증코드 row: '인증코드 받기' 누른 후 노출. 6자리 자동 검증. */}
              {(verificationStatus === "sent" || verificationStatus === "verifying" || verificationStatus === "verified" || codeError) ? (
                <div className={`public-auth-field-row ${codeError ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-signup-verify-code">
                    인증코드 <span className="public-auth-field-row__required">*</span>
                  </label>
                  <div className="public-auth-field-row__control" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      autoComplete="one-time-code"
                      className="public-auth-field-row__input"
                      disabled={verificationStatus === "verified"}
                      id="public-signup-verify-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={handleVerificationCodeChange}
                      placeholder="이메일로 받은 6자리 숫자"
                      style={{ flex: 1, letterSpacing: verificationCode ? "0.3em" : "normal" }}
                      type="text"
                      value={verificationCode}
                    />
                    {verificationStatus === "verifying" ? (
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                    ) : verificationStatus === "verified" ? (
                      <span aria-hidden="true" style={{ color: "#059669", fontWeight: 800, fontSize: 18 }}>✓</span>
                    ) : null}
                  </div>
                  {codeError ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">{codeError}</p>
                  ) : verificationStatus === "verified" ? (
                    <p className="public-auth-inline-message public-auth-inline-message--success">
                      이메일 인증이 완료되었어요. 나머지 정보를 입력해 주세요.
                    </p>
                  ) : verificationStatus === "sent" ? (
                    <p className="public-auth-inline-message public-auth-inline-message--info">
                      이메일로 보낸 6자리 코드를 입력하면 자동으로 확인돼요.
                    </p>
                  ) : null}
                </div>
              ) : null}

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
                {/* 2026-05-25 정책: 필수 약관만 일괄 처리. 마케팅(선택)은 별도 체크박스. */}
                <label className="public-auth-agreement-box__all">
                  <span className="public-auth-checkmark">
                    <input checked={isAllAgreed} onChange={handleToggleRequiredAgreements} type="checkbox" />
                    <span aria-hidden="true" className="public-auth-checkmark__indicator">
                      ✓
                    </span>
                  </span>
                  <span>필수 약관 전체 동의</span>
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

              <button
                className="public-auth-button public-auth-button--primary"
                disabled={isSubmitting || cannotSignupBecauseLoggedIn}
                type="submit"
              >
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
