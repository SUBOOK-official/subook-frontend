import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";

/**
 * 공용 어드민 모달 컨테이너.
 *
 * - 포커스 트랩 + ESC 닫기 + 백드롭 클릭 닫기 + body scroll lock을 한 곳에서 처리.
 * - `dirty` + `confirmDirtyMessage`를 함께 넘기면 닫기/ESC/백드롭 클릭 시
 *   confirm 다이얼로그로 사용자에게 한 번 더 물어본다.
 * - `busy`가 true면 모든 닫기 동작이 무시된다 (저장 중 우발적 닫힘 방지).
 * - body에 portal로 렌더해 sidebar/header의 stacking context와 분리.
 * - `footer` prop이 주어지면 sticky bottom으로 렌더 — 긴 모달에서 취소/확인이
 *   스크롤 아래로 사라지지 않게.
 * - 헤더 우상단에 ✕ 기본 닫기 버튼 (title이 있을 때).
 */
function AdminDialog({
  open,
  onClose,
  title = null,
  busy = false,
  dirty = false,
  confirmDirtyMessage = "변경 사항이 저장되지 않습니다. 정말 닫으시겠어요?",
  size = "lg",
  bodyClassName = "",
  footer = null,
  children,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  const sizeClass =
    size === "sm"
      ? "max-w-md"
      : size === "md"
        ? "max-w-lg"
        : size === "lg"
          ? "max-w-2xl"
          : size === "xl"
            ? "max-w-4xl"
            : size === "2xl"
              ? "max-w-5xl"
              : size;

  const requestClose = (event) => {
    if (busy) return;
    if (event) event.stopPropagation();
    if (dirty && confirmDirtyMessage) {
      // eslint-disable-next-line no-alert
      const ok = typeof window !== "undefined" ? window.confirm(confirmDirtyMessage) : true;
      if (!ok) return;
    }
    onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, dirty, confirmDirtyMessage, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // footer가 있으면 dialog 자체가 flex column, body만 스크롤되도록 분리.
  // 없으면 기존처럼 dialog 전체가 스크롤 (backward compat).
  const hasFooter = Boolean(footer);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={requestClose}
      role="presentation"
    >
      <div
        aria-labelledby={title ? titleId : undefined}
        aria-modal="true"
        className={`w-full ${sizeClass} rounded-2xl bg-white shadow-2xl ${
          hasFooter
            ? "max-h-[90vh] flex flex-col overflow-hidden"
            : "max-h-[90vh] overflow-y-auto"
        } ${bodyClassName}`}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-black text-slate-950" id={titleId}>{title}</h2>
            {/* ✕ 닫기 버튼 — busy일 때 비활성 (저장 중 우발적 닫힘 방지) */}
            <button
              aria-label="닫기"
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100"
              disabled={busy}
              onClick={() => requestClose(null)}
              type="button"
            >
              ✕
            </button>
          </div>
        ) : null}
        {hasFooter ? (
          <>
            <div className="flex-1 overflow-y-auto">{children}</div>
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}

export default AdminDialog;
