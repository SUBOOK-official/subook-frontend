import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import "./JeonilProductChooserDialog.css";

// 전일학원 랜딩의 교재 카드 하나가 상품 여럿을 대표할 때(미니모의고사 10회분/30일분),
// 어느 상품 상세로 갈지 고르는 모달. card.choices = [{ key, label, desc, productId }].
// 스타일은 같은 페이지의 출시 알림 팝업(JeonilCouponDialog)과 맞춘다.
function JeonilProductChooserDialog({ card, onClose }) {
  const open = Boolean(card);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="jeonil-chooser"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.alt} 구성 선택`}
      onClick={onClose}
    >
      <div className="jeonil-chooser__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="jeonil-chooser__close" onClick={onClose} aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <p className="jeonil-chooser__eyebrow">{card.alt}</p>
        <p className="jeonil-chooser__title">구성을 선택해 주세요</p>

        <ul className="jeonil-chooser__list">
          {card.choices.map((choice) => (
            <li key={choice.key}>
              <Link
                className="jeonil-chooser__choice"
                to={`/store/${choice.productId}`}
                onClick={onClose}
              >
                <span className="jeonil-chooser__choice-text">
                  <span className="jeonil-chooser__choice-label">{choice.label}</span>
                  <span className="jeonil-chooser__choice-desc">{choice.desc}</span>
                </span>
                <svg
                  className="jeonil-chooser__choice-arrow"
                  width="18"
                  height="18"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

export default JeonilProductChooserDialog;
