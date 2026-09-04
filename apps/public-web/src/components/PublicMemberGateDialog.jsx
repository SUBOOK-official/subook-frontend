import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import PublicOAuthButtons from "./PublicOAuthButtons";
import { trackLoginGateCta } from "../lib/analytics";
import { LockIcon } from "./icons";

// 2026-08-09 위계 개편 (GA 실측: 관문 통과율 49%, 로그인의 64%가 카카오):
// 카카오 히어로 → 비회원 주문(바로구매 게이트) 승격 → Google 슬림 → 이메일 텍스트 링크.
// 기존 로그인/회원가입 2버튼은 이메일 링크 하나로 축소 (가입은 /login의 회원가입 링크로 도달,
// 호출부가 넘기는 onSignup prop은 받되 사용하지 않음).
function PublicMemberGateDialog({ gateReason = "", onClose, onGuestCheckout, onLogin, open }) {
  const [offsetY, setOffsetY] = useState(0);
  const startYRef = useRef(null);
  const dialogRef = useRef(null);

  // 소셜 로그인 후 원래 보던 페이지로 복귀.
  const oauthRedirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          `${window.location.pathname}${window.location.search}`,
        )}`
      : undefined;

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        // GA4 login_gate_cta — 닫기 제스처별로 가른다(escape/backdrop/later_button/swipe)
        trackLoginGateCta("dismiss", gateReason, { closeMethod: "escape" });
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setOffsetY(0);
      startYRef.current = null;
    };
  }, [gateReason, onClose, open]);

  if (!open) {
    return null;
  }

  // 사용자 주도 닫기(나중에/배경/ESC)만 dismiss로 계측 — 로그인·게스트 진행 후
  // 프로그램적 닫힘은 훅의 closeMemberGate 경로라 여길 지나지 않는다.
  const handleDismiss = (closeMethod = "unknown") => {
    trackLoginGateCta("dismiss", gateReason, { closeMethod });
    onClose();
  };

  const handleEmailLogin = () => {
    trackLoginGateCta("email", gateReason);
    onLogin();
  };

  const handleGuestCheckout = () => {
    trackLoginGateCta("guest", gateReason);
    onGuestCheckout();
  };

  const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;

  const handleTouchStart = (event) => {
    if (!isMobileViewport) {
      return;
    }

    startYRef.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event) => {
    if (!isMobileViewport || startYRef.current === null) {
      return;
    }

    const deltaY = event.touches[0].clientY - startYRef.current;
    if (deltaY > 0) {
      setOffsetY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobileViewport) {
      return;
    }

    // 화면 높이의 25%를 넘게 끌어내리면 닫는다 — 디바이스 크기에 비례하므로
    // 작은 화면(예: iPhone SE)에서도 동작이 자연스럽다.
    const closeThreshold = window.innerHeight * 0.25;
    if (offsetY > closeThreshold) {
      handleDismiss("swipe");
      return;
    }

    setOffsetY(0);
    startYRef.current = null;
  };

  return createPortal(
    <div
      className="public-sheet-backdrop public-sheet-backdrop--centered"
      onClick={() => handleDismiss("backdrop")}
    >
      <section
        aria-labelledby="public-member-gate-title"
        aria-modal="true"
        className="public-sheet public-member-gate"
        onClick={(event) => event.stopPropagation()}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={dialogRef}
        role="dialog"
        style={
          isMobileViewport && offsetY > 0
            ? {
                transform: `translateY(${offsetY}px)`,
              }
            : undefined
        }
      >
        <div className="public-sheet__drag-handle" />

        <div className="public-member-gate__copy">
          <h2 className="public-member-gate__title" id="public-member-gate-title">
            <span>로그인이 필요해요</span>
            <LockIcon size={18} />
          </h2>
          <p className="public-member-gate__description">
            수북 회원이 되면
            <br />
            교재를 사고팔 수 있어요!
          </p>
        </div>

        <div className="public-member-gate__actions">
          {/* 카카오 히어로 (로그인의 64%) — 크기 위계는 index.css 게이트 스코프 규칙 */}
          <PublicOAuthButtons
            analyticsSurface="member_gate"
            contextLabel="카카오 로그인"
            dividerPosition="none"
            onProviderClick={(provider) => trackLoginGateCta(provider, gateReason)}
            placement="top"
            providers={["kakao"]}
            redirectTo={oauthRedirectTo}
          />
          {/* 바로구매 게이트 전용 — 비회원 주문. 구매 의도가 관문에서 죽지 않게 공동 1순위 위계 */}
          {onGuestCheckout ? (
            <button className="public-member-gate__guest" onClick={handleGuestCheckout} type="button">
              비회원으로 주문하기
            </button>
          ) : null}
          <PublicOAuthButtons
            analyticsSurface="member_gate"
            contextLabel="Google 로그인"
            dividerPosition="none"
            onProviderClick={(provider) => trackLoginGateCta(provider, gateReason)}
            placement="top"
            providers={["google"]}
            redirectTo={oauthRedirectTo}
          />
          <button className="public-member-gate__email-link" onClick={handleEmailLogin} type="button">
            이메일로 로그인 · 회원가입
          </button>
        </div>

        <button
          className="public-member-gate__dismiss"
          onClick={() => handleDismiss("later_button")}
          type="button"
        >
          나중에 할게요
        </button>
      </section>
    </div>,
    document.body,
  );
}

export default PublicMemberGateDialog;
