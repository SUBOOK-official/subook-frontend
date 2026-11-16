// 목록 화면의 "업무 보기" 전환 — 입금 확인 / 출고 대기 / 환불·반품처럼
// 운영자가 처리할 묶음을 한 줄로 고른다. 건수(count)를 주면 이름 옆에 표시한다.
//
// tabs: [{ key, label, count?, tone? }]
//   - count: 숫자면 표시, 조회 전(undefined/null)이면 숨김
//   - tone: "work"(처리할 일 — 0보다 크면 파랑), "danger"(환불 등 — 0보다 크면 빨강)
// 메뉴 단위 화면 전환은 AdminShell 상단 탭, 한 화면 안 보기 전환은 AdminPageTabs가 맡는다.
const COUNT_TONE = {
  work: "text-blue-600",
  danger: "text-rose-500",
};

export default function AdminViewTabs({ tabs, activeKey, onSelect, label = "업무 보기" }) {
  return (
    <div
      aria-label={label}
      className="admin-no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      role="group"
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const hasCount = Number.isFinite(tab.count);
        const countClass = active
          ? "text-white/70"
          : hasCount && tab.count > 0 && COUNT_TONE[tab.tone]
            ? COUNT_TONE[tab.tone]
            : "text-slate-400";
        return (
          <button
            aria-pressed={active}
            className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            type="button"
          >
            {tab.label}
            {hasCount ? <span className={`tabular-nums ${countClass}`}>{tab.count.toLocaleString("ko-KR")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
