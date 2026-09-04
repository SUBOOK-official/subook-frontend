import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { trackEvent, trackOAuthStart } from "../lib/analytics";

// 카카오톡 공식 심볼: 검은색 말풍선. 카카오 브랜드 가이드 기준.
function KakaoBrandIcon({ size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 18 18"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 1.5C4.86 1.5 1.5 4.18 1.5 7.48c0 2.16 1.45 4.04 3.61 5.09-.16.6-.58 2.16-.66 2.5-.1.42.15.42.32.31.13-.09 2.14-1.45 3.01-2.04.4.06.81.09 1.22.09 4.14 0 7.5-2.68 7.5-5.98S13.14 1.5 9 1.5z"
        fill="#000"
      />
    </svg>
  );
}

// 구글 공식 G 로고: 4색 (파/빨/노/초). Google brand guidelines 기준 SVG.
function GoogleBrandIcon({ size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        fill="#FFC107"
      />
      <path
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
        fill="#FF3D00"
      />
      <path
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        fill="#4CAF50"
      />
      <path
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        fill="#1976D2"
      />
    </svg>
  );
}

const BRAND_ICONS = {
  kakao: KakaoBrandIcon,
  google: GoogleBrandIcon,
};

// TODO(ops): Supabase 대시보드에서 Google provider 활성 + Client ID/Secret 등록 필요.
//   (Project Settings → Authentication → Providers → Google) 등록 전까지는 버튼이 표시되더라도
//   클릭 시 buildOAuthFallbackMessage로 "아직 연결되지 않았습니다" 안내가 노출됨.
const oauthProviders = [
  {
    provider: "kakao",
    label: "카카오로 시작하기",
    styleKey: "kakao",
    brandIcon: "kakao",
  },
  {
    provider: "google",
    label: "Google로 시작하기",
    styleKey: "google",
    brandIcon: "google",
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

// GA4 error_reason — buildOAuthFallbackMessage와 같은 분기를 짧은 열거값으로.
function classifyOAuthStartError(error) {
  const rawMessage = error?.message?.toLowerCase() ?? "";

  if (
    rawMessage.includes("provider") ||
    rawMessage.includes("not enabled") ||
    rawMessage.includes("unsupported")
  ) {
    return "provider_disabled";
  }

  return "other";
}

// GA4 ui_surface 폴백 — analyticsSurface를 안 넘긴 호출부용. contextLabel이 한국어라
// 슬러그가 비면 placement 기반 이름으로 강등한다.
function deriveAnalyticsSurface(analyticsSurface, contextLabel, placement) {
  if (analyticsSurface) {
    return analyticsSurface;
  }

  const slug = String(contextLabel || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || `oauth_${placement || "unknown"}`;
}

function PublicOAuthButtons({
  contextLabel,
  redirectTo,
  dividerLabel = "또는",
  dividerPosition = "top",
  placement = "bottom",
  // GA4 ui_surface(선택) — login_page / signup_page / member_gate …
  // 미지정이면 contextLabel/placement에서 슬러그를 만들어 쓴다.
  analyticsSurface = "",
  // 클릭 계측용 콜백(선택) — 리다이렉트 전에 provider 이름을 알려준다.
  onProviderClick = null,
  // 일부 provider만 렌더링(선택) — 예: ["kakao"]. 미지정이면 전체.
  providers = null,
}) {
  const [activeProvider, setActiveProvider] = useState("");
  const [notice, setNotice] = useState("");
  const uiSurface = deriveAnalyticsSurface(analyticsSurface, contextLabel, placement);

  const handleOAuthSignIn = async (providerConfig) => {
    setNotice("");
    // GA4 oauth_start — 리다이렉트 전 클릭 의도. login/sign_up(완료)의 분모가 된다.
    trackOAuthStart(providerConfig.provider, uiSurface);
    onProviderClick?.(providerConfig.provider);

    if (!isSupabaseConfigured || !supabase) {
      // GA4 oauth_start_fail — 환경 설정 누락(데모/로컬)으로 시작 자체가 불가
      trackEvent("oauth_start_fail", {
        method: providerConfig.provider,
        uiSurface,
        errorReason: "not_configured",
      });
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
      // GA4 oauth_start_fail — provider 미활성/기타 오류
      trackEvent("oauth_start_fail", {
        method: providerConfig.provider,
        uiSurface,
        errorReason: classifyOAuthStartError(error),
        errorMessage: error.message ?? "",
      });
      setNotice(buildOAuthFallbackMessage(providerConfig.label, error));
      setActiveProvider("");
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    // GA4 oauth_start_fail — 오류는 없는데 리다이렉트 URL이 비어 온 케이스
    trackEvent("oauth_start_fail", {
      method: providerConfig.provider,
      uiSurface,
      errorReason: "no_redirect_url",
    });
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
        {(providers
          ? oauthProviders.filter((config) => providers.includes(config.provider))
          : oauthProviders
        ).map((providerConfig) => {
          const isActive = activeProvider === providerConfig.provider;
          const BrandIcon = BRAND_ICONS[providerConfig.brandIcon];

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
                    {BrandIcon ? <BrandIcon /> : null}
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
