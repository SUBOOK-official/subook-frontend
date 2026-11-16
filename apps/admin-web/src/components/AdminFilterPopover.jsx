import { useEffect, useId, useRef, useState } from "react";
import { ChevronUpIcon } from "./icons";

const PANEL_WIDTH = 288; // w-72

/**
 * 필터 한 줄에 놓는 접이식 필터 버튼 (기간·상태 등).
 * 버튼에는 필터 이름과 현재 선택값을 보여주고, 누르면 아래로 선택 패널이 열린다.
 *
 * - valueLabel: 선택값 요약 (예: "11.09 ~ 11.16", "입금대기 외 1"). 없으면 이름만 표시.
 * - active: 필터가 걸려 있으면 true — 버튼을 파랗게 표시해 "지금 걸러 보는 중"임을 알린다.
 * - children: 패널 내용. 함수로 넘기면 { close }를 받아 선택 후 닫을 수 있다.
 * 바깥 클릭·Esc로 닫힌다.
 */
export default function AdminFilterPopover({ label, valueLabel = "", active = false, align = "left", children }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(align === "right");
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-sm font-semibold transition-colors ${
          active
            ? "border-blue-200 bg-blue-50 text-blue-600"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
        onClick={() => {
          // 패널(288px)이 화면 오른쪽을 넘으면 버튼 오른쪽 끝에 맞춰 연다.
          const left = rootRef.current?.getBoundingClientRect().left ?? 0;
          setAlignRight(align === "right" || left + PANEL_WIDTH > window.innerWidth - 16);
          setOpen((value) => !value);
        }}
        ref={buttonRef}
        type="button"
      >
        {label}
        {valueLabel ? <span className="font-medium">{valueLabel}</span> : null}
        <ChevronUpIcon className={open ? "" : "rotate-180"} size={14} />
      </button>
      {open ? (
        <div
          aria-label={label}
          className={`animate-admin-pop absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
          id={panelId}
          role="group"
        >
          {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  );
}
