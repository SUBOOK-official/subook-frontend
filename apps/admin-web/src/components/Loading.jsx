import { createPortal } from "react-dom";

/**
 * 어드민 공통 로딩 표시.
 *
 * 이전에는 "처리 중...", "불러오는 중..." 같은 텍스트만 바뀌어서 정말 도는 중인지,
 * 아니면 그냥 멈춘 건지 구분이 안 됐다. 실제로 회전하는 스피너를 항상 함께 보여준다.
 *
 * - Spinner: currentColor를 쓰므로 버튼/문구 색을 그대로 따라간다 (색 하드코딩 금지).
 * - BusyText: 버튼 라벨용. `{busy ? <BusyText>저장 중...</BusyText> : "저장"}`
 * - InlineLoading: 목록·카드 영역의 "불러오는 중..." 자리.
 * - LoadingOverlay: 화면 전체를 덮는 처리 중 표시. 여러 건을 순차 처리하거나(대량 작업)
 *   외부 API(CJ·엑셀 생성)를 기다려 수 초 이상 걸리는 작업에만 쓴다.
 *   1~2초짜리 단건 작업은 버튼 스피너로 충분하다 — 남발하면 오히려 화면이 답답해진다.
 *
 * ⚠ prefers-reduced-motion에서는 회전이 멈춘다(index.css 전역 규칙). 그래서 스피너만
 *   두지 않고 항상 텍스트를 같이 남긴다 — 움직임 없이도 의미가 전달돼야 한다.
 */
export function Spinner({ size = 14, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`animate-spin shrink-0 ${className}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}

export function BusyText({ children, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner size={size} />
      {children}
    </span>
  );
}

export function InlineLoading({ label = "불러오는 중...", size = 16 }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Spinner size={size} />
      <span>{label}</span>
    </span>
  );
}

export function LoadingOverlay({ open, message = "처리 중입니다...", detail = null }) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  // 모달(z-50)·라벨 인쇄 모달(z-100) 위에 떠야 한다.
  return createPortal(
    <div
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]"
      role="status"
    >
      <div className="flex min-w-[240px] max-w-[380px] flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 text-center shadow-2xl">
        <Spinner className="text-brand" size={36} />
        <p className="text-sm font-bold text-slate-900">{message}</p>
        {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
        <p className="text-[11px] text-slate-400">창을 닫지 마세요</p>
      </div>
    </div>,
    document.body,
  );
}

export default Spinner;
