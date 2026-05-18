import { useEffect, useRef, useState } from "react";

function DestructiveConfirmModal({
  open,
  title,
  description,
  confirmPhrase,
  reasonRequired = false,
  reasonMinLength = 1,
  reasonPlaceholder = "사유를 입력하세요",
  confirmLabel = "진행",
  cancelLabel = "취소",
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [phraseInput, setPhraseInput] = useState("");
  const [reason, setReason] = useState("");
  const phraseRef = useRef(null);

  useEffect(() => {
    if (open) {
      setPhraseInput("");
      setReason("");
      window.setTimeout(() => phraseRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phraseOk = !confirmPhrase || phraseInput.trim() === confirmPhrase;
  const reasonOk = !reasonRequired || reason.trim().length >= reasonMinLength;
  const canConfirm = phraseOk && reasonOk && !busy;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(reasonRequired ? reason.trim() : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-black text-rose-700">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{description}</p>

        {confirmPhrase ? (
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            <span>
              계속하려면{" "}
              <code className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-rose-700">
                {confirmPhrase}
              </code>{" "}
              을(를) 정확히 입력하세요.
            </span>
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-rose-500 focus:outline-none"
              disabled={busy}
              onChange={(event) => setPhraseInput(event.target.value)}
              ref={phraseRef}
              type="text"
              value={phraseInput}
            />
          </label>
        ) : null}

        {reasonRequired ? (
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            <span>사유 (최소 {reasonMinLength}자)</span>
            <textarea
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              value={reason}
            />
          </label>
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
            {busy ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DestructiveConfirmModal;
