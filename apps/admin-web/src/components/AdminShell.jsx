import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useAdminBadgeCounts, refreshAdminBadgeCounts } from "../lib/useAdminBadgeCounts";
import { adminGuides } from "../lib/adminGuides";
import { resolveAdminLocation } from "../lib/adminMenu";
import { rememberAdminPage } from "../lib/adminRecentPages";
import AdminNavigationPanel from "./AdminNavigationPanel";
import AdminCommandPalette from "./AdminCommandPalette";
import AdminGuideModal from "./AdminGuideModal";
import { ChevronRightIcon, CloseIcon, HelpCircleIcon, MenuIcon, SearchIcon } from "./icons";
import brandLogoImage from "../assets/brand/logo-horizontal.png";
import { BusyText } from "./Loading";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
const SEARCH_SHORTCUT_LABEL = isMac ? "⌘K" : "Ctrl K";

const SUMMARY_TONE_CLASS = {
  warning: "text-amber-600",
  brand: "text-blue-600",
  success: "text-emerald-600",
};

/**
 * 어드민 공통 틀 — 왼쪽 메뉴 + 페이지 제목·탭 + 본문.
 *
 * - 메뉴·탭·제목은 lib/adminMenu.js 한 곳에서 정한다. 메뉴에 직접 걸린 화면은 메뉴 이름을
 *   제목으로 쓰고(사이드바와 제목이 항상 같다), 상세처럼 한 단계 들어간 화면만 title prop을 쓴다.
 * - description prop은 받지만 렌더하지 않는다 (회색 설명 배너는 운영자 요청으로 제거).
 */
function AdminShell({ title, activeModule, actions = null, summaryCards = [], children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const drawerRef = useRef(null);

  const { item, tab, isMenuRoute } = resolveAdminLocation({ pathname: location.pathname, explicitModule: activeModule });
  const tabs = item.tabs ?? [];
  const heading = isMenuRoute ? item.title || item.label : title || item.label;
  const guide = adminGuides[activeModule] ?? adminGuides[tab?.key] ?? adminGuides[item.key] ?? null;
  const rawCounts = useAdminBadgeCounts();
  const counts = {
    ...rawCounts,
    pickups: rawCounts.pickups == null || rawCounts.inspection == null ? null : rawCounts.pickups + rawCounts.inspection,
  };

  useBodyScrollLock(isMobileNavOpen);
  useFocusTrap(drawerRef, isMobileNavOpen);
  useEffect(() => { setIsMobileNavOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setIsMobileNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileNavOpen]);

  // 통합 검색 단축키 (Ctrl+K / ⌘K). 입력 중이어도 열린다.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 브라우저 탭 이름과 통합 검색의 "최근 방문"
  const menuTo = isMenuRoute ? tab?.to || item.to : "";
  useEffect(() => {
    document.title = `${heading} · 수북 관리자`;
    if (menuTo) rememberAdminPage(menuTo);
  }, [heading, menuTo]);

  useEffect(() => {
    let active = true;
    supabase?.auth.getSession().then(({ data }) => {
      if (active) setAccountEmail(data.session?.user?.email ?? "");
    });
    return () => { active = false; };
  }, []);

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

  const logo = (
    <Link className="flex items-center gap-2" to="/admin">
      <img alt="SUBOOK" className="h-[18px] w-auto" src={brandLogoImage} />
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">관리자</span>
    </Link>
  );

  const account = (
    <div className="border-t border-slate-100 px-4 py-3">
      <p className="truncate text-[13px] font-medium text-slate-600" title={accountEmail}>{accountEmail || "관리자 계정"}</p>
      <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-slate-400">
        <button className="hover:text-slate-700 disabled:opacity-50" disabled={isSigningOut} onClick={signOut} type="button">
          {isSigningOut ? <BusyText size={11}>로그아웃 중</BusyText> : "로그아웃"}
        </button>
        <span aria-hidden="true" className="h-3 w-px bg-slate-200" />
        <a className="hover:text-slate-700" href={getSellerLookupOrigin()}>판매자 조회 ↗</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* 데스크톱 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 pb-3.5 pt-5">{logo}</div>
        <div className="px-3 pb-3">
          <button
            aria-haspopup="dialog"
            className="flex h-10 w-full items-center gap-2 rounded-[10px] bg-slate-100 px-3 text-sm text-slate-400 transition-colors hover:bg-slate-200"
            onClick={() => setIsSearchOpen(true)}
            type="button"
          >
            <SearchIcon size={16} />
            <span className="flex-1 text-left">메뉴·주문·회원 검색</span>
            <kbd className="admin-kbd">{SEARCH_SHORTCUT_LABEL}</kbd>
          </button>
        </div>
        <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <AdminNavigationPanel active={item.key} counts={counts} />
        </div>
        {account}
      </aside>

      <div className="lg:pl-60">
        {/* 모바일 상단 바 */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-2 lg:hidden">
          <button
            aria-controls="admin-mobile-nav"
            aria-expanded={isMobileNavOpen}
            aria-label="관리자 메뉴 열기"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setIsMobileNavOpen(true)}
            type="button"
          >
            <MenuIcon size={22} />
          </button>
          {logo}
          <button
            aria-haspopup="dialog"
            aria-label="통합 검색 열기"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setIsSearchOpen(true)}
            type="button"
          >
            <SearchIcon size={20} />
          </button>
        </div>

        <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-9">
          <header>
            {!isMenuRoute && heading !== item.label ? (
              <Link className="mb-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800" to={tab?.to || item.to}>
                {tab?.label || item.label}
                <ChevronRightIcon size={14} />
              </Link>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="text-[22px] font-bold tracking-tight text-slate-900 sm:text-[26px]">{heading}</h1>
                {guide ? (
                  <button
                    aria-label={heading + " 사용 가이드 열기"}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    onClick={() => setIsGuideOpen(true)}
                    title="사용 가이드"
                    type="button"
                  >
                    <HelpCircleIcon size={18} />
                  </button>
                ) : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
          </header>

          {tabs.length ? (
            <nav aria-label={item.label + " 화면"} className="mt-5 flex gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_#e5e8eb]">
              {tabs.map((entry) => (
                <Link
                  aria-current={(tab?.key ?? item.key) === entry.key ? "page" : undefined}
                  className="admin-tab"
                  key={entry.key}
                  to={entry.to}
                >
                  {entry.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {authError ? <p className="notice-error mt-4" role="alert">{authError}</p> : null}
          {rawCounts.error ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800" role="status">
              <span>{rawCounts.error}</span>
              <button className="font-bold underline" onClick={() => void refreshAdminBadgeCounts()} type="button">다시 조회</button>
            </div>
          ) : null}

          {summaryCards.length ? (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {summaryCards.map((card) => {
                const content = (
                  <>
                    <p className="text-[13px] font-medium text-slate-500">{card.label}</p>
                    <p className={`mt-1 whitespace-nowrap text-[clamp(1rem,1.7vw,1.5rem)] font-bold tabular-nums tracking-tight ${SUMMARY_TONE_CLASS[card.tone] || "text-slate-900"}`}>
                      {card.value}
                    </p>
                    {card.hint ? <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">{card.hint}</p> : null}
                  </>
                );
                const cardClass = "min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-4";
                return card.to ? (
                  <Link className={cardClass + " transition-colors hover:border-slate-300 hover:bg-slate-50"} key={card.label} to={card.to}>{content}</Link>
                ) : (
                  <div className={cardClass} key={card.label}>{content}</div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-5 scroll-mt-4 space-y-4" data-admin-content>{children}</div>
        </main>
      </div>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="메뉴 배경 닫기" className="absolute inset-0 bg-slate-900/40" onClick={() => setIsMobileNavOpen(false)} type="button" />
          <aside
            aria-label="관리자 메뉴"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
            id="admin-mobile-nav"
            ref={drawerRef}
            role="dialog"
          >
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              {logo}
              <button
                aria-label="메뉴 닫기"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setIsMobileNavOpen(false)}
                type="button"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              <AdminNavigationPanel active={item.key} counts={counts} onNavigate={() => setIsMobileNavOpen(false)} />
            </div>
            {account}
          </aside>
        </div>
      ) : null}

      <AdminCommandPalette onClose={() => setIsSearchOpen(false)} open={isSearchOpen} />
      <AdminGuideModal guide={guide} onClose={() => setIsGuideOpen(false)} open={isGuideOpen} />
    </div>
  );
}

export default AdminShell;
