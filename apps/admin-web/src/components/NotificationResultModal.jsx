import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";

/**
 * 알림톡 발송 결과를 사용자에게 보여주는 모달.
 *
 * - `failures` 배열의 각 항목은 `{ id, label, error, retry }`를 가진다.
 *   - `retry`는 옵션이며, 함수면 "재전송" 버튼이 표시된다.
 * - 성공 건수와 실패 건수를 분리해서 노출하고, 실패 건만 따로 확인·재전송할 수 있다.
 */
function NotificationResultModal({
  open,
  successCount = 0,
  failures = [],
  title = "알림톡 발송 결과",
  onClose,
  onRetry,
  busy = false,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape" && !busy) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const hasFailures = failures.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="text-lg font-black text-slate-950" id={titleId}>{title}</h2>
        <p className="mt-2 text-sm text-slate-700">
          성공{" "}
          <strong className="font-bold text-emerald-700">{successCount}건</strong>
          {hasFailures ? (
            <>
              {" · "}
              <strong className="font-bold text-rose-700">실패 {failures.length}건</strong>
            </>
          ) : null}
        </p>

        {hasFailures ? (
          <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50/40 p-3">
            <p className="text-xs font-bold text-rose-700">아래 대상자에게 알림톡 발송이 실패했습니다.</p>
            <ul className="mt-2 space-y-2 text-xs text-slate-800">
              {failures.map((failure) => (
                <li
                  className="flex flex-col gap-1 rounded-md border border-rose-100 bg-white p-2"
                  key={failure.id}
                >
                  <span className="font-semibold text-slate-900">{failure.label}</span>
                  {failure.error ? (
                    <span className="text-[11px] font-medium text-rose-600">{failure.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
            모든 대상자에게 알림톡이 정상 발송되었습니다.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {hasFailures && onRetry ? (
            <button
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={onRetry}
              type="button"
            >
              {busy ? "재전송 중..." : `실패 ${failures.length}건 재전송`}
            </button>
          ) : null}
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default NotificationResultModal;
