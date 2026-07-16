import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useAdminBadgeCounts } from "../lib/useAdminBadgeCounts";
import { adminNavigationGroups, resolveActiveAdminModule } from "./adminNavigation";
import { MenuIcon } from "./icons";
import brandLogoImage from "../assets/brand/logo-horizontal.png";

function formatBadgeValue(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 99) return "99+";
  return String(value);
}

function NavList({ groups, resolvedModuleKey, badgeCounts, onItemClick }) {
  return (
    <nav className="space-y-3" aria-label="관리자 메뉴">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          {group.label ? (
            <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const isActive = item.key === resolvedModuleKey;
            const badgeValue = formatBadgeValue(badgeCounts[item.key]);
            // adminNavigation.js가 아이콘을 컴포넌트 참조로 제공 (이모지 문자열 폐지)
            const ItemIcon = item.icon;
            return (
              <Link
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                key={item.key}
                onClick={onItemClick}
                to={item.to}
              >
                <span aria-hidden="true" className="leading-none">
                  {ItemIcon ? <ItemIcon size={16} /> : null}
                </span>
                <span className="flex-1">{item.label}</span>
                {badgeValue ? (
                  <span
                    aria-label={`처리 대기 ${badgeValue}건`}
                    className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-rose-600 text-white"
                    }`}
                  >
                    {badgeValue}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AdminShell({ title, description = "", activeModule, actions = null, summaryCards = [], children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const drawerRef = useRef(null);

  const resolvedModuleKey = resolveActiveAdminModule({
    pathname: location.pathname,
    explicitModule: activeModule,
  });

  const rawBadgeCounts = useAdminBadgeCounts();
  // 수거·검수 통합 메뉴: 신청 대기(pickups) + 검수 대기(inspection)를 한 배지로 합산
  const badgeCounts = {
    ...rawBadgeCounts,
    pickups: (rawBadgeCounts.pickups ?? 0) + (rawBadgeCounts.inspection ?? 0),
  };

  // 라우트 바뀌면 모바일 메뉴 자동 닫힘
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  // 모바일 메뉴 열려있을 때만 body lock
  useBodyScrollLock(isMobileNavOpen);

  // ESC 키로 모바일 메뉴 닫기
  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setIsMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMobileNavOpen]);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured || !supabase) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    navigate("/admin/login", { replace: true });
  };

  return (
    <main className="app-shell-admin">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* 데스크탑 sticky 사이드바 */}
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:block lg:self-start">
          <div className="mb-5">
            <img alt="SUBOOK" className="h-4 w-auto" src={brandLogoImage} />
            <p className="mt-1 text-lg font-black text-slate-950">관리자</p>
          </div>
          <NavList
            badgeCounts={badgeCounts}
            groups={adminNavigationGroups}
            resolvedModuleKey={resolvedModuleKey}
          />
        </aside>

        <div className="min-w-0 space-y-5">
          <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* 모바일 햄버거 — lg 미만에서만 노출 */}
                <button
                  aria-controls="admin-mobile-nav"
                  aria-expanded={isMobileNavOpen}
                  aria-label="관리자 메뉴 열기"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-700 transition hover:bg-slate-50 lg:hidden"
                  onClick={() => setIsMobileNavOpen(true)}
                  type="button"
                >
                  <span aria-hidden="true"><MenuIcon size={20} /></span>
                </button>
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
                  {description ? (
                    <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* 알림톡/SMS 발송 실패 경고 — 클릭 시 알림 로그(실패 필터)로 이동.
                    24시간 창이라 해소되면 자동으로 사라짐. */}
                {formatBadgeValue(badgeCounts.failedNotifications) ? (
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                    title="최근 24시간 알림톡/SMS 발송 실패 건수 — 클릭해서 로그 확인"
                    to="/admin/notification-logs?status=failed"
                  >
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                    알림 발송 실패 {formatBadgeValue(badgeCounts.failedNotifications)}건
                  </Link>
                ) : null}
                {actions}
                <a className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" href={sellerPortalUrl}>
                  판매자 조회
                </a>
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                  type="button"
                >
                  {isSigningOut ? "로그아웃 중..." : "로그아웃"}
                </button>
              </div>
            </div>

            {summaryCards.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" key={card.label}>
                    <p className="text-xs font-bold text-slate-500">{card.label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{card.value}</p>
                    {card.hint ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">{card.hint}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </header>

          <div className="space-y-5">{children}</div>
        </div>
      </div>

      {/* 모바일 드로어 — lg 미만에서만 활성 */}
      {isMobileNavOpen ? (
        <div
          aria-hidden={!isMobileNavOpen}
          className="fixed inset-0 z-50 lg:hidden"
          role="presentation"
        >
          <div
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setIsMobileNavOpen(false)}
            role="button"
            tabIndex={-1}
          />
          <aside
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-2xl"
            id="admin-mobile-nav"
            ref={drawerRef}
            role="dialog"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <img alt="SUBOOK" className="h-4 w-auto" src={brandLogoImage} />
                <p className="mt-1 text-lg font-black text-slate-950">관리자</p>
              </div>
              <button
                aria-label="메뉴 닫기"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-slate-100"
                onClick={() => setIsMobileNavOpen(false)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <NavList
              badgeCounts={badgeCounts}
              groups={adminNavigationGroups}
              onItemClick={() => setIsMobileNavOpen(false)}
              resolvedModuleKey={resolvedModuleKey}
            />
          </aside>
        </div>
      ) : null}
    </main>
  );
}

export default AdminShell;
