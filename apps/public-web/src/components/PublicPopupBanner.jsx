import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  trackPromotionDismiss,
  trackSelectPromotion,
  trackViewPromotion,
} from "../lib/analytics";
import { COLLAB_OPEN_AT } from "../lib/publicFeaturedProducts";
import popupJeonilImg from "../assets/home-popup/POP-UP1.webp";
import popupKakaoImg from "../assets/home-popup/POP-UP2.webp";
import "./PublicPopupBanner.css";

const STORAGE_KEY = "subook.public.popup-banner.dismissed.v2";

// 홈 첫 진입 시 순차 노출되는 팝업. X로 넘기면 다음 팝업, 마지막이면 종료(세션 동안 재노출 없음).
// 새 팝업은 여기에 항목 추가 — 이동은 to(내부 경로) 또는 href(외부 URL) 중 하나만 지정.
const POPUPS = [
  {
    src: popupJeonilImg,
    alt: "전일학원 × 수북 콜라보 한정판 교재, 9월 3일 수북 단독 오픈 — 출시 알림 신청하러 가기",
    to: "/event/jeon-il",
    large: true, // POP-UP1은 1.6배 크게
    // 판매 시작 후에는 '출시 알림 신청' 팝업이 무의미해 내린다 (문구가 이미지에
    // 구워져 있어 문구 교체가 불가능 — 이미지를 새로 만들면 이 줄을 지우면 된다).
    hideAfter: COLLAB_OPEN_AT,
    promotion: {
      promotionId: "home_popup_jeonil",
      promotionName: "전일학원 × 수북 출시 알림",
      creativeSlot: "home_popup",
    },
  },
  {
    src: popupKakaoImg,
    alt: "카카오톡 채널 친구추가 시 3,000원 할인 쿠폰 증정 — 쿠폰 받으러 가기",
    // 채널 추가 페이지로 직행시키면 복귀 경로가 웰컴메시지뿐이라(야간엔 익일 지연)
    // 친추→발급을 한 화면에서 끝내는 쿠폰 페이지로 보낸다 (2026-08-30 CS 재발 방지)
    to: "/event/kakao-coupon",
    promotion: {
      promotionId: "home_popup_kakao_channel",
      promotionName: "카카오채널 친구추가 3,000원 쿠폰",
      creativeSlot: "home_popup",
    },
  },
];

// hideAfter가 지난 팝업은 목록에서 뺀다. 노출 중 목록이 바뀌면 index가 어긋나므로
// 마운트 시 한 번만 계산한다.
function getActivePopups(now = Date.now()) {
  return POPUPS.filter((popup) => !popup.hideAfter || now < Date.parse(popup.hideAfter));
}

// 홈페이지 첫 진입 시 순차 노출되는 팝업. 세션 동안 닫으면 다시 뜨지 않음.
function PublicPopupBanner() {
  const [popups] = useState(getActivePopups);
  const [index, setIndex] = useState(-1); // -1 = 미노출
  const navigate = useNavigate();
  // 팝업별 view_promotion 1회 (StrictMode 이중 effect 방어)
  const viewTrackedRef = useRef(new Set());

  useEffect(() => {
    if (popups.length === 0) {
      return;
    }
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (!dismissed) {
      setIndex(0);
    }
    // popups는 마운트 시 한 번 계산돼 그대로라 실제로는 최초 1회만 실행된다.
  }, [popups.length]);

  useEffect(() => {
    if (index < 0 || !popups[index] || viewTrackedRef.current.has(index)) {
      return;
    }
    viewTrackedRef.current.add(index);
    trackViewPromotion(popups[index].promotion);
  }, [index, popups]);

  const finish = () => {
    setIndex(-1);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
  };

  // 닫기: 다음 팝업이 있으면 다음으로, 없으면 종료
  // closeMethod: close_button(×) / backdrop
  const handleClose = (closeMethod = "close_button") => {
    // GA4 promotion_dismiss — view_promotion 대비 이탈률(팝업 피로도)
    const popup = popups[index];
    if (popup) {
      trackPromotionDismiss({
        ...popup.promotion,
        closeMethod,
        popupIndex: index,
      });
    }
    if (index < popups.length - 1) {
      setIndex((prev) => prev + 1);
    } else {
      finish();
    }
  };

  // 내부 경로 이동 (외부 href 팝업은 네이티브 앵커가 새 탭을 연다 — window.open은
  // 팝업 차단기에 걸릴 수 있어 쓰지 않음)
  const handleClick = () => {
    const popup = popups[index];
    trackSelectPromotion(popup.promotion);
    finish();
    navigate(popup.to);
  };

  const handleExternalClick = () => {
    trackSelectPromotion(popups[index].promotion);
    finish();
  };

  if (index < 0 || !popups[index]) {
    return null;
  }

  const popup = popups[index];

  return (
    <div
      className="public-popup-banner"
      role="dialog"
      aria-modal="true"
      aria-label="이벤트 안내"
      onClick={() => handleClose("backdrop")}
    >
      <div
        className={`public-popup-banner__panel${popup.large ? " public-popup-banner__panel--large" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="public-popup-banner__close"
          onClick={() => handleClose("close_button")}
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {popup.href ? (
          <a
            className="public-popup-banner__link"
            href={popup.href}
            target="_blank"
            rel="noreferrer"
            onClick={handleExternalClick}
          >
            <img className="public-popup-banner__image" src={popup.src} alt={popup.alt} />
          </a>
        ) : (
          <button type="button" className="public-popup-banner__link" onClick={handleClick}>
            <img className="public-popup-banner__image" src={popup.src} alt={popup.alt} />
          </button>
        )}
      </div>
    </div>
  );
}

export default PublicPopupBanner;
