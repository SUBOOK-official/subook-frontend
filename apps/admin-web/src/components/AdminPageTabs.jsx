import { Link } from "react-router-dom";

// R1 IA 개편: 페이지 내 업무 탭 공용 컴포넌트.
// 수거·검수 / 정산·식스샵 수동 / 회원·탈퇴 사유처럼 "한 업무의 두 얼굴"을
// 사이드바 메뉴 2개 대신 페이지 상단 탭으로 묶는다.
// tab.to가 있으면 라우트 링크(페이지 간 탭), 없으면 onSelect 콜백(페이지 내 탭).
function AdminPageTabs({ tabs, activeKey, onSelect }) {
  const baseClass = "rounded-lg px-4 py-2 text-sm font-bold transition";
  const activeClass = "bg-slate-950 text-white";
  const idleClass = "text-slate-600 hover:bg-slate-100";

  return (
    <div
      className="inline-flex flex-wrap gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const hintNode = tab.hint ? (
          <span
            className={`ml-2 text-xs font-semibold ${isActive ? "text-white/70" : "text-slate-400"}`}
          >
            {tab.hint}
          </span>
        ) : null;

        if (tab.to) {
          return (
            <Link
              aria-selected={isActive}
              className={`${baseClass} ${isActive ? activeClass : idleClass}`}
              key={tab.key}
              role="tab"
              to={tab.to}
            >
              {tab.label}
              {hintNode}
            </Link>
          );
        }

        return (
          <button
            aria-selected={isActive}
            className={`${baseClass} ${isActive ? activeClass : idleClass}`}
            key={tab.key}
            onClick={() => onSelect?.(tab.key)}
            role="tab"
            type="button"
          >
            {tab.label}
            {hintNode}
          </button>
        );
      })}
    </div>
  );
}

export default AdminPageTabs;
