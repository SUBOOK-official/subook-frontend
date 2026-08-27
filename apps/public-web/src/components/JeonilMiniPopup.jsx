import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./JeonilMiniPopup.css";

const STORAGE_KEY = "subook.public.jeonil-mini.dismissed.v2";
const EVENT_PATH = "/event/jeon-il";

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

  // 이미지가 없거나, 이벤트 페이지 자체에서는 노출하지 않음
  if (!open || !MINI_IMG || location.pathname === EVENT_PATH) {
    return null;
  }

  const dismiss = (event) => {
    event.stopPropagation();
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  const goEvent = () => {
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
