import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAgreementDialog from "../components/PublicAgreementDialog";
import brandLogoImage from "../assets/brand/logo-horizontal.png";
import { CheckIcon } from "../components/icons";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";
import { formatPhoneNumber, hasRequiredPasswordConditions, hasValidPhoneNumber } from "../lib/publicAuthFormUtils";

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

function pickInitialName(user) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};

  // 카카오/구글 OAuth가 제공하는 후보 필드들. 우선순위 높은 순서.
  const candidates = [
    metadata.name,
    metadata.full_name,
    metadata.user_name,
    metadata.preferred_username,
    metadata.nickname,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function pickInitialPhone(user) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};

  // 카카오는 phone_number(또는 user.phone), 구글은 일반적으로 비제공.
  const candidates = [metadata.phone_number, metadata.phone, user.phone];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return formatPhoneNumber(candidate.trim());
    }
  }

  return "";
}

function PublicOAuthConsentPage() {
  usePageMeta({
    title: "회원가입 마무리",
    description: "수북 서비스 이용을 위해 약관 동의 및 기본 정보를 입력해 주세요.",
    noindex: true,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const {
    isLoading,
    hasSession,
    needsSignupCompletion,
    isAuthenticated,
    isOAuthUser,
    refreshProfile,
    signOut,
    user,
    profile,
  } = usePublicAuth();
  // OTP(email provider) 가입 미완료자는 비번도 NULL이므로 같은 페이지에서 받는다.
  // OAuth(카카오/구글)는 비번 칸 미노출.
  const needsPasswordSetup = !isOAuthUser;

  const search = new URLSearchParams(location.search);
  const next = search.get("next") || "/";

  const [agreements, setAgreements] = useState({ terms: false, privacy: false, marketing: false });
  const [activeAgreementKey, setActiveAgreementKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [formValues, setFormValues] = useState({ name: "", phone: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({ name: "", phone: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  // 카카오/구글 메타데이터에서 이름·연락처 prefill (가능한 경우).
  const initialName = useMemo(() => pickInitialName(user) || profile?.name || "", [user, profile]);
  const initialPhone = useMemo(() => pickInitialPhone(user) || profile?.phone || "", [user, profile]);

  useEffect(() => {
    setFormValues((current) => ({
      ...current, // password 등 다른 필드 보존 (누락 시 OTP 가입자의 비번 input이 uncontrolled로 깨짐)
      name: current.name || initialName,
      phone: current.phone || initialPhone,
    }));
  }, [initialName, initialPhone]);

  const hasRequiredAgreements = agreementItems
    .filter((item) => item.required)
    .every((item) => agreements[item.key]);
  // "전체 동의" 체크박스 표시 — 마케팅(선택) 포함 모두 동의됐을 때만 체크.
  // 사업 정책: 마케팅 수신 동의율 유도. 라벨에 "(마케팅 정보 수신 포함)" 명시로 인지 보장.
  const isAllAgreed = agreements.terms && agreements.privacy && agreements.marketing;

  // 이미 인증 완료된 사용자는 next로 즉시 이동
  useEffect(() => {
    if (isLoading) return;
    if (!hasSession) {
      navigate("/login", { replace: true });
      return;
    }
    if (isAuthenticated && !needsSignupCompletion) {
      navigate(next, { replace: true });
    }
  }, [isLoading, hasSession, isAuthenticated, needsSignupCompletion, next, navigate]);

  const handleToggleAgreement = (key) => {
    setAgreements((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrorMessage("");
  };

  const handleToggleRequiredAgreements = () => {
    const nextValue = !isAllAgreed;
    setAgreements((prev) => ({
      ...prev,
      terms: nextValue,
      privacy: nextValue,
      marketing: nextValue,
    }));
    setErrorMessage("");
  };

  const handleChangeValue = (key) => (event) => {
    const rawValue = event.target.value;
    const nextValue = key === "phone" ? formatPhoneNumber(rawValue) : rawValue;
    setFormValues((current) => ({ ...current, [key]: nextValue }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setErrorMessage("");
  };

  const activeAgreement = agreementItems.find((item) => item.key === activeAgreementKey) ?? null;

  const validateFields = () => {
    const nextErrors = { name: "", phone: "", password: "" };

    if (!formValues.name.trim()) {
      nextErrors.name = "필수 항목입니다.";
    }

    if (!formValues.phone.trim()) {
      nextErrors.phone = "필수 항목입니다.";
    } else if (!hasValidPhoneNumber(formValues.phone)) {
      nextErrors.phone = "연락처 형식을 확인해 주세요.";
    }

    if (needsPasswordSetup) {
      if (!formValues.password) {
        nextErrors.password = "비밀번호를 설정해 주세요.";
      } else if (!hasRequiredPasswordConditions(formValues.password)) {
        nextErrors.password = "영문·숫자 포함 8자 이상으로 입력해 주세요.";
      }
    }

    setFieldErrors(nextErrors);
    return !nextErrors.name && !nextErrors.phone && !nextErrors.password;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!hasRequiredAgreements) {
      setErrorMessage("필수 약관에 모두 동의해 주세요.");
      return;
    }
    if (!validateFields()) {
      return;
    }
    if (!supabase) {
      setErrorMessage("일시적으로 동의 처리가 어렵습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 이메일 provider 사용자(OTP 가입 미완료자)면 비번부터 설정. 실패 시 RPC 호출 안 함.
      if (needsPasswordSetup) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: formValues.password,
        });
        if (passwordError) {
          setErrorMessage(passwordError.message || "비밀번호 설정에 실패했어요. 잠시 후 다시 시도해 주세요.");
          setIsSubmitting(false);
          return;
        }
      }

      // complete_oauth_signup RPC: OAuth/email 가입자 모두 사용. 약관 + 이름 + 연락처 + 마케팅 동의 저장.
      const { error } = await supabase.rpc("complete_oauth_signup", {
        p_marketing_opt_in: agreements.marketing,
        p_name: formValues.name.trim(),
        p_phone: formValues.phone.trim(),
      });

      if (error) {
        const rawCode = error.code ?? "";
        const rawMessage = error.message?.toLowerCase?.() ?? "";
        const isSignatureMissing =
          rawCode === "PGRST202" ||
          rawMessage.includes("p_name") ||
          rawMessage.includes("p_phone") ||
          rawMessage.includes("function complete_oauth_signup");

        setErrorMessage(
          isSignatureMissing
            ? "약관 동의 처리가 일시적으로 중단되었습니다. 잠시 후 다시 시도해 주세요. (시스템 업데이트 중)"
            : `동의 처리에 실패했어요. ${error.message ?? ""}`,
        );
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

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  if (isLoading) {
    return (
      <main className="public-auth-route">
        <div className="public-auth-shell">
          <section className="public-auth-card">
            <div className="public-auth-card__body" style={{ textAlign: "center", padding: "48px 0" }}>
              <span className="public-auth-spinner" aria-hidden="true" />
              <p>로그인 정보를 확인하는 중...</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!hasSession) {
    return <Navigate replace to="/login" />;
  }

  return (
    <>
      <main className="public-auth-route">
        <div className="public-auth-shell">
          <section aria-labelledby="public-oauth-consent-heading" className="public-auth-card public-auth-card--signup">
            <div className="public-auth-brand-lockup">
              <Link className="public-auth-brand" to="/">
                <img alt="수북 SUBOOK" className="public-auth-brand__logo" src={brandLogoImage} />
              </Link>
              <p className="public-auth-brand-lockup__tagline">수능 교재, 똑똑하게 거래</p>
            </div>

            <div className="public-auth-card__body">
              <div className="public-auth-card__heading">
                <h1 className="public-auth-card__title" id="public-oauth-consent-heading">
                  거의 다 왔어요!
                </h1>
                <p className="public-auth-card__description">
                  서비스 이용을 위해 기본 정보와 약관에 동의해 주세요.
                  <br />
                  한 번만 입력하시면 다음부터는 바로 이용하실 수 있어요.
                </p>
              </div>

              {errorMessage ? (
                <div className="public-auth-alert public-auth-alert--error">{errorMessage}</div>
              ) : null}

              <form className="public-auth-form-card" noValidate onSubmit={handleSubmit}>
                <div className={`public-auth-field-row ${fieldErrors.name ? "is-error" : ""}`}>
                  <label className="public-auth-field-row__label" htmlFor="public-oauth-consent-name">
                    이름 <span className="public-auth-field-row__required">*</span>
                  </label>
                  <div className="public-auth-field-row__control">
                    <input
                      autoComplete="name"
                      className="public-auth-field-row__input"
                      id="public-oauth-consent-name"
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
                  <label className="public-auth-field-row__label" htmlFor="public-oauth-consent-phone">
                    연락처 <span className="public-auth-field-row__required">*</span>
                  </label>
                  <div className="public-auth-field-row__control">
                    <input
                      autoComplete="tel"
                      className="public-auth-field-row__input"
                      id="public-oauth-consent-phone"
                      inputMode="numeric"
                      onChange={handleChangeValue("phone")}
                      placeholder="010-1234-5678"
                      type="tel"
                      value={formValues.phone}
                    />
                  </div>
                  {fieldErrors.phone ? (
                    <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.phone}</p>
                  ) : (
                    <p className="public-auth-inline-message public-auth-inline-message--info">
                      픽업·배송·정산 안내 SMS 발송에 사용돼요.
                    </p>
                  )}
                </div>

                {/* 이메일 가입자(OTP 인증만 끝낸 미완료자)만 비번 입력. OAuth 사용자는 미노출. */}
                {needsPasswordSetup ? (
                  <div className={`public-auth-field-row ${fieldErrors.password ? "is-error" : ""}`}>
                    <label className="public-auth-field-row__label" htmlFor="public-oauth-consent-password">
                      비밀번호 <span className="public-auth-field-row__required">*</span>
                    </label>
                    <div className="public-auth-field-row__control public-auth-field-row__control--with-action">
                      <input
                        autoComplete="new-password"
                        className="public-auth-field-row__input"
                        id="public-oauth-consent-password"
                        onChange={handleChangeValue("password")}
                        placeholder="영문·숫자 포함 8자 이상"
                        type={showPassword ? "text" : "password"}
                        value={formValues.password}
                      />
                      <button
                        aria-label={showPassword ? "비밀번호 가리기" : "비밀번호 보기"}
                        className="public-auth-field-row__action"
                        onClick={() => setShowPassword((v) => !v)}
                        type="button"
                      >
                        {showPassword ? "숨기기" : "보기"}
                      </button>
                    </div>
                    {fieldErrors.password ? (
                      <p className="public-auth-inline-message public-auth-inline-message--error">{fieldErrors.password}</p>
                    ) : (
                      <p className="public-auth-inline-message public-auth-inline-message--info">
                        다음에 로그인할 때 사용할 비밀번호예요.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="public-auth-agreement-box">
                  <label className="public-auth-agreement-box__all">
                    <span className="public-auth-checkmark">
                      <input
                        checked={isAllAgreed}
                        onChange={handleToggleRequiredAgreements}
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="public-auth-checkmark__indicator">
                        <CheckIcon size={14} />
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
                              <input
                                checked={agreements[item.key]}
                                onChange={() => handleToggleAgreement(item.key)}
                                type="checkbox"
                              />
                              <span aria-hidden="true" className="public-auth-checkmark__indicator">
                                <CheckIcon size={14} />
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
                              <input
                                checked={agreements[item.key]}
                                onChange={() => handleToggleAgreement(item.key)}
                                type="checkbox"
                              />
                              <span aria-hidden="true" className="public-auth-checkmark__indicator">
                                <CheckIcon size={14} />
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

                <button
                  className="public-auth-button public-auth-button--primary"
                  disabled={isSubmitting || !hasRequiredAgreements}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                      <span>처리 중...</span>
                    </>
                  ) : (
                    "동의하고 시작하기"
                  )}
                </button>

                <button
                  className="public-auth-button public-auth-button--ghost"
                  disabled={isSubmitting}
                  onClick={handleCancel}
                  type="button"
                >
                  취소하고 나가기
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>

      <PublicAgreementDialog
        documentItem={activeAgreement}
        onClose={() => setActiveAgreementKey("")}
        open={Boolean(activeAgreement)}
      />

      {showCancelConfirm ? (
        <div
          className="public-sheet-backdrop"
          onClick={() => setShowCancelConfirm(false)}
          role="presentation"
        >
          <section
            aria-labelledby="public-oauth-consent-cancel-title"
            aria-modal="true"
            className="public-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="public-sheet__drag-handle" />
            <div className="public-sheet__header">
              <div>
                <p className="public-sheet__eyebrow">[확인]</p>
                <h2 className="public-sheet__title" id="public-oauth-consent-cancel-title">
                  동의를 취소할까요?
                </h2>
              </div>
              <button
                aria-label="닫기"
                className="public-sheet__close"
                onClick={() => setShowCancelConfirm(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="public-sheet__body">
              <p className="public-sheet__paragraph">
                동의를 취소하면 로그아웃 처리되며, 약관 동의 없이는 수북 서비스 이용이 어려워요.
                다시 로그인하면 이 화면으로 돌아옵니다.
              </p>
            </div>
            <div className="public-sheet__footer">
              <button
                className="public-auth-button public-auth-button--secondary"
                onClick={() => setShowCancelConfirm(false)}
                type="button"
              >
                돌아가기
              </button>
              <button
                className="public-auth-button public-auth-button--primary"
                onClick={handleConfirmCancel}
                type="button"
              >
                동의 취소하고 로그아웃
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default PublicOAuthConsentPage;
