import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { BusyText } from "./Loading";

// 예/아니오 재확인 모달 (+ 필요 시 사유 입력).
// 과거에는 "확인 문구를 정확히 입력" 타이핑을 요구했으나, 매 작업마다 단어를 치게 해
// 운영이 불편하다는 피드백이 많아 제거함. 이제 확인/취소(예/아니오)만으로 진행한다.
// reasonRequired인 경우(환불·차단·폐기 등)는 기록·분쟁 대응용 사유 입력만 유지.
// confirmPhrase prop은 호출부 하위호환을 위해 받기만 하고 무시한다.
function DestructiveConfirmModal({
  open,
  title,
  description,
  reasonRequired = false,
  reasonMinLength = 1,
  reasonPlaceholder = "사유를 입력하세요",
  reasonPresets = null,
  confirmLabel = "진행",
  cancelLabel = "취소",
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const reasonRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const reasonId = useId();

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setReason("");
      // 사유 입력이 있으면 거기로 포커스, 없으면 포커스트랩이 취소 버튼(첫 포커서블)으로 둔다.
      if (reasonRequired) {
        window.setTimeout(() => reasonRef.current?.focus(), 50);
      }
    }
  }, [open, reasonRequired]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const reasonOk = !reasonRequired || reason.trim().length >= reasonMinLength;
  const canConfirm = reasonOk && !busy;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(reasonRequired ? reason.trim() : undefined);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="text-lg font-black text-rose-700" id={titleId}>{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{description}</p>

        {reasonRequired ? (
          <div className="mt-4">
            <label className="block text-sm font-semibold text-slate-700" htmlFor={reasonId}>
              사유 (최소 {reasonMinLength}자)
            </label>
            {/* 자주 쓰는 사유는 한 번에 채운다 — 반복 입력(폐기 등) 부담 완화 */}
            {Array.isArray(reasonPresets) && reasonPresets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reasonPresets.map((preset) => (
                  <button
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                      reason.trim() === preset
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                    disabled={busy}
                    key={preset}
                    onClick={() => setReason(preset)}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
              disabled={busy}
              id={reasonId}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              ref={reasonRef}
              rows={3}
              value={reason}
            />
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canConfirm}
            onClick={handleConfirm}
            type="button"
          >
            {busy ? <BusyText>처리 중...</BusyText> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default DestructiveConfirmModal;
