import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useFocusTrap } from "../lib/useFocusTrap";

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
  const dialogRef = useRef(null);

  useFocusTrap(dialogRef, open);

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
        aria-modal="true"
        className="public-sheet public-mypage-sheet"
        onClick={(event) => event.stopPropagation()}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={dialogRef}
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
    </div>,
    document.body,
  );
}

// P1-8: 환불 사유 카테고리. 단순 변심은 전자상거래법상 배송비 사용자 부담 안내 추가.
const REFUND_REASON_CATEGORIES = [
  { value: "defect", label: "상품 하자/등급 불일치" },
  { value: "change_of_mind", label: "단순 변심" },
  { value: "wrong_item", label: "다른 상품 도착" },
  { value: "other", label: "기타" },
];

function ConfirmDialog({
  body,
  confirmLabel,
  confirmTone = "danger",
  onClose,
  onConfirm,
  open,
  title,
  reasonInput,
  reasonValue,
  onReasonChange,
  reasonPlaceholder,
  reasonMinLength = 4,
  reasonCategoryValue,
  onReasonCategoryChange,
  busy = false,
}) {
  const confirmClassName =
    confirmTone === "danger"
      ? "public-auth-button public-mypage-button--danger"
      : "public-auth-button public-auth-button--primary";

  const trimmedReason = (reasonValue ?? "").trim();
  const isReasonTooShort = reasonInput && trimmedReason.length < reasonMinLength;
  // 카테고리 필드를 사용하는 경우(onReasonCategoryChange 제공) 선택도 필수.
  const requireCategory = Boolean(onReasonCategoryChange);
  const isCategoryMissing = requireCategory && !reasonCategoryValue;
  const isConfirmDisabled = busy || isReasonTooShort || isCategoryMissing;
  const isChangeOfMind = reasonCategoryValue === "change_of_mind";

  return (
    <ResponsiveSheet
      actions={
        <>
          <button
            className="public-auth-button public-auth-button--secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className={confirmClassName}
            disabled={isConfirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "처리 중..." : confirmLabel}
          </button>
        </>
      }
      eyebrow="확인"
      onClose={onClose}
      open={open}
      title={title}
    >
      <p className="public-mypage-confirm__body">{body}</p>
      {reasonInput ? (
        <div className="public-mypage-confirm__reason">
          {requireCategory ? (
            <>
              <fieldset className="public-mypage-confirm__category">
                <legend className="public-mypage-confirm__reason-label">환불 사유 분류</legend>
                {REFUND_REASON_CATEGORIES.map((opt) => (
                  <label className="public-mypage-confirm__category-option" key={opt.value}>
                    <input
                      checked={reasonCategoryValue === opt.value}
                      disabled={busy}
                      name="public-mypage-refund-category"
                      onChange={() => onReasonCategoryChange(opt.value)}
                      type="radio"
                      value={opt.value}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </fieldset>
              {isChangeOfMind ? (
                <p className="public-mypage-confirm__reason-hint public-mypage-confirm__reason-hint--info">
                  단순 변심은 전자상거래법상 왕복 배송비를 구매자가 부담합니다.
                </p>
              ) : null}
              {isCategoryMissing ? (
                <p className="public-mypage-confirm__reason-hint" role="alert">
                  환불 사유를 선택해주세요.
                </p>
              ) : null}
            </>
          ) : null}

          <label className="public-mypage-confirm__reason-label" htmlFor="public-mypage-confirm-reason">
            상세 사유 (최소 {reasonMinLength}자)
          </label>
          <textarea
            id="public-mypage-confirm-reason"
            className="public-mypage-confirm__reason-input"
            disabled={busy}
            onChange={(event) => onReasonChange?.(event.target.value)}
            placeholder={reasonPlaceholder ?? "사유를 입력해 주세요."}
            rows={4}
            value={reasonValue ?? ""}
          />
          {isReasonTooShort ? (
            <p className="public-mypage-confirm__reason-hint" role="alert">
              사유는 {reasonMinLength}자 이상 입력해주세요.
            </p>
          ) : null}
        </div>
      ) : null}
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
