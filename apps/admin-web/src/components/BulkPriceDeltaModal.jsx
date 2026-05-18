import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

const MIN_PERCENT = -50;
const MAX_PERCENT = 50;

function formatKrw(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function BulkPriceDeltaModal({ open, books, selectedIds, busy = false, onCancel, onConfirm }) {
  const [percentInput, setPercentInput] = useState("");
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (open) {
      setPercentInput("");
      window.setTimeout(() => inputRef.current?.focus(), 50);
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

  const trimmed = percentInput.trim().replace(/[%＋]/g, "");
  const num = Number(trimmed);
  const isNumber = trimmed.length > 0 && Number.isFinite(num);
  const inRange = isNumber && num >= MIN_PERCENT && num <= MAX_PERCENT;
  const isNonZero = isNumber && num !== 0;
  const canConfirm = isNumber && inRange && isNonZero && !busy;

  const selectedBooks = useMemo(() => {
    if (!open) return [];
    const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    return (Array.isArray(books) ? books : []).filter((book) => idSet.has(book.id));
  }, [open, books, selectedIds]);

  const previewBooks = selectedBooks.slice(0, 3);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(num);
  };

  if (!open) return null;

  const errorMessage = !isNumber
    ? null
    : !inRange
      ? `한 번에 변경 가능한 범위는 ${MIN_PERCENT}% ~ ${MAX_PERCENT}% 입니다.`
      : !isNonZero
        ? "0%는 변경 효과가 없습니다."
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="text-lg font-black text-slate-900">
          일괄 가격 변경 — {selectedBooks.length}권
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          선택한 책의 가격을 일정 비율로 인상/할인합니다.
          <br />
          예: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">-10</code> = 10% 할인,{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">+5</code> = 5% 인상
        </p>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          <span>
            변동 비율 ({MIN_PERCENT} ~ {MAX_PERCENT}%, 0 제외)
          </span>
          <input
            autoComplete="off"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
            disabled={busy}
            inputMode="decimal"
            onChange={(event) => setPercentInput(event.target.value)}
            placeholder="-10 또는 +5"
            ref={inputRef}
            type="text"
            value={percentInput}
          />
        </label>

        {errorMessage ? (
          <p className="mt-2 text-xs font-semibold text-rose-600">{errorMessage}</p>
        ) : null}

        {canConfirm && previewBooks.length > 0 ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">
              미리보기 — 처음 {previewBooks.length}권
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {previewBooks.map((book) => {
                const before = Number(book.price) || 0;
                const after = Math.round(before * (1 + num / 100));
                return (
                  <li key={book.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{book.title || `book#${book.id}`}</span>
                    <span className="whitespace-nowrap font-mono">
                      {formatKrw(before)} → <span className="font-bold text-slate-900">{formatKrw(after)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {selectedBooks.length > previewBooks.length ? (
              <p className="mt-2 text-xs text-slate-500">
                ... 외 {selectedBooks.length - previewBooks.length}권
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canConfirm}
            onClick={handleConfirm}
            type="button"
          >
            {busy ? "처리 중..." : `${num > 0 ? "+" : ""}${num}% 적용`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkPriceDeltaModal;
