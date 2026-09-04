import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { trackDialogClose, trackDialogOpen, trackEvent } from "../lib/analytics";

function MypageEmptyState({ actionLabel, actionOnClick, actionTo, icon, title }) {
  return (
    <div className="public-mypage-empty-state">
      <div aria-hidden="true" className="public-mypage-empty-state__icon">
        {icon}
      </div>
      <h3 className="public-mypage-empty-state__title">{title}</h3>
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

// analyticsName을 주면 열림/닫힘을 GA4 dialog_open/dialog_close로 기록한다(주지 않으면 무계측).
// analyticsExtra는 열림 시점, analyticsCloseExtra는 닫힘 시점 파라미터 — 닫힘 값은 시점에
// 따라 달라질 수 있으므로 함수도 허용한다(() => ({ had_rating, content_length … })).
function ResponsiveSheet({
  actions,
  analyticsCloseExtra,
  analyticsExtra,
  analyticsName,
  children,
  eyebrow,
  onClose,
  open,
  title,
}) {
  const [offsetY, setOffsetY] = useState(0);
  const startYRef = useRef(null);
  const dialogRef = useRef(null);
  const openTrackedRef = useRef(false);
  const closeHandlerRef = useRef(null);

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  const resolveCloseExtra = () =>
    typeof analyticsCloseExtra === "function" ? analyticsCloseExtra() : analyticsCloseExtra;

  // GA4 닫기 — close_method(backdrop/close_button/escape/swipe)를 구분해 기록한 뒤 닫는다.
  const closeWithTracking = (closeMethod) => {
    if (analyticsName) {
      trackDialogClose(analyticsName, closeMethod, resolveCloseExtra());
    }
    onClose?.();
  };
  closeHandlerRef.current = closeWithTracking;

  // GA4 다이얼로그 노출 — 한 번의 열림당 1회.
  useEffect(() => {
    if (!open) {
      openTrackedRef.current = false;
      return;
    }
    if (!analyticsName || openTrackedRef.current) {
      return;
    }
    openTrackedRef.current = true;
    trackDialogOpen(analyticsName, analyticsExtra);
    // analyticsExtra는 열림 시점 값만 쓰면 되므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsName, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeHandlerRef.current?.("escape");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setOffsetY(0);
      startYRef.current = null;
    };
  }, [open]);

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
      closeWithTracking("swipe");
      return;
    }

    setOffsetY(0);
    startYRef.current = null;
  };

  return createPortal(
    <div className="public-sheet-backdrop" onClick={() => closeWithTracking("backdrop")}>
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
          <button
            aria-label="닫기"
            className="public-sheet__close"
            onClick={() => closeWithTracking("close_button")}
            type="button"
          >
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

// 주문 취소 사유 카테고리. 배송 전 취소라 배송비 안내는 불필요.
const CANCEL_REASON_CATEGORIES = [
  { value: "change_of_mind", label: "단순 변심" },
  { value: "shipping_delay", label: "배송 지연" },
  { value: "change_item", label: "다른 상품으로 변경" },
  { value: "wrong_order", label: "상품을 잘못 주문함" },
  { value: "other", label: "기타 (직접 입력)" },
];

const DEFAULT_CHANGE_OF_MIND_HINT =
  "단순 변심은 전자상거래법상 왕복 배송비를 구매자가 부담합니다.";

function ConfirmDialog({
  analyticsCloseExtra,
  analyticsExtra,
  analyticsName,
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
  reasonCategories = REFUND_REASON_CATEGORIES,
  reasonCategoryLegend = "환불 사유 분류",
  changeOfMindHint = DEFAULT_CHANGE_OF_MIND_HINT,
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

  // GA4 — 시트 자체의 닫기(배경·×·Escape·스와이프)는 ResponsiveSheet가 기록하고,
  // 푸터의 '취소' 버튼만 여기서 cancel_button으로 남긴다(이중 발화 없음).
  const handleCancelButton = () => {
    if (analyticsName) {
      trackDialogClose(
        analyticsName,
        "cancel_button",
        typeof analyticsCloseExtra === "function" ? analyticsCloseExtra() : analyticsCloseExtra,
      );
    }
    onClose?.();
  };

  const handleReasonCategoryChange = (value) => {
    onReasonCategoryChange(value);
    // GA4 사유 분류 선택 — 취소·환불 사유 분포 관찰용(자유 입력 본문은 보내지 않는다).
    trackEvent("confirm_reason_select", {
      dialogName: analyticsName || "unknown",
      reasonCategory: value,
    });
  };

  return (
    <ResponsiveSheet
      actions={
        <>
          <button
            className="public-auth-button public-auth-button--secondary"
            disabled={busy}
            onClick={handleCancelButton}
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
      analyticsCloseExtra={analyticsCloseExtra}
      analyticsExtra={analyticsExtra}
      analyticsName={analyticsName}
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
                <legend className="public-mypage-confirm__reason-label">{reasonCategoryLegend}</legend>
                {reasonCategories.map((opt) => (
                  <label className="public-mypage-confirm__category-option" key={opt.value}>
                    <input
                      checked={reasonCategoryValue === opt.value}
                      disabled={busy}
                      name="public-mypage-reason-category"
                      onChange={() => handleReasonCategoryChange(opt.value)}
                      type="radio"
                      value={opt.value}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </fieldset>
              {isChangeOfMind && changeOfMindHint ? (
                <p className="public-mypage-confirm__reason-hint public-mypage-confirm__reason-hint--info">
                  {changeOfMindHint}
                </p>
              ) : null}
              {isCategoryMissing ? (
                <p className="public-mypage-confirm__reason-hint" role="alert">
                  사유를 선택해주세요.
                </p>
              ) : null}
            </>
          ) : null}

          <label className="public-mypage-confirm__reason-label" htmlFor="public-mypage-confirm-reason">
            상세 사유 {reasonMinLength > 0 ? `(최소 ${reasonMinLength}자)` : "(선택)"}
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
  CANCEL_REASON_CATEGORIES,
  ConfirmDialog,
  MypageEmptyState,
  MypageSectionHeader,
  MypageSummaryCard,
  ResponsiveSheet,
};
