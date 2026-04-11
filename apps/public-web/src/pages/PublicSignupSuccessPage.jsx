import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicToastMessage from "../components/PublicToastMessage";
import { clearSignupSuccessState, loadSignupSuccessState, saveSignupSuccessState } from "../lib/publicSignupSuccessState";

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

function buildVerifiedSuccessState(baseState) {
  return {
    ...baseState,
    isVerified: true,
    notice: "이메일 인증이 완료되었어요. 이제 수북을 바로 이용할 수 있어요.",
    requiresEmailConfirmation: false,
  };
}

function PublicSignupSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [toastState, setToastState] = useState({
    message: "",
    tone: "info",
  });
  const persistedState = useMemo(() => loadSignupSuccessState(), []);
  const successState = location.state ?? persistedState ?? {};
  const email = successState.email ?? "";
  const requiresEmailConfirmation = successState.requiresEmailConfirmation !== false;
  const isVerified = Boolean(successState.isVerified);
  const initialNotice = successState.notice ?? "";

  const handleMoveHome = () => {
    clearSignupSuccessState();
    navigate("/", { replace: true });
  };

  const handleVerifyCode = async (event) => {
    event.preventDefault();
    setCodeError("");
    setPageNotice("");

    if (!email) {
      setToastState({
        message: "인증할 이메일 정보가 없습니다. 다시 회원가입을 진행해주세요.",
        tone: "error",
      });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setToastState({
        message: "인증코드 확인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
        tone: "error",
      });
      return;
    }

    const normalizedCode = normalizeVerificationCode(verificationCode);

    if (normalizedCode.length !== 6) {
      setCodeError("숫자 6자리 인증코드를 입력해주세요.");
      return;
    }

    setIsVerifying(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
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

    const nextState = buildVerifiedSuccessState(successState);
    saveSignupSuccessState(nextState);
    setIsVerifying(false);
    navigate("/signup-success", {
      replace: true,
      state: nextState,
    });
  };

  const handleResendEmail = async () => {
    if (!email || !isSupabaseConfigured || !supabase) {
      setToastState({
        message: "인증코드를 다시 보낼 수 없습니다. 다시 회원가입을 진행해주세요.",
        tone: "error",
      });
      return;
    }

    setIsResending(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setToastState({
        message: error.message || "인증코드 재발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        tone: "error",
      });
      setIsResending(false);
      return;
    }

    setVerificationCode("");
    setCodeError("");
    setPageNotice("인증코드를 다시 보내드렸어요. 메일함과 스팸함을 함께 확인해주세요.");
    setToastState({
      message: "인증코드를 다시 보내드렸어요. 메일함을 확인해주세요.",
      tone: "success",
    });
    setIsResending(false);
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

      <main className="public-auth-route public-auth-route--success">
        <div className="public-auth-shell">
          <section aria-labelledby="public-signup-success-heading" className="public-auth-card public-auth-card--success">
            <div className="public-auth-success-badge" aria-hidden="true">
              {isVerified ? "🎉" : "✦"}
            </div>

            <div className="public-auth-card__heading">
              <h1 className="public-auth-card__title" id="public-signup-success-heading">
                {isVerified ? "환영합니다!" : "환영합니다"}
              </h1>
              <p className="public-auth-success__headline">
                {isVerified ? "회원가입이 완료되었어요" : "회원가입이 거의 완료되었어요"}
              </p>
              <p className="public-auth-card__description">
                {isVerified
                  ? "이제 수북에서 필요한 교재를 둘러보고 거래를 시작할 수 있어요."
                  : requiresEmailConfirmation && email
                    ? `${email}로 6자리 인증코드를 보내드렸어요. 코드를 입력하면 회원가입 인증이 바로 완료됩니다.`
                    : "이제 수북에서 필요한 교재를 둘러보고 거래를 시작할 수 있어요."}
              </p>
            </div>

            {!isVerified && requiresEmailConfirmation && email ? (
              <div className="public-auth-success__body">
                {initialNotice || pageNotice ? (
                  <div className="public-auth-alert public-auth-alert--info">{pageNotice || initialNotice}</div>
                ) : null}

                <form className="public-auth-success__code-form" noValidate onSubmit={handleVerifyCode}>
                  <div className={`public-auth-field-row ${codeError ? "is-error" : ""}`}>
                    <label className="public-auth-field-row__label" htmlFor="public-signup-verification-code">
                      이메일 인증코드
                    </label>
                    <div className="public-auth-field-row__control">
                      <input
                        autoComplete="one-time-code"
                        className="public-auth-field-row__input public-auth-success__code-input"
                        id="public-signup-verification-code"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => {
                          setVerificationCode(normalizeVerificationCode(event.target.value));
                          setCodeError("");
                          setPageNotice("");
                        }}
                        placeholder="6자리 코드"
                        type="text"
                        value={verificationCode}
                      />
                    </div>
                    {codeError ? (
                      <p className="public-auth-inline-message public-auth-inline-message--error">{codeError}</p>
                    ) : (
                      <p className="public-auth-inline-message public-auth-inline-message--info">
                        메일로 받은 6자리 숫자 코드를 입력해주세요. 인증이 완료되면 회원가입이 최종 완료됩니다.
                      </p>
                    )}
                  </div>

                  <button className="public-auth-button public-auth-button--primary" disabled={isVerifying} type="submit">
                    {isVerifying ? (
                      <>
                        <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                        <span>인증 확인 중...</span>
                      </>
                    ) : (
                      "인증 완료"
                    )}
                  </button>
                </form>
              </div>
            ) : null}

            <div className="public-auth-success__actions">
              {!isVerified && requiresEmailConfirmation && email ? (
                <button
                  className="public-auth-button public-auth-button--ghost"
                  disabled={isResending}
                  onClick={handleResendEmail}
                  type="button"
                >
                  {isResending ? (
                    <>
                      <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                      <span>인증코드 재발송 중...</span>
                    </>
                  ) : (
                    "인증코드 다시 보내기"
                  )}
                </button>
              ) : null}

              <button
                className={`public-auth-button ${isVerified ? "public-auth-button--primary" : "public-auth-button--secondary"}`}
                onClick={handleMoveHome}
                type="button"
              >
                홈으로 이동
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default PublicSignupSuccessPage;
