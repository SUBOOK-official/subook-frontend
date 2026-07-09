import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getPublicAuthSessionPersistence,
  isSupabaseConfigured,
  setPublicAuthSessionPersistence,
  supabase,
} from "@shared-supabase/publicSupabaseClient";
import PublicOAuthButtons from "../components/PublicOAuthButtons";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
} from "../components/icons";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { getPublicAccountAccessState } from "../lib/publicAuthAccess";
import { isValidEmailFormat, normalizeEmail } from "../lib/publicAuthFormUtils";
import {
  buildSocialOnlyLoginMessage,
  isSocialOnlyAccount,
} from "../lib/publicAuthProviders";
import { saveSignupSuccessState } from "../lib/publicSignupSuccessState";

function PublicLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const passwordInputRef = useRef(null);
  const { hasSession, isAdminAccount, isAuthenticated, signOut } =
    usePublicAuth();
  // from은 두 형태 모두 받는다:
  // - object: { pathname, search?, hash? } (publicMemberGate 등 권장 형식)
  // - string: "/cart" 같은 단순 경로 (legacy 호출자 호환 — 사라지면 안 됨)
  const fromState = location.state?.from;
  const nextPath =
    typeof fromState === "string" && fromState.startsWith("/")
      ? fromState
      : fromState?.pathname
        ? `${fromState.pathname}${fromState.search ?? ""}${fromState.hash ?? ""}`
        : "/";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() =>
    getPublicAuthSessionPersistence(),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    password: "",
  });
  const [pageNotice, setPageNotice] = useState(location.state?.notice ?? "");
  const [pageError, setPageError] = useState("");
  const [withdrawalRecoveryEmail, setWithdrawalRecoveryEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 이전 수북(식스샵) 회원 hint — 매칭 이메일이면 가입 유도 안내 표시
  const [legacyHint, setLegacyHint] = useState("");
  // 소셜 전용 계정 hint — 카카오/구글로만 가입한 이메일이 비밀번호 로그인을 시도한 경우
  const [socialOnlyHint, setSocialOnlyHint] = useState("");

  const handlePasswordKeyEvent = (event) => {
    if (typeof event.getModifierState === "function") {
      setIsCapsLockOn(event.getModifierState("CapsLock"));
    }
  };

  const buildWithdrawalRecoveryMailto = (emailAddress) => {
    const subject = encodeURIComponent("탈퇴 철회 요청");
    const body = encodeURIComponent(
      `안녕하세요, 수북 운영팀.\n\n탈퇴 처리 중인 계정을 다시 살리고 싶어 요청드립니다.\n\n가입 이메일: ${emailAddress}\n\n감사합니다.`,
    );
    return `mailto:subook2025@gmail.com?subject=${subject}&body=${body}`;
  };

  const redirectToVerification = (emailAddress, notice) => {
    const verificationState = {
      email: normalizeEmail(emailAddress),
      requiresEmailConfirmation: true,
      notice,
    };

    saveSignupSuccessState(verificationState);
    // 2026-05-19: verification UI는 PublicSignupPage 안으로 통합됨.
    // 인증 진행 중 사용자가 로그인 시도 시 회원가입 페이지의 verifying 모드로 직행.
    navigate("/signup", {
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
    setWithdrawalRecoveryEmail("");
    setSocialOnlyHint("");
    setFieldErrors((currentValue) => ({
      ...currentValue,
      email: "",
    }));
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    setPageError("");
    setWithdrawalRecoveryEmail("");
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
    setSocialOnlyHint("");

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
        redirectToVerification(
          normalized,
          "이메일 인증코드를 입력하면 회원가입을 완료할 수 있어요.",
        );
        return;
      }

      if (rawMessage.includes("invalid login credentials")) {
        // 소셜 전용 계정(비밀번호 없음) 확인 — RPC는 provider 목록만 반환 (PII 노출 X).
        // 카카오/구글로만 가입한 이메일이면 "비밀번호 불일치" 대신 가입 수단을 안내한다.
        let handledAsSocialOnly = false;
        try {
          const { data: providerData } = await supabase.rpc(
            "get_member_auth_providers",
            { p_email: normalized },
          );
          if (isSocialOnlyAccount(providerData)) {
            setSocialOnlyHint(buildSocialOnlyLoginMessage(providerData));
            handledAsSocialOnly = true;
          }
        } catch {
          /* RPC 실패는 무시 — 아래 일반 안내로 진행 */
        }

        if (!handledAsSocialOnly) {
          setFieldErrors((currentValue) => ({
            ...currentValue,
            password: "이메일 또는 비밀번호가 일치하지 않습니다.",
          }));

          // 이전 수북(식스샵 버전) 회원 안내 — 같은 이메일이면 친절히 가입 유도.
          // RPC는 boolean만 반환 (PII 노출 X).
          try {
            const { data: isLegacy } = await supabase.rpc(
              "is_legacy_sixshop_email",
              { p_email: normalized },
            );
            if (isLegacy) {
              setLegacyHint(normalized);
            }
          } catch {
            /* RPC 실패는 무시 — 일반 안내만 노출 */
          }
        }
      } else {
        setPageError(
          loginError.message ||
            "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
        );
      }

      setIsSubmitting(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessState = await getPublicAccountAccessState(
      sessionData.session?.user ?? null,
    );

    if (accessState.accountRole === "admin") {
      await supabase.auth.signOut();
      setPageError(
        "관리자 계정은 공개 사용자 페이지에서 로그인할 수 없습니다. 관리자 페이지에서 로그인해주세요.",
      );
      setIsSubmitting(false);
      return;
    }

    if (
      accessState.accountRole === "withdrawal_pending" ||
      accessState.accountRole === "withdrawn"
    ) {
      await supabase.auth.signOut();
      setWithdrawalRecoveryEmail(normalized);
      setPageError(
        "회원탈퇴 처리 중인 계정입니다. 복구가 필요하면 아래 안내를 통해 탈퇴 철회를 요청해 주세요.",
      );
      setIsSubmitting(false);
      return;
    }

    if (accessState.accountRole !== "member") {
      await supabase.auth.signOut();
      setPageError(
        "회원 계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
      setIsSubmitting(false);
      return;
    }

    if (!accessState.profile?.email_verified_at) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      redirectToVerification(
        normalized,
        "이메일 인증코드를 먼저 입력해주세요.",
      );
      return;
    }

    setIsSubmitting(false);
    navigate(nextPath, { replace: true });
  };

  return (
    <main className="public-auth-route">
      <div className="public-auth-shell">
        <section
          aria-labelledby="public-login-heading"
          className="public-auth-card public-auth-card--login"
        >
          <div className="public-auth-brand-lockup">
            <Link className="public-auth-brand" to="/">
              SUBOOK
            </Link>
            <p className="public-auth-brand-lockup__tagline">
              수능을 위한 가장 똑똑한 선택
            </p>
          </div>

          <div className="public-auth-card__body">
            <div className="public-auth-card__heading">
              <h1 className="public-auth-card__title" id="public-login-heading">
                로그인
              </h1>
            </div>

            {hasSession && isAdminAccount ? (
              <div className="public-auth-alert public-auth-alert--info public-auth-alert--action">
                <span>
                  관리자 세션이 연결되어 있습니다. 공개 사용자 페이지에는 회원
                  계정만 로그인할 수 있어요.
                </span>
                <button
                  className="public-auth-inline-button"
                  onClick={handleClearSession}
                  type="button"
                >
                  현재 세션 로그아웃
                </button>
              </div>
            ) : null}

            {pageNotice ? (
              <div className="public-auth-alert public-auth-alert--success">
                {pageNotice}
              </div>
            ) : null}
            {pageError ? (
              <div className="public-auth-alert public-auth-alert--error">
                <p>{pageError}</p>
                {withdrawalRecoveryEmail ? (
                  <div className="public-auth-alert__actions">
                    <a
                      className="public-auth-inline-button public-auth-inline-button--cta"
                      href={buildWithdrawalRecoveryMailto(
                        withdrawalRecoveryEmail,
                      )}
                    >
                      탈퇴 철회 요청하기
                    </a>
                    <span className="public-auth-alert__hint">
                      또는{" "}
                      <a href="mailto:subook2025@gmail.com">
                        subook2025@gmail.com
                      </a>{" "}
                      으로 직접 메일 주세요.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <PublicOAuthButtons
              contextLabel="로그인"
              dividerLabel="또는 이메일로 계속"
              dividerPosition="bottom"
              placement="top"
              redirectTo={`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`}
            />

            <form
              className="public-auth-form-card"
              noValidate
              onSubmit={handleSubmit}
            >
              <div
                className={`public-auth-field-row ${fieldErrors.email ? "is-error" : ""}`}
              >
                <label
                  className="public-auth-field-row__label"
                  htmlFor="public-login-email"
                >
                  이메일
                </label>
                <div className="public-auth-field-row__control">
                  <input
                    autoComplete="email"
                    className="public-auth-field-row__input"
                    id="public-login-email"
                    onChange={handleEmailChange}
                    onKeyDown={(event) => {
                      // IME composition 중 Enter는 후보 확정으로 사용되므로 무시.
                      if (
                        event.nativeEvent?.isComposing ||
                        event.keyCode === 229
                      ) {
                        return;
                      }
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
                  <p className="public-auth-inline-message public-auth-inline-message--error">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div
                className={`public-auth-field-row ${fieldErrors.password ? "is-error" : ""}`}
              >
                <label
                  className="public-auth-field-row__label"
                  htmlFor="public-login-password"
                >
                  비밀번호
                </label>
                <div className="public-auth-field-row__control public-auth-field-row__control--with-action">
                  <input
                    autoComplete="current-password"
                    className="public-auth-field-row__input"
                    id="public-login-password"
                    onBlur={() => setIsCapsLockOn(false)}
                    onChange={handlePasswordChange}
                    onKeyDown={handlePasswordKeyEvent}
                    onKeyUp={handlePasswordKeyEvent}
                    placeholder="비밀번호를 입력해주세요"
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={
                      showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                    }
                    className="public-auth-field-row__toggle public-auth-field-row__toggle--icon"
                    onClick={() =>
                      setShowPassword((currentValue) => !currentValue)
                    }
                    type="button"
                  >
                    <span aria-hidden="true">
                      {showPassword ? (
                        <EyeOffIcon size={18} />
                      ) : (
                        <EyeIcon size={18} />
                      )}
                    </span>
                    <span className="public-auth-sr-only">
                      {showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    </span>
                  </button>
                </div>
                {isCapsLockOn ? (
                  <p
                    className="public-auth-inline-message public-auth-inline-message--warning"
                    role="status"
                    aria-live="polite"
                  >
                    <AlertTriangleIcon size={13} /> Caps Lock이 켜져 있습니다.
                  </p>
                ) : null}
                {fieldErrors.password ? (
                  <p className="public-auth-inline-message public-auth-inline-message--error">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              {socialOnlyHint ? (
                <div
                  className="public-auth-alert public-auth-alert--info"
                  role="status"
                >
                  <p>{socialOnlyHint}</p>
                </div>
              ) : null}

              {legacyHint ? (
                <div className="public-auth-alert public-auth-alert--info">
                  <p>기존 수북 회원이시네요! </p>
                  <p>
                    <strong>
                      사이트 정책 변경에 따라, 7월 11일 이전 가입 회원은
                      비밀번호 재설정이 필요합니다.
                    </strong>
                  </p>
                  <p>
                    아래 버튼을 눌러 비밀번호를 재설정하시면, 기존에 등록된
                    배송지와 연락처 정보가 자동으로 연동됩니다.
                  </p>
                  <div className="public-auth-alert__actions">
                    <Link
                      className="public-auth-inline-button public-auth-inline-button--cta"
                      state={{ prefillEmail: legacyHint }}
                      to="/forgot-password"
                    >
                      비밀번호 재설정하기 <ArrowRightIcon size={13} />
                    </Link>
                  </div>
                </div>
              ) : null}

              <label className="public-auth-check">
                <input
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <span>로그인 상태 유지</span>
              </label>

              <button
                className="public-auth-button public-auth-button--primary"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="public-auth-spinner public-auth-spinner--button"
                    />
                    <span>로그인 중...</span>
                  </>
                ) : (
                  "로그인"
                )}
              </button>
            </form>

            <div className="public-auth-link-row">
              <Link
                className="public-auth-link-row__link"
                to="/forgot-password"
              >
                비밀번호 찾기
              </Link>
              <span
                aria-hidden="true"
                className="public-auth-link-row__separator"
              />
              <Link className="public-auth-link-row__link" to="/signup">
                회원가입
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default PublicLoginPage;
