import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";

function buildResetLinkErrorMessage({ error, errorCode, errorDescription }) {
  const detailParts = [];

  if (error) {
    detailParts.push(error);
  }

  if (errorCode) {
    detailParts.push(errorCode);
  }

  const headline = detailParts.length
    ? `인증 링크 확인에 실패했습니다. (${detailParts.join(" / ")})`
    : "인증 링크 확인에 실패했습니다.";

  return errorDescription ? `${headline} ${errorDescription}` : headline;
}

function hasValidPasswordRule(password) {
  return /[A-Za-z]/.test(password) && password.length >= 6 && password.length <= 20;
}

function PublicResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("checking");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    password: "",
    passwordConfirm: "",
  });

  const urlInfo = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashString = (location.hash || "").startsWith("#")
      ? location.hash.slice(1)
      : location.hash || "";
    const hashParams = new URLSearchParams(hashString);

    return {
      type: hashParams.get("type") || searchParams.get("type") || "",
      code: searchParams.get("code") || "",
      accessToken: hashParams.get("access_token") || "",
      refreshToken: hashParams.get("refresh_token") || "",
      error: hashParams.get("error") || searchParams.get("error") || "",
      errorCode: hashParams.get("error_code") || searchParams.get("error_code") || "",
      errorDescription:
        hashParams.get("error_description") || searchParams.get("error_description") || "",
      hasAnyAuthParams: Boolean(
        hashParams.get("type") ||
          searchParams.get("type") ||
          searchParams.get("code") ||
          hashParams.get("access_token") ||
          hashParams.get("refresh_token") ||
          hashParams.get("error") ||
          searchParams.get("error"),
      ),
    };
  }, [location.hash, location.search]);

  const hasPasswordRule = hasValidPasswordRule(form.password);
  const isPasswordMatch =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  const canSubmit = phase === "ready" && hasPasswordRule && isPasswordMatch;

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setError("");
      setPhase("checking");

      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) {
          setError("비밀번호 재설정 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
          setPhase("error");
        }
        return;
      }

      if (urlInfo.error) {
        if (isMounted) {
          setError(
            buildResetLinkErrorMessage({
              error: urlInfo.error,
              errorCode: urlInfo.errorCode,
              errorDescription: urlInfo.errorDescription,
            }),
          );
          setPhase("error");
        }
        return;
      }

      const { data: initialSession } = await supabase.auth.getSession();

      if (!initialSession.session) {
        if (urlInfo.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(urlInfo.code);

          if (exchangeError) {
            if (isMounted) {
              setError("재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.");
              setPhase("error");
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
              setError("재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.");
              setPhase("error");
            }
            return;
          }
        }
      }

      const { data: sessionAfter } = await supabase.auth.getSession();

      if (!sessionAfter.session) {
        if (isMounted) {
          setError("인증 세션을 확인할 수 없습니다. 비밀번호 찾기 화면에서 다시 요청해 주세요.");
          setPhase("error");
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
    setForm((currentForm) => ({
      ...currentForm,
      [key]: nextValue,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      setError("비밀번호 재설정 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!hasPasswordRule) {
      setError("비밀번호는 영문을 포함한 6자 이상 20자 이하여야 합니다.");
      return;
    }

    if (!isPasswordMatch) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setPhase("saving");

    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });

    if (updateError) {
      setError(updateError.message || "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.");
      setPhase("ready");
      return;
    }

    await supabase.auth.signOut();
    navigate("/login", {
      replace: true,
      state: {
        notice: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.",
      },
    });
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-auth-page--recovery">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-reset-password-heading" className="public-auth-main">
            <div className="public-auth-panel public-auth-panel--recovery">
              <div className="public-auth-panel__header">
                <span className="public-auth-status-chip">
                  {phase === "checking" ? "인증 확인 중" : "비밀번호 재설정"}
                </span>
                <h1 className="public-auth-panel__title" id="public-reset-password-heading">
                  새 비밀번호를 설정해 주세요
                </h1>
                <p className="public-auth-panel__description">
                  이메일에서 열어본 재설정 링크를 확인한 뒤, 바로 사용할 새 비밀번호를 등록합니다.
                </p>
              </div>

              <div className="public-auth-panel__body">
                {error ? <p className="public-auth-notice public-auth-notice--error">{error}</p> : null}

                {phase === "checking" ? (
                  <div className="public-auth-support">
                    <p className="public-auth-support__title">잠시만 기다려 주세요</p>
                    <div className="public-auth-support__list">
                      <p className="public-auth-support__item">재설정 링크의 인증 상태를 확인하고 있습니다.</p>
                      <p className="public-auth-support__item">링크가 만료된 경우 비밀번호 찾기 화면에서 다시 요청해 주세요.</p>
                    </div>
                  </div>
                ) : null}

                {phase === "ready" || phase === "saving" ? (
                  <>
                    <form className="public-auth-form public-auth-form--recovery" onSubmit={handleSubmit}>
                      <label className="public-signup-field">
                        <span className="public-signup-field__label">새 비밀번호</span>
                        <span className="public-auth-field">
                          <input
                            autoComplete="new-password"
                            className="public-auth-input"
                            onChange={handleChange("password")}
                            placeholder="새 비밀번호를 입력해 주세요."
                            type="password"
                            value={form.password}
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
                        <span className="public-signup-field__label">새 비밀번호 확인</span>
                        <span className="public-auth-field">
                          <input
                            autoComplete="new-password"
                            className="public-auth-input"
                            onChange={handleChange("passwordConfirm")}
                            placeholder="같은 비밀번호를 한 번 더 입력해 주세요."
                            type="password"
                            value={form.passwordConfirm}
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

                      <button
                        className={`public-auth-button ${
                          canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"
                        }`}
                        disabled={!canSubmit || phase === "saving"}
                        type="submit"
                      >
                        {phase === "saving" ? "비밀번호 변경 중..." : "비밀번호 변경하기"}
                      </button>
                    </form>

                    <div className="public-auth-support">
                      <p className="public-auth-support__title">안내</p>
                      <div className="public-auth-support__list">
                        <p className="public-auth-support__item">설정이 끝나면 새 비밀번호로 다시 로그인하실 수 있습니다.</p>
                        <p className="public-auth-support__item">링크가 오래되었으면 비밀번호 찾기 화면에서 새 메일을 요청해 주세요.</p>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="public-auth-links">
                  <Link className="public-auth-text-link" to="/forgot-password">
                    비밀번호 찾기로 돌아가기
                  </Link>
                  <span aria-hidden="true" className="public-auth-links__separator" />
                  <Link className="public-auth-text-link" to="/login">
                    로그인으로 이동하기
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

export default PublicResetPasswordPage;
