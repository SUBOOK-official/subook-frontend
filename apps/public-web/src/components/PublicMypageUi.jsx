import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

function MypageEmptyState({ actionLabel, actionOnClick, actionTo, description, icon, title }) {
  return (
    <div className="public-mypage-empty-state">
      <div aria-hidden="true" className="public-mypage-empty-state__icon">
        {icon}
      </div>
      <h3 className="public-mypage-empty-state__title">{title}</h3>
      <p className="public-mypage-empty-state__description">{description}</p>
      {actionLabel && actionOnClick ? (
        <button
          className="public-auth-button public-auth-button--primary public-mypage-empty-state__action"
          onClick={actionOnClick}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
      {actionLabel && actionTo && !actionOnClick ? (
        <Link
          className="public-auth-button public-auth-button--primary public-mypage-empty-state__action"
          to={actionTo}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function MypageSectionHeader({ action, description, icon, title }) {
  return (
    <div className="public-mypage-section__header">
      <div className="public-mypage-section__copy">
        <p className="public-mypage-section__eyebrow">
          <span aria-hidden="true">{icon}</span>
          <span>{title}</span>
        </p>
        {description ? <p className="public-mypage-section__description">{description}</p> : null}
      </div>
      {action ? <div className="public-mypage-section__action">{action}</div> : null}
    </div>
  );
}

function MypageSummaryCard({ description, onClick, title, value }) {
  return (
    <button className="public-mypage-summary-card" onClick={onClick} type="button">
      <span className="public-mypage-summary-card__title">{title}</span>
      <strong className="public-mypage-summary-card__value">{value}</strong>
      <span className="public-mypage-summary-card__description">{description}</span>
    </button>
  );
}

function ResponsiveSheet({ actions, children, eyebrow, onClose, open, title }) {
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

  return (
    <div className="public-sheet-backdrop" onClick={onClose}>
      <section
        aria-modal="true"
        className="public-sheet public-mypage-sheet"
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
        <div className="public-sheet__header">
          <div>
            {eyebrow ? <p className="public-sheet__eyebrow">{eyebrow}</p> : null}
            <h2 className="public-sheet__title">{title}</h2>
          </div>
          <button aria-label="닫기" className="public-sheet__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="public-sheet__body">{children}</div>
        {actions ? <div className="public-mypage-sheet__footer">{actions}</div> : null}
      </section>
    </div>
  );
}

function ConfirmDialog({
  body,
  confirmLabel,
  confirmTone = "danger",
  onClose,
  onConfirm,
  open,
  title,
}) {
  const confirmClassName =
    confirmTone === "danger"
      ? "public-auth-button public-mypage-button--danger"
      : "public-auth-button public-auth-button--primary";

  return (
    <ResponsiveSheet
      actions={
        <>
          <button className="public-auth-button public-auth-button--secondary" onClick={onClose} type="button">
            취소
          </button>
          <button className={confirmClassName} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </>
      }
      eyebrow="확인"
      onClose={onClose}
      open={open}
      title={title}
    >
      <p className="public-mypage-confirm__body">{body}</p>
    </ResponsiveSheet>
  );
}

export {
  ConfirmDialog,
  MypageEmptyState,
  MypageSectionHeader,
  MypageSummaryCard,
  ResponsiveSheet,
};
