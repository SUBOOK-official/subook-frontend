import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trackViewPromotion } from "../lib/analytics";
import "./PublicPopupBanner.css";

const STORAGE_KEY = "subook.public.popup-banner.dismissed.v2";
const EVENT_PATH = "/event/jeon-il";

// 홈 팝업 이미지 — apps/public-web/src/assets/home-popup/ 에 넣으면 파일명 순서대로
// 순차 노출된다 (popup-1 먼저, popup-2 그 다음).
const popupModules = import.meta.glob("../assets/home-popup/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});
const POPUPS = Object.entries(popupModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url);

const POPUP_PROMOTION = {
  promotionId: "home_popup_jeonil",
  promotionName: "전일학원 × 수북 홈 팝업",
  creativeSlot: "home_popup",
};

// 홈페이지 첫 진입 시 순차 노출되는 팝업. 세션 동안 닫으면 다시 뜨지 않음.
function PublicPopupBanner() {
  const [index, setIndex] = useState(-1); // -1 = 미노출
  const navigate = useNavigate();

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
      trackViewPromotion(POPUP_PROMOTION);
    }
  }, []);

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
    finish();
    navigate(EVENT_PATH);
  };

  if (index < 0 || !POPUPS[index]) {
    return null;
  }

  return (
    <div
      className="public-popup-banner"
      role="dialog"
      aria-modal="true"
      aria-label="이벤트 안내"
      onClick={handleClose}
    >
      <div
        className={`public-popup-banner__panel${index === 0 ? " public-popup-banner__panel--large" : ""}`}
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
          <img
            className="public-popup-banner__image"
            src={POPUPS[index]}
            alt={`전일학원 × 수북 이벤트 안내 ${index + 1}`}
          />
        </button>
      </div>
    </div>
  );
}

export default PublicPopupBanner;
