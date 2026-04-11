import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { adminNavigationItems, resolveActiveAdminModule } from "./adminNavigation";

function AdminShell({ title, description = "", activeModule, actions = null, summaryCards = [], children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const resolvedModuleKey = resolveActiveAdminModule({
    pathname: location.pathname,
    explicitModule: activeModule,
  });

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
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">SUBOOK</p>
            <p className="mt-1 text-lg font-black text-slate-950">관리자</p>
          </div>

          <nav className="space-y-1" aria-label="관리자 메뉴">
            {adminNavigationItems.map((item) => {
              const isActive = item.key === resolvedModuleKey;

              return (
                <Link
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  key={item.key}
                  to={item.to}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
                {description ? (
                  <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {actions}
                <a className="btn-secondary !w-auto !px-3 !py-2 text-xs" href={sellerPortalUrl}>
                  판매자 조회
                </a>
                <button
                  className="btn-secondary !w-auto !px-3 !py-2 text-xs"
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
    </main>
  );
}

export default AdminShell;
