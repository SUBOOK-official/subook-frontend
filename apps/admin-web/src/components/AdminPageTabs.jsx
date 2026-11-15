import { Link } from "react-router-dom";

// 페이지 안에서 업무를 나누는 전환 버튼 (수거 신청 / 검수 작업, 미지급 / 지급 완료 등).
// 메뉴 단위의 화면 전환은 AdminShell 상단 탭(lib/adminMenu.js)이 맡고,
// 이 컴포넌트는 한 화면 안의 보기 전환에 쓴다.
// tab.to가 있으면 라우트 링크, 없으면 onSelect 콜백.
function AdminPageTabs({ tabs, activeKey, onSelect }) {
  const baseClass = "inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors";
  const activeClass = "bg-white text-slate-900 shadow";
  const idleClass = "text-slate-500 hover:text-slate-800";

  return (
    <div className="inline-flex flex-wrap gap-1 self-start rounded-xl bg-slate-200/70 p-1" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const hintNode = tab.hint ? (
          <span className={`ml-2 hidden text-xs font-medium sm:inline ${isActive ? "text-slate-500" : "text-slate-400"}`}>
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
