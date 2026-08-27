import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trackSelectPromotion, trackViewPromotion } from "../lib/analytics";
import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
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
    promotion: {
      promotionId: "home_popup_jeonil",
      promotionName: "전일학원 × 수북 출시 알림",
      creativeSlot: "home_popup",
    },
  },
  {
    src: popupKakaoImg,
    alt: "카카오톡 채널 친구추가 시 3,000원 할인 쿠폰 증정 — 채널 추가하러 가기",
    href: KAKAO_CHANNEL_URL,
    promotion: {
      promotionId: "home_popup_kakao_channel",
      promotionName: "카카오채널 친구추가 3,000원 쿠폰",
      creativeSlot: "home_popup",
    },
  },
];

// 홈페이지 첫 진입 시 순차 노출되는 팝업. 세션 동안 닫으면 다시 뜨지 않음.
function PublicPopupBanner() {
  const [index, setIndex] = useState(-1); // -1 = 미노출
  const navigate = useNavigate();
  // 팝업별 view_promotion 1회 (StrictMode 이중 effect 방어)
  const viewTrackedRef = useRef(new Set());

  useEffect(() => {
    if (POPUPS.length === 0) {
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
  }, []);

  useEffect(() => {
    if (index < 0 || !POPUPS[index] || viewTrackedRef.current.has(index)) {
      return;
    }
    viewTrackedRef.current.add(index);
    trackViewPromotion(POPUPS[index].promotion);
  }, [index]);

  const finish = () => {
    setIndex(-1);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
  };

  // 닫기: 다음 팝업이 있으면 다음으로, 없으면 종료
  const handleClose = () => {
    if (index < POPUPS.length - 1) {
      setIndex((prev) => prev + 1);
    } else {
      finish();
    }
  };

  const handleClick = () => {
    const popup = POPUPS[index];
    trackSelectPromotion(popup.promotion);
    finish();
    if (popup.href) {
      window.open(popup.href, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(popup.to);
  };

  if (index < 0 || !POPUPS[index]) {
    return null;
  }

  const popup = POPUPS[index];

  return (
    <div
      className="public-popup-banner"
      role="dialog"
      aria-modal="true"
      aria-label="이벤트 안내"
      onClick={handleClose}
    >
      <div
        className={`public-popup-banner__panel${popup.large ? " public-popup-banner__panel--large" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="public-popup-banner__close"
          onClick={handleClose}
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="public-popup-banner__link" onClick={handleClick}>
          <img className="public-popup-banner__image" src={popup.src} alt={popup.alt} />
        </button>
      </div>
    </div>
  );
}

export default PublicPopupBanner;
