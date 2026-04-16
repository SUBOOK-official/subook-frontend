import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function PublicMemberGateDialog({ onClose, onLogin, onSignup, open }) {
  const [offsetY, setOffsetY] = useState(0);
  const startYRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      setOffsetY(0);
      startYRef.current = null;
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

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

    if (offsetY > 120) {
      onClose();
      return;
    }

    setOffsetY(0);
    startYRef.current = null;
  };

  return createPortal(
    <div className="public-sheet-backdrop" onClick={onClose}>
      <section
        aria-labelledby="public-member-gate-title"
        aria-modal="true"
        className="public-sheet public-member-gate"
        onClick={(event) => event.stopPropagation()}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
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
            <span aria-hidden="true">🔒</span>
          </h2>
          <p className="public-member-gate__description">
            수북 회원이 되면
            <br />
            교재를 사고팔 수 있어요!
          </p>
        </div>

        <div className="public-member-gate__actions">
          <button className="public-auth-button public-auth-button--primary" onClick={onLogin} type="button">
            로그인
          </button>
          <button className="public-auth-button public-auth-button--secondary" onClick={onSignup} type="button">
            회원가입
          </button>
        </div>

        <button className="public-member-gate__dismiss" onClick={onClose} type="button">
          나중에 할게요
        </button>
      </section>
    </div>,
    document.body,
  );
}

export default PublicMemberGateDialog;
