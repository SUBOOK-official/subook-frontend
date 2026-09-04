import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import {
  trackContactClick,
  trackEvent,
  trackKakaoCouponClaim,
  trackOAuthStart,
  trackSelectContent,
  trackViewPromotion,
} from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
import "./PublicKakaoCouponPage.css";

const CLAIM_ENDPOINT = "/api/event/kakao-coupon-claim";
// 추가 동의는 새 항목만 scope로 전달한다 — 기존 동의 항목은 유지됨.
// (카카오 로그인 REST API '추가 항목 동의 받기' 규칙)
const KAKAO_EXTRA_SCOPE = "plusfriends";

// 카카오톡 공식 심볼 (PublicOAuthButtons와 동일 패스 — 브랜드 가이드 기준)
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

// 발급 만료 시각 "MM/DD HH:mm" (KST)
function formatExpiry(expiresAtIso) {
  if (!expiresAtIso) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(expiresAtIso));
  } catch {
    return "";
  }
}

const STEPS = [
  { number: 1, label: "카카오톡 채널 친구추가" },
  { number: 2, label: "카카오 계정으로 인증" },
  { number: 3, label: "3,000원 쿠폰 즉시 발급" },
];

function PublicKakaoCouponPage() {
  usePageMeta({
    title: "카카오톡 채널 친구추가 쿠폰",
    description: "수북 카카오톡 채널 친구추가 시 3,000원 할인 쿠폰을 드립니다.",
    noindex: true,
  });

  const location = useLocation();
  const { isAuthenticated, session } = usePublicAuth();

  const [claiming, setClaiming] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [result, setResult] = useState(null); // { code, expiresAt?, relation? }
  const [notice, setNotice] = useState("");
  const autoClaimedRef = useRef(false);
  const promotionViewedRef = useRef(false);

  const accessToken = session?.access_token ?? null;

  // GA4 쿠폰 페이지 노출 — 마운트당 1회. OAuth 복귀(?claim=1) 진입과 순수 유입을 가른다.
  useEffect(() => {
    if (promotionViewedRef.current) {
      return;
    }
    promotionViewedRef.current = true;
    trackViewPromotion({
      promotionId: "kakao_channel_coupon",
      promotionName: "카카오톡 채널 친구추가 쿠폰",
      creativeSlot: "coupon_page",
      isAuthenticated,
      isOauthReturn: new URLSearchParams(location.search).get("claim") === "1",
    });
    // 노출은 진입 시점 상태로 1회만 — 이후 로그인 상태 변화로 재발화시키지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // uiAction: main_cta / consent_required / link_required — 어떤 맥락에서 카카오 인증을 시작했는지.
  const startKakaoAuth = async (uiAction = "main_cta") => {
    setNotice("");
    // GA4 카카오 인증 시작(리다이렉트 전 의도)
    trackOAuthStart("kakao", "kakao_coupon_page", { uiAction });
    if (!isSupabaseConfigured || !supabase) {
      setNotice("로그인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      trackEvent("oauth_start_fail", {
        method: "kakao",
        uiSurface: "kakao_coupon_page",
        errorReason: "not_configured",
        uiAction,
      });
      return;
    }
    setOauthStarting(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/event/kakao-coupon?claim=1",
    )}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo, scopes: KAKAO_EXTRA_SCOPE },
    });
    if (error) {
      setOauthStarting(false);
      setNotice("카카오 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      // GA4 OAuth 시작 실패 — 리다이렉트 URL을 받지 못한 경우
      trackEvent("oauth_start_fail", {
        method: "kakao",
        uiSurface: "kakao_coupon_page",
        errorReason: "sign_in_error",
        errorMessage: error.message ?? "",
        uiAction,
      });
      return;
    }
    if (data?.url) {
      window.location.assign(data.url);
      return;
    }
    setOauthStarting(false);
    setNotice("카카오 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    trackEvent("oauth_start_fail", {
      method: "kakao",
      uiSurface: "kakao_coupon_page",
      errorReason: "no_redirect_url",
      uiAction,
    });
  };

  // trigger: manual(메인 CTA) / auto_oauth_return(?claim=1 복귀) / retry(결과 카드 재시도)
  const claimCoupon = async (trigger = "manual") => {
    if (!accessToken || claiming) {
      return;
    }
    setNotice("");
    setClaiming(true);
    try {
      const response = await fetch(CLAIM_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (data?.success) {
        setResult({ code: "ISSUED", expiresAt: data.expiresAt ?? null });
        trackKakaoCouponClaim({ claimTrigger: trigger });
        return;
      }
      setResult({ code: data?.code || "ERROR" });
      // GA4 발급 실패 — 친구추가 미확인·동의 필요 등 코드별 분포
      trackEvent("kakao_coupon_claim_fail", {
        errorReason: data?.code || "ERROR",
        claimTrigger: trigger,
      });
    } catch {
      setResult({ code: "ERROR" });
      // GA4 발급 실패 — 네트워크/파싱 예외
      trackEvent("kakao_coupon_claim_fail", {
        errorReason: "NETWORK",
        claimTrigger: trigger,
      });
    } finally {
      setClaiming(false);
    }
  };

  // OAuth 복귀(?claim=1) 시 자동으로 1회 발급 시도
  useEffect(() => {
    if (autoClaimedRef.current) {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("claim") === "1" && isAuthenticated && accessToken) {
      autoClaimedRef.current = true;
      claimCoupon("auto_oauth_return");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, isAuthenticated, accessToken]);

  const renderResult = () => {
    if (!result) {
      return null;
    }
    switch (result.code) {
      case "ISSUED": {
        const expiry = formatExpiry(result.expiresAt);
        return (
          <div className="kakao-coupon-result kakao-coupon-result--success" role="status">
            <p className="kakao-coupon-result__title">3,000원 쿠폰이 발급되었습니다.</p>
            <p className="kakao-coupon-result__desc">
              {expiry ? `${expiry}까지 사용할 수 있습니다.` : "발급 후 24시간 안에 사용할 수 있습니다."}
            </p>
            <Link
              className="kakao-coupon-result__link"
              onClick={() =>
                trackSelectContent("kakao_coupon_cta", "wallet", { fromCode: "ISSUED" })
              }
              to="/mypage#coupons"
            >
              쿠폰함에서 확인하기
            </Link>
          </div>
        );
      }
      case "ALREADY_CLAIMED":
        return (
          <div className="kakao-coupon-result" role="status">
            <p className="kakao-coupon-result__title">이미 발급받은 쿠폰입니다.</p>
            <Link
              className="kakao-coupon-result__link"
              onClick={() =>
                trackSelectContent("kakao_coupon_cta", "wallet", { fromCode: "ALREADY_CLAIMED" })
              }
              to="/mypage#coupons"
            >
              쿠폰함에서 확인하기
            </Link>
          </div>
        );
      case "NOT_ADDED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">아직 친구추가가 확인되지 않았습니다.</p>
            <p className="kakao-coupon-result__desc">
              채널 친구추가 후 아래 버튼으로 다시 확인해 주세요.
            </p>
            <div className="kakao-coupon-result__actions">
              <a
                className="kakao-coupon-channel-link"
                href={KAKAO_CHANNEL_URL}
                onClick={() =>
                  trackContactClick("kakao", "kakao_coupon_not_added", {
                    uiAction: "channel_add",
                  })
                }
                rel="noreferrer"
                target="_blank"
              >
                채널 친구추가 하러 가기
              </a>
              <button
                className="kakao-coupon-retry"
                disabled={claiming}
                onClick={() => {
                  // GA4 재확인 클릭 — 어떤 실패 코드에서 재시도했는지
                  trackEvent("kakao_coupon_retry", { fromCode: "NOT_ADDED" });
                  claimCoupon("retry");
                }}
                type="button"
              >
                {claiming ? "확인 중..." : "친구추가 완료, 다시 확인"}
              </button>
            </div>
          </div>
        );
      case "CONSENT_REQUIRED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">채널 추가 상태 확인 동의가 필요합니다.</p>
            <button
              className="public-auth-social__button public-auth-social__button--kakao kakao-coupon-kakao-btn"
              disabled={oauthStarting}
              onClick={() => startKakaoAuth("consent_required")}
              type="button"
            >
              <KakaoBrandIcon />
              <span>{oauthStarting ? "카카오 연결 중..." : "카카오로 동의하고 받기"}</span>
            </button>
          </div>
        );
      case "KAKAO_LINK_REQUIRED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">카카오 계정 연결이 필요합니다.</p>
            <button
              className="public-auth-social__button public-auth-social__button--kakao kakao-coupon-kakao-btn"
              disabled={oauthStarting}
              onClick={() => startKakaoAuth("link_required")}
              type="button"
            >
              <KakaoBrandIcon />
              <span>{oauthStarting ? "카카오 연결 중..." : "카카오 계정 연결하기"}</span>
            </button>
          </div>
        );
      case "NOT_MEMBER":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">회원가입을 마무리한 뒤 받을 수 있습니다.</p>
            <Link
              className="kakao-coupon-result__link"
              onClick={() =>
                trackSelectContent("kakao_coupon_cta", "signup", { fromCode: "NOT_MEMBER" })
              }
              to="/signup"
            >
              회원가입 마무리하기
            </Link>
          </div>
        );
      case "NOT_CONFIGURED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">이벤트 준비 중입니다.</p>
            <p className="kakao-coupon-result__desc">잠시 후 다시 시도해 주세요.</p>
          </div>
        );
      case "SOLD_OUT":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">준비된 쿠폰이 모두 소진되었습니다.</p>
          </div>
        );
      case "ENDED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">종료된 이벤트입니다.</p>
          </div>
        );
      case "BLOCKED":
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="status">
            <p className="kakao-coupon-result__title">쿠폰을 발급할 수 없는 계정입니다.</p>
          </div>
        );
      default:
        return (
          <div className="kakao-coupon-result kakao-coupon-result--warn" role="alert">
            <p className="kakao-coupon-result__title">쿠폰 발급에 실패했습니다.</p>
            <button
              className="kakao-coupon-retry"
              disabled={claiming}
              onClick={() => {
                // GA4 재시도 클릭 — 직전 실패 코드와 함께
                trackEvent("kakao_coupon_retry", { fromCode: result.code || "ERROR" });
                claimCoupon("retry");
              }}
              type="button"
            >
              {claiming ? "확인 중..." : "다시 시도"}
            </button>
          </div>
        );
    }
  };

  // 결과 카드가 뜨면 메인 CTA는 숨긴다 — 각 결과 블록이 자기 액션(재시도·동의·연결)을 갖는다.
  const showMainCta = !result;

  return (
    <PublicPageFrame>
      <div className="kakao-coupon-page">
        <PublicSiteHeader />

        <ContentContainer as="main" className="kakao-coupon-content">
          <section aria-label="카카오톡 채널 친구추가 쿠폰" className="kakao-coupon-card">
            <p className="kakao-coupon-eyebrow">카카오톡 채널 이벤트</p>
            <h1 className="kakao-coupon-title">
              채널 친구추가하고
              <br />
              3,000원 쿠폰 받기
            </h1>
            <p className="kakao-coupon-subtitle">
              발급된 쿠폰은 24시간 안에, 2만원 이상 주문 시 사용할 수 있습니다.
            </p>

            <ol className="kakao-coupon-steps">
              {STEPS.map((step) => (
                <li className="kakao-coupon-step" key={step.number}>
                  <span aria-hidden="true" className="kakao-coupon-step__number">
                    {step.number}
                  </span>
                  <span className="kakao-coupon-step__label">{step.label}</span>
                </li>
              ))}
            </ol>

            {showMainCta ? (
              <a
                className="kakao-coupon-channel-link"
                href={KAKAO_CHANNEL_URL}
                onClick={() =>
                  trackContactClick("kakao", "kakao_coupon_main", { uiAction: "channel_add" })
                }
                rel="noreferrer"
                target="_blank"
              >
                채널 친구추가 하러 가기
              </a>
            ) : null}

            {showMainCta && !isAuthenticated ? (
              <button
                className="public-auth-social__button public-auth-social__button--kakao kakao-coupon-kakao-btn"
                disabled={oauthStarting}
                onClick={() => startKakaoAuth("main_cta")}
                type="button"
              >
                <KakaoBrandIcon />
                <span>{oauthStarting ? "카카오 연결 중..." : "카카오로 인증하고 쿠폰 받기"}</span>
              </button>
            ) : null}

            {showMainCta && isAuthenticated ? (
              <button
                className="kakao-coupon-claim-btn"
                disabled={claiming}
                onClick={() => {
                  // GA4 발급 시도 클릭(성공/실패 분모)
                  trackEvent("kakao_coupon_claim_click", { uiSurface: "main_cta" });
                  claimCoupon("manual");
                }}
                type="button"
              >
                {claiming ? "친구추가 확인 중..." : "3,000원 쿠폰 받기"}
              </button>
            ) : null}

            {notice ? (
              <p className="kakao-coupon-notice" role="alert">
                {notice}
              </p>
            ) : null}

            {renderResult()}

            <p className="kakao-coupon-fineprint">
              쿠폰은 1인 1회 발급되며, 카카오톡 채널 친구 상태가 확인된 회원에게만 지급됩니다.
            </p>
          </section>
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicKakaoCouponPage;
