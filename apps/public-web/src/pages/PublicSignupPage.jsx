import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import { usePublicAuth } from "../contexts/PublicAuthContext";

const agreementItems = [
  { key: "age", label: "만 14세 이상입니다.", required: true, expandable: true },
  { key: "terms", label: "이용약관 동의", required: true, expandable: true },
  { key: "privacy", label: "개인정보 수집 및 이용 동의", required: true, expandable: true },
  { key: "marketing", label: "이메일 및 SNS 마케팅 정보 수신 동의", required: false, expandable: false },
];

const requiredAgreementKeys = agreementItems
  .filter((item) => item.required)
  .map((item) => item.key);

function hasValidPasswordRule(password) {
  return /[A-Za-z]/.test(password) && password.length >= 6 && password.length <= 20;
}

function SignupAgreementRow({ checked, expandable, item, onToggle }) {
  return (
    <div className="public-signup-agreements__item">
      <label className="public-signup-agreements__label">
        <span className="public-signup-agreements__checkbox">
          <input checked={checked} onChange={() => onToggle(item.key)} type="checkbox" />
          <span aria-hidden="true" className="public-signup-agreements__indicator">
            ✓
          </span>
        </span>

        <span className="public-signup-agreements__copy">
          <span>{item.label}</span>
          <span className={`public-signup-agreements__tag ${item.required ? "is-required" : "is-optional"}`}>
            {item.required ? "(필수)" : "(선택)"}
          </span>
        </span>
      </label>

      {expandable ? (
        <button
          aria-label={`${item.label} 상세 보기`}
          className="public-signup-agreements__caret"
          type="button"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}

function PublicSignupPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = usePublicAuth();

  const [formValues, setFormValues] = useState({
    email: "",
    name: "",
    password: "",
    passwordConfirm: "",
    phone: "",
  });
  const [agreements, setAgreements] = useState({
    age: false,
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasPasswordRule = useMemo(() => {
    return hasValidPasswordRule(formValues.password.trim());
  }, [formValues.password]);

  const isPasswordMatch = useMemo(() => {
    return (
      formValues.passwordConfirm.length > 0 && formValues.password === formValues.passwordConfirm
    );
  }, [formValues.password, formValues.passwordConfirm]);

  const hasRequiredAgreements = requiredAgreementKeys.every((key) => agreements[key]);
  const isAllAgreed = agreementItems.every((item) => agreements[item.key]);
  const canSubmit =
    formValues.email.trim() &&
    formValues.name.trim() &&
    formValues.phone.trim() &&
    hasPasswordRule &&
    isPasswordMatch &&
    hasRequiredAgreements;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      setError("회원가입 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!canSubmit) {
      setError("필수 정보를 모두 입력하고 약관 동의까지 완료해 주세요.");
      return;
    }

    setIsSubmitting(true);

    const { data, error: signupError } = await supabase.auth.signUp({
      email: formValues.email.trim(),
      password: formValues.password,
      options: {
        data: {
          name: formValues.name.trim(),
          phone: formValues.phone.trim(),
          marketing_opt_in: agreements.marketing,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (signupError) {
      const rawMessage = signupError.message?.toLowerCase() ?? "";

      if (rawMessage.includes("already registered")) {
        setError("이미 가입된 이메일입니다. 로그인 또는 비밀번호 찾기를 이용해 주세요.");
      } else {
        setError(signupError.message || "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    navigate("/signup-success", {
      replace: true,
      state: {
        email: formValues.email.trim(),
        name: formValues.name.trim(),
        requiresEmailConfirmation: !data.session,
      },
    });
  };

  const handleChangeValue = (key) => (event) => {
    const nextValue = event.target.value;
    setFormValues((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
  };

  const handleToggleAgreement = (key) => {
    setAgreements((currentValue) => ({
      ...currentValue,
      [key]: !currentValue[key],
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
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-signup-page">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-signup-heading" className="public-auth-main public-auth-main--signup">
            <div className="public-auth-panel public-auth-panel--signup">
              <div className="public-auth-panel__header">
                <h1 className="public-auth-panel__title" id="public-signup-heading">
                  회원가입하기
                </h1>
                <p className="public-auth-panel__description">
                  기본 정보를 입력하고 약관에 동의하면 바로 회원가입을 완료할 수 있습니다.
                </p>
              </div>

              <div className="public-auth-panel__body">
                {isAuthenticated ? (
                  <p className="public-auth-notice public-auth-notice--info">
                    이미 로그인된 상태입니다. 새 회원가입을 테스트하려면 상단의 로그아웃을 먼저 눌러 주세요.
                  </p>
                ) : null}
                {error ? <p className="public-auth-notice public-auth-notice--error">{error}</p> : null}

                <form className="public-signup-form" onSubmit={handleSubmit}>
                  <label className="public-signup-field">
                    <span className="public-signup-field__label">이메일</span>
                    <span className="public-auth-field">
                      <input
                        autoComplete="email"
                        className="public-auth-input"
                        onChange={handleChangeValue("email")}
                        placeholder="이메일을 입력해 주세요."
                        type="email"
                        value={formValues.email}
                      />
                    </span>
                  </label>

                  <label className="public-signup-field">
                    <span className="public-signup-field__label">이름</span>
                    <span className="public-auth-field">
                      <input
                        autoComplete="name"
                        className="public-auth-input"
                        onChange={handleChangeValue("name")}
                        placeholder="이름을 입력해 주세요."
                        type="text"
                        value={formValues.name}
                      />
                    </span>
                  </label>

                  <label className="public-signup-field">
                    <span className="public-signup-field__label">비밀번호</span>
                    <span className="public-auth-field">
                      <input
                        autoComplete="new-password"
                        className="public-auth-input"
                        onChange={handleChangeValue("password")}
                        placeholder="비밀번호를 입력해 주세요."
                        type="password"
                        value={formValues.password}
                      />
                    </span>
                    <span className="public-signup-field__hint">
                      <span
                        aria-hidden="true"
                        className={`public-signup-field__hint-dot ${hasPasswordRule ? "is-valid" : ""}`}
                      >
                        ✓
                      </span>
                      <span>영문 포함 6자 이상 20자 이내</span>
                    </span>
                  </label>

                  <label className="public-signup-field">
                    <span className="public-signup-field__label">비밀번호 확인</span>
                    <span className="public-auth-field">
                      <input
                        autoComplete="new-password"
                        className="public-auth-input"
                        onChange={handleChangeValue("passwordConfirm")}
                        placeholder="비밀번호를 한 번 더 입력해 주세요."
                        type="password"
                        value={formValues.passwordConfirm}
                      />
                    </span>
                    <span className="public-signup-field__hint">
                      <span
                        aria-hidden="true"
                        className={`public-signup-field__hint-dot ${isPasswordMatch ? "is-valid" : ""}`}
                      >
                        ✓
                      </span>
                      <span>비밀번호 일치</span>
                    </span>
                  </label>

                  <label className="public-signup-field">
                    <span className="public-signup-field__label">휴대폰 번호</span>
                    <span className="public-auth-field">
                      <input
                        autoComplete="tel"
                        className="public-auth-input"
                        onChange={handleChangeValue("phone")}
                        placeholder="휴대폰 번호를 입력해 주세요."
                        type="tel"
                        value={formValues.phone}
                      />
                    </span>
                  </label>

                  <div className="public-signup-agreements">
                    <label className="public-signup-agreements__all">
                      <span className="public-signup-agreements__checkbox">
                        <input checked={isAllAgreed} onChange={handleToggleAllAgreements} type="checkbox" />
                        <span aria-hidden="true" className="public-signup-agreements__indicator">
                          ✓
                        </span>
                      </span>
                      <span>전체 동의</span>
                    </label>

                    <div aria-hidden="true" className="public-signup-agreements__divider" />

                    <div className="public-signup-agreements__list">
                      {agreementItems.map((item) => (
                        <SignupAgreementRow
                          checked={agreements[item.key]}
                          expandable={item.expandable}
                          item={item}
                          key={item.key}
                          onToggle={handleToggleAgreement}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    className={`public-auth-button ${
                      canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"
                    }`}
                    disabled={!canSubmit || isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "가입 처리 중..." : "회원가입"}
                  </button>
                </form>

                <div className="public-auth-links">
                  <Link className="public-auth-text-link" to="/login">
                    로그인하기
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

export default PublicSignupPage;
