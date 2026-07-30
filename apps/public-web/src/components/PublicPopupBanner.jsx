import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import popupBannerImg from "../assets/popup-banner.png";
import "./PublicPopupBanner.css";

const STORAGE_KEY = "subook.public.popup-banner.dismissed.v1";

// 홈페이지 첫 진입 시 노출되는 팝업 배너.
// 세션 동안 X로 닫으면 다시 뜨지 않음.
function PublicPopupBanner() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = usePublicAuth();

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

  const dismiss = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
  };

  const handleClose = () => {
    dismiss();
  };

  // 배너 클릭: 회원이면 마이페이지 쿠폰함, 비회원이면 회원가입 페이지로 이동.
  const handleBannerClick = () => {
    dismiss();
    navigate(isAuthenticated ? "/mypage#coupons" : "/signup");
  };

  if (!open) {
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
        className="public-popup-banner__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="public-popup-banner__close"
          onClick={handleClose}
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="public-popup-banner__link"
          onClick={handleBannerClick}
        >
          <img
            className="public-popup-banner__image"
            src={popupBannerImg}
            alt="첫구매 3,000원 할인 쿠폰 받기"
          />
        </button>
      </div>
    </div>
  );
}

export default PublicPopupBanner;
