import { Link } from "react-router-dom";
import { adminNavigationGroups, intakeNavigationGroups } from "./adminNavigation";

// 처리 대기 건수 배지. 조회 전(null)·0건은 표시하지 않는다.
function CountBadge({ count, label }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <span
      aria-label={`${label} ${count}건`}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold tabular-nums text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// 2026-11 개편: 메뉴가 한 화면에 들어오도록 16개로 줄이고, 메뉴 찾기·즐겨찾기·그룹 접기는
// 통합 검색(Ctrl+K)으로 대체했다. 메뉴 구성은 lib/adminMenu.js 한 곳에서 관리한다.
// intakeOnly — 교재 등록 담당 계정이면 상품 등록 메뉴만 보여 준다.
export default function AdminNavigationPanel({ active, counts, onNavigate, intakeOnly = false }) {
  const groups = intakeOnly ? intakeNavigationGroups : adminNavigationGroups;
  return (
    <nav aria-label="관리자 메뉴" className="space-y-3.5">
      {groups.map((group) => (
        <div key={group.key}>
          {group.label ? (
            <p className="px-3 pb-1 text-xs font-semibold text-slate-400">{group.label}</p>
          ) : null}
          <ul>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className="admin-nav-item"
                    onClick={onNavigate}
                    to={item.to}
                  >
                    <Icon size={18} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <CountBadge count={counts[item.key]} label={item.key === "settlements" ? "미지급 원장" : "대기"} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
