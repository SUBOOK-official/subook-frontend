import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const oauthProviders = [
  {
    provider: "kakao",
    label: "카카오로 시작하기",
    styleKey: "kakao",
    brandIcon: "K",
  },
  {
    provider: "custom:naver",
    label: "네이버로 시작하기",
    styleKey: "naver",
    brandIcon: "N",
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

function PublicOAuthButtons({ contextLabel, redirectTo }) {
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

  return (
    <section aria-label={`${contextLabel} 소셜 로그인`} className="public-auth-social">
      <div aria-hidden="true" className="public-auth-social__divider">
        <span>또는</span>
      </div>

      {notice ? <p className="public-auth-inline-message public-auth-inline-message--error">{notice}</p> : null}

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
    </section>
  );
}

export default PublicOAuthButtons;
