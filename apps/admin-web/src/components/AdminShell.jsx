import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useAdminBadgeCounts, refreshAdminBadgeCounts } from "../lib/useAdminBadgeCounts";
import { adminGuides } from "../lib/adminGuides";
import { resolveActiveAdminModule } from "./adminNavigation";
import AdminNavigationPanel from "./AdminNavigationPanel";
import AdminGuideModal from "./AdminGuideModal";
import { HelpCircleIcon, MenuIcon } from "./icons";
import brandLogoImage from "../assets/brand/logo-horizontal.png";
import { BusyText } from "./Loading";

// 회색 설명 배너는 운영자 요청에 따라 렌더하지 않는다.
function AdminShell({ title, activeModule, actions = null, summaryCards = [], children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const drawerRef = useRef(null);
  const resolvedModuleKey = resolveActiveAdminModule({ pathname: location.pathname, explicitModule: activeModule });
  const guide = adminGuides[activeModule] ?? adminGuides[resolvedModuleKey] ?? null;
  const rawCounts = useAdminBadgeCounts();
  const counts = { ...rawCounts, pickups: rawCounts.pickups == null || rawCounts.inspection == null ? null : rawCounts.pickups + rawCounts.inspection };

  useBodyScrollLock(isMobileNavOpen);
  useFocusTrap(drawerRef, isMobileNavOpen);
  useEffect(() => { setIsMobileNavOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setIsMobileNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileNavOpen]);

  const scrollParams = new URLSearchParams(location.search);
  ["detail", "product", "member", "case"].forEach((key) => scrollParams.delete(key));
  const scrollKey = location.pathname + "?" + scrollParams.toString();
  // 상세에서 목록으로 돌아오면 목록 데이터가 로드된 뒤 기존 위치를 복원한다.
  useEffect(() => {
    const key = "subook.admin.scroll." + scrollKey;
    let previous = 0;
    try { previous = Number(sessionStorage.getItem(key)) || 0; } catch { /* 저장 차단 */ }
    let restored = previous === 0;
    const restore = () => {
      if (!restored && document.documentElement.scrollHeight >= previous + window.innerHeight) {
        window.scrollTo(0, previous); restored = true;
      }
    };
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const stopRestoring = () => { restored = true; };
    const savePosition = () => { if (restored) { try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* 저장 차단 */ } } };
    window.addEventListener("scroll", savePosition, { passive: true });
    window.addEventListener("wheel", stopRestoring, { passive: true });
    window.addEventListener("touchstart", stopRestoring, { passive: true });
    if (!previous) window.scrollTo(0, 0);
    restore();
    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("touchstart", stopRestoring);
      window.removeEventListener("scroll", savePosition);
    };
  }, [scrollKey]);

  async function signOut() {
    setIsSigningOut(true);
    setAuthError("");
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      navigate("/admin/login", { replace: true });
    } catch { setAuthError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
    finally { setIsSigningOut(false); }
  }
  const logo = <Link to="/admin" className="mb-5 flex items-center gap-3 px-2"><img alt="SUBOOK" className="h-4 w-auto" src={brandLogoImage} /><span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">운영</span></Link>;
  const homeTabs = [
    ["/admin/home-editor", "미리보기"], ["/admin/themes", "테마관"], ["/admin/recommendations", "추천 교재"], ["/admin/promotions", "배너·팝업"],
  ];
  return <main className="app-shell-admin">
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:flex-col lg:self-start rounded-xl border border-slate-200 bg-white px-3 py-5">
        {logo}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><AdminNavigationPanel active={resolvedModuleKey} counts={counts} /></div>
        <a href={getSellerLookupOrigin()} className="mt-4 border-t border-slate-100 px-3 pt-4 text-xs font-semibold text-slate-500">판매자 조회 ↗</a>
      </aside>
      <div className="min-w-0 space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button aria-controls="admin-mobile-nav" aria-expanded={isMobileNavOpen} aria-label="관리자 메뉴 열기" className="rounded-lg p-2 text-slate-600 lg:hidden" onClick={() => setIsMobileNavOpen(true)} type="button"><MenuIcon size={20} /></button>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
              {guide ? <button aria-label={title + " 사용 가이드 열기"} className="p-1 text-slate-400 hover:text-slate-700" onClick={() => setIsGuideOpen(true)} type="button"><HelpCircleIcon size={16} /></button> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <button className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 disabled:opacity-50" disabled={isSigningOut} onClick={signOut} type="button">{isSigningOut ? <BusyText>로그아웃 중</BusyText> : "로그아웃"}</button>
            </div>
          </div>
          {summaryCards.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {summaryCards.map((card) => {
              const content = <><p className="text-[11px] font-semibold text-slate-500">{card.label}</p><p className="mt-1 whitespace-nowrap text-[clamp(0.875rem,1.6vw,1.375rem)] font-bold tabular-nums text-slate-900">{card.value}</p>{card.hint ? <p className="mt-1 hidden text-[11px] text-slate-400 sm:block">{card.hint}</p> : null}</>;
              const cls = "min-w-0 rounded-lg border px-3 py-2.5 " + (card.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50/70");
              return card.to ? <Link key={card.label} to={card.to} className={cls + " hover:border-brand/40"}>{content}</Link> : <div key={card.label} className={cls}>{content}</div>;
            })}
          </div> : null}
        </header>
        {authError ? <p role="alert" className="notice-error">{authError}</p> : null}
        {rawCounts.error ? <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"><span>{rawCounts.error}</span><button type="button" className="font-bold underline" onClick={() => void refreshAdminBadgeCounts()}>다시 조회</button></div> : null}
        {resolvedModuleKey === "home-editor" ? <nav aria-label="홈 편집" className="flex gap-1 overflow-x-auto border-b border-slate-200">{homeTabs.map(([to, label]) => <Link className={"whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold " + (location.pathname === to ? "border-brand text-brand" : "border-transparent text-slate-500")} key={to} to={to}>{label}</Link>)}</nav> : null}
        {["performance", "analytics"].includes(resolvedModuleKey) ? <nav aria-label="성과 분석" className="flex border-b border-slate-200">{[["/admin/performance", "매출·유입·광고"], ["/admin/analytics", "운영 분석"]].map(([to,label]) => <Link key={to} to={to} className={"border-b-2 px-4 py-3 text-sm font-semibold " + (location.pathname === to ? "border-brand text-brand" : "border-transparent text-slate-500")}>{label}</Link>)}</nav> : null}
        <div className="space-y-4 scroll-mt-4" data-admin-content>{children}</div>
      </div>
    </div>
    {isMobileNavOpen ? <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="메뉴 배경 닫기" className="absolute inset-0 bg-slate-950/40" onClick={() => setIsMobileNavOpen(false)} />
      <aside aria-label="관리자 메뉴" aria-modal="true" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-xl" id="admin-mobile-nav" ref={drawerRef} role="dialog">
        <div className="flex justify-end"><button aria-label="메뉴 닫기" className="p-2 text-xl" onClick={() => setIsMobileNavOpen(false)} type="button">×</button></div>{logo}
        <AdminNavigationPanel active={resolvedModuleKey} counts={counts} onNavigate={() => setIsMobileNavOpen(false)} />
      </aside>
    </div> : null}
    <AdminGuideModal guide={guide} onClose={() => setIsGuideOpen(false)} open={isGuideOpen} />
  </main>;
}
export default AdminShell;
