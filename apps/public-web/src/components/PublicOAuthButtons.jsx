import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// TODO(ops): Supabase 대시보드에서 Google provider 활성 + Client ID/Secret 등록 필요.
//   (Project Settings → Authentication → Providers → Google) 등록 전까지는 버튼이 표시되더라도
//   클릭 시 buildOAuthFallbackMessage로 "아직 연결되지 않았습니다" 안내가 노출됨.
const oauthProviders = [
  {
    provider: "kakao",
    label: "카카오로 시작하기",
    styleKey: "kakao",
    brandIcon: "K",
  },
  {
    provider: "google",
    label: "Google로 시작하기",
    styleKey: "google",
    brandIcon: "G",
  },
];

function buildOAuthFallbackMessage(providerLabel, error) {
  const rawMessage = error?.message?.toLowerCase() ?? "";

  if (
    rawMessage.includes("provider") ||
    rawMessage.includes("not enabled") ||
    rawMessage.includes("unsupported")
  ) {
    return `${providerLabel} 로그인이 아직 연결되지 않았습니다. 이메일 로그인으로 계속 진행해 주세요.`;
  }

  if (error?.message) {
    return `${providerLabel} 로그인을 시작하지 못했습니다. ${error.message}`;
  }

  return `${providerLabel} 로그인이 아직 준비되지 않았습니다. 이메일 로그인으로 계속 진행해 주세요.`;
}

function PublicOAuthButtons({
  contextLabel,
  redirectTo,
  dividerLabel = "또는",
  dividerPosition = "top",
  placement = "bottom",
}) {
  const [activeProvider, setActiveProvider] = useState("");
  const [notice, setNotice] = useState("");

  const handleOAuthSignIn = async (providerConfig) => {
    setNotice("");

    if (!isSupabaseConfigured || !supabase) {
      setNotice("소셜 로그인 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    setActiveProvider(providerConfig.provider);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: providerConfig.provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      setNotice(buildOAuthFallbackMessage(providerConfig.label, error));
      setActiveProvider("");
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setNotice(`${providerConfig.label} 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.`);
    setActiveProvider("");
  };

  const dividerElement = (
    <div aria-hidden="true" className="public-auth-social__divider">
      <span>{dividerLabel}</span>
    </div>
  );

  return (
    <section
      aria-label={`${contextLabel} 소셜 로그인`}
      className={`public-auth-social public-auth-social--${placement}`}
    >
      {dividerPosition === "top" ? dividerElement : null}

      {notice ? (
        <p
          className="public-auth-inline-message public-auth-inline-message--error"
          role="alert"
        >
          {notice}
        </p>
      ) : null}

      <div className="public-auth-social__buttons">
        {oauthProviders.map((providerConfig) => {
          const isActive = activeProvider === providerConfig.provider;

          return (
            <button
              className={`public-auth-social__button public-auth-social__button--${providerConfig.styleKey}`}
              disabled={isActive}
              key={providerConfig.provider}
              onClick={() => handleOAuthSignIn(providerConfig)}
              type="button"
            >
              {isActive ? (
                <>
                  <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                  <span>{providerConfig.label} 연결 중...</span>
                </>
              ) : (
                <>
                  <span className="public-auth-social__button-brand" aria-hidden="true">
                    {providerConfig.brandIcon}
                  </span>
                  <span>{providerConfig.label}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {dividerPosition === "bottom" ? dividerElement : null}
    </section>
  );
}

export default PublicOAuthButtons;
