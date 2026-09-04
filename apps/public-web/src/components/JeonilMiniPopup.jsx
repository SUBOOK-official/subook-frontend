import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { COLLAB_OPEN_AT } from "../lib/publicFeaturedProducts";
import {
  trackPromotionDismiss,
  trackSelectPromotion,
  trackViewPromotion,
} from "../lib/analytics";
import "./JeonilMiniPopup.css";

const STORAGE_KEY = "subook.public.jeonil-mini.dismissed.v2";
const EVENT_PATH = "/event/jeon-il";

// GA4 프로모션 식별자 — 전역(모든 페이지 우하단) 미니 팝업
const MINI_PROMOTION = {
  promotionId: "jeonil_mini",
  promotionName: "전일학원 미니 팝업",
  creativeSlot: "global_mini",
};

// 미니 팝업 이미지 — apps/public-web/src/assets/jeonil/mini-popup.{png,jpg,webp}
const miniModules = import.meta.glob("../assets/jeonil/mini-pop-up.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});
const MINI_IMG = Object.values(miniModules)[0] ?? null;

// 전역 미니 팝업 — 우측 하단에 작게. 클릭 시 전일학원 이벤트 페이지로 이동.
function JeonilMiniPopup() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  // 이미지가 없거나, 이벤트 페이지 자체에서는 노출하지 않음.
  // 판매가 시작되면 '알림 신청' 팝업은 의미가 없어 더 띄우지 않는다
  // (문구가 이미지에 구워져 있어 문구만 바꿀 수는 없다).
  const isCollabOpen = Date.now() >= Date.parse(COLLAB_OPEN_AT);
  const isVisible = open && Boolean(MINI_IMG) && !isCollabOpen && location.pathname !== EVENT_PATH;

  // GA4 view_promotion — 실제로 렌더된 순간 1회 (어느 페이지에서 떴는지 page_path로 구분)
  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (!isVisible || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackViewPromotion({ ...MINI_PROMOTION, pagePath: location.pathname });
  }, [isVisible, location.pathname]);

  if (!isVisible) {
    return null;
  }

  const dismiss = (event) => {
    event.stopPropagation();
    // GA4 promotion_dismiss — 미니 팝업 이탈률
    trackPromotionDismiss({
      ...MINI_PROMOTION,
      closeMethod: "close_button",
      pagePath: location.pathname,
    });
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  const goEvent = () => {
    // GA4 select_promotion — 미니 팝업발 이벤트 페이지 진입
    trackSelectPromotion({ ...MINI_PROMOTION, pagePath: location.pathname });
    navigate(EVENT_PATH);
  };

  return (
    <div className="jeonil-mini" role="dialog" aria-label="전일학원 × 수북 이벤트">
      <button type="button" className="jeonil-mini__img-btn" onClick={goEvent}>
        <img src={MINI_IMG} alt="전일학원 × 수북 이벤트 알림 신청하러 가기" draggable={false} />
      </button>
      <button type="button" className="jeonil-mini__close" onClick={dismiss} aria-label="닫기" />
    </div>
  );
}

export default JeonilMiniPopup;
