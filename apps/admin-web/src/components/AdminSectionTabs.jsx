import { Link, useLocation } from "react-router-dom";
import { useAdminStudio } from "../contexts/AdminStudioContext";

function getTabClass(isActive) {
  return `inline-flex rounded-xl px-4 py-2 text-sm font-bold transition ${
    isActive
      ? "bg-brand text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

function AdminSectionTabs() {
  const { pathname } = useLocation();
  const { summary, isGenerating } = useAdminStudio();
  const isShipmentMenu = pathname === "/admin" || pathname.startsWith("/admin/shipments/");
  const isStudioMenu = pathname === "/admin/studio" || pathname.startsWith("/admin/studio/");
  const runningCount = summary.queued + summary.processing;

  return (
    <nav
      aria-label="관리자 메뉴"
      className="mb-5 flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/85 p-1.5 shadow-soft"
    >
      <Link className={getTabClass(isShipmentMenu)} to="/admin">
        수거 등록/관리
      </Link>
      <Link className={getTabClass(isStudioMenu)} to="/admin/studio">
        사진 스튜디오
        {isGenerating && runningCount > 0 ? (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-black ${
              isStudioMenu ? "bg-white/20 text-inherit" : "bg-sky-100 text-sky-700"
            }`}
          >
            {runningCount}
          </span>
        ) : null}
      </Link>
    </nav>
  );
}

export default AdminSectionTabs;
