import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { isPromotionUrl, promotionDismissKey } from "@shared-domain/sitePromotions";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { trackPromotionDismiss, trackSelectPromotion, trackViewPromotion } from "../lib/analytics";
import "./PublicPopupBanner.css";

function wasDismissed(id) {
  try { return sessionStorage.getItem(promotionDismissKey(id)) === "1"; }
  catch { return false; }
}

function promotionParams(popup) {
  return { promotionId: popup.id, promotionName: popup.title, creativeSlot: "home_popup" };
}

// ID별 세션 닫기: 노출 순서 변경·예약 시작·비활성화에도 다른 팝업의 상태가 섞이지 않는다.
function PublicPopupBanner({ popups = [] }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const viewTracked = useRef(new Set());
  const popup = popups.find((row) => !dismissed.has(row.id) && !wasDismissed(row.id));
  const popupId = popup?.id;
  const popupTitle = popup?.title;
  useFocusTrap(panelRef, Boolean(popup));
  useBodyScrollLock(Boolean(popup));

  const dismiss = useCallback((method = "close_button") => {
    if (!popupId) return;
    trackPromotionDismiss({ promotionId: popupId, promotionName: popupTitle, creativeSlot: "home_popup", closeMethod: method });
    setDismissed((previous) => new Set([...previous, popupId]));
    try { sessionStorage.setItem(promotionDismissKey(popupId), "1"); } catch { /* 세션 저장 불가 시 메모리 유지 */ }
  }, [popupId, popupTitle]);

  useEffect(() => {
    if (!popupId) return undefined;
    panelRef.current?.querySelector("button")?.focus({ preventScroll: true });
    if (!viewTracked.current.has(popupId)) {
      viewTracked.current.add(popupId);
      trackViewPromotion({ promotionId: popupId, promotionName: popupTitle, creativeSlot: "home_popup" });
    }
    const escape = (event) => { if (event.key === "Escape") dismiss("escape"); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [popupId, popupTitle, dismiss]);

  if (!popup) return null;
  const link = isPromotionUrl(popup.link_url) ? popup.link_url : null;
  const image = (
    <picture>
      {isPromotionUrl(popup.mobile_image_url) && <source media="(max-width: 767px)" srcSet={popup.mobile_image_url} />}
      <img className="public-popup-banner__image" src={popup.image_url} alt={popup.alt_text} />
    </picture>
  );
  const select = () => {
    trackSelectPromotion(promotionParams(popup));
    dismiss("link");
  };

  return createPortal(
    <div className="public-popup-banner" role="dialog" aria-modal="true" aria-label={popup.title} onClick={() => dismiss("backdrop")}>
      <div className="public-popup-banner__panel" ref={panelRef} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="public-popup-banner__close" onClick={() => dismiss()} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {!link ? <div className="public-popup-banner__link">{image}</div> : link.startsWith("/") ? (
          <a className="public-popup-banner__link" href={link} onClick={(event) => { event.preventDefault(); select(); navigate(link); }}>{image}</a>
        ) : (
          <a className="public-popup-banner__link" href={link} target="_blank" rel="noopener noreferrer" onClick={select}>{image}</a>
        )}
      </div>
    </div>, document.body,
  );
}

export default PublicPopupBanner;
