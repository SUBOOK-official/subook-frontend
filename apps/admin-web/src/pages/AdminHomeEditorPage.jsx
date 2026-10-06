import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { listContentThemes } from "@shared-supabase/contentThemesClient";
import { listRecommendations } from "@shared-supabase/recommendationsClient";
import { listPromotions } from "@shared-supabase/sitePromotionsClient";
import { getCuratedProductDetails } from "@shared-supabase/curatedContentClient";
import { activePromotions, promotionStatus } from "@shared-domain/sitePromotions";
import AdminShell from "../components/AdminShell";
import AdminQueryState from "../components/AdminQueryState";
import { toKstInput, fromKstInput } from "../lib/adminDateTime";

export default function AdminHomeEditorPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [mobile, setMobile] = useState(true);
  const [at, setAt] = useState(() => toKstInput(new Date()));
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [themes, recommended, hero, promotions] = await Promise.all([listContentThemes(supabase, false), listRecommendations(supabase, false), listRecommendations(supabase, false, "hero"), listPromotions(supabase)]);
      const ids = [...new Set([...recommended, ...hero].map((row) => row.product_id).concat(themes.flatMap((t) => t.product_ids || [])))];
      const products = [];
      for (let offset = 0; offset < ids.length; offset += 100) products.push(...await getCuratedProductDetails(supabase, ids.slice(offset, offset + 100)));
      setState({ loading: false, error: "", data: { themes, recommended, hero, promotions, products: Object.fromEntries(products.map((p) => [p.id,p])) } });
    } catch (error) { setState({ loading: false, error: error.message || "홈 구성을 불러오지 못했습니다.", data: null }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  let previewTime = Date.now();
  try { previewTime = at ? Date.parse(fromKstInput(at)) : Date.now(); } catch { /* 입력 중에는 현재 시각 */ }
  const data = state.data;
  const active = data ? activePromotions(data.promotions, previewTime) : [];
  const unavailableRows = data ? [...data.recommended,...data.hero,...data.themes.filter((t) => t.is_enabled).flatMap((t) => (t.product_ids || []).map((product_id) => ({ product_id, is_enabled: true })))].filter((row) => row.is_enabled && (!data.products[row.product_id] || data.products[row.product_id].is_listed === false || data.products[row.product_id].status !== "selling")) : [];
  const unavailable = [...new Map(unavailableRows.map((row) => [row.product_id, row])).values()];
  const productTiles = (rows) => rows.filter((r) => r.is_enabled && data.products[r.product_id]?.is_listed !== false && data.products[r.product_id]?.status === "selling").slice(0,8).map((row) => {
    const product = data.products[row.product_id];
    return <Link key={row.product_id} to={`/admin/products?product=${row.product_id}`} className="min-w-0"><div className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-50">{product?.cover_image_url ? <img loading="lazy" src={product.cover_image_url} alt="" className="h-full w-full object-contain p-2" /> : null}</div><p className="mt-2 line-clamp-2 text-xs font-semibold">{product?.title || `삭제된 교재 #${row.product_id}`}</p>{row.headline ? <p className="mt-1 text-[11px] text-slate-500">{row.headline}</p> : null}</Link>;
  });
  return <AdminShell title="홈 편집" activeModule="home-editor" actions={<button type="button" className="btn-secondary !py-2 text-xs" onClick={load} disabled={state.loading}>새로고침</button>}>
    <div className="flex flex-wrap items-center gap-3"><div className="flex rounded-lg border border-slate-200 bg-white p-1">{[[true,"모바일"],[false,"PC"]].map(([value,label]) => <button type="button" key={label} className={`rounded-md px-4 py-2 text-xs font-bold ${mobile === value ? "bg-slate-900 text-white" : "text-slate-500"}`} onClick={() => setMobile(value)}>{label}</button>)}</div><label className="flex items-center gap-2 text-xs font-semibold">미리 볼 시각 (KST)<input type="datetime-local" className="min-w-0 max-w-full rounded-lg border border-slate-200 px-2 py-2" value={at} onChange={(e) => setAt(e.target.value)} /></label><p className="text-xs text-slate-500">저장된 설정의 구성 미리보기 · 판매 가능한 교재 최대 8종</p></div>
    <AdminQueryState loading={state.loading} error={state.error} onRetry={load}>
      {data ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-6"><div className={`mx-auto space-y-6 rounded-xl bg-white p-4 shadow-sm ${mobile ? "max-w-[390px]" : "w-full"}`}>
          <div className="border-b border-slate-100 pb-3 text-lg font-black tracking-tight">수북 <span className="float-right text-xs font-normal text-slate-400">교재 찾기</span></div>
          {active.filter((p) => p.placement === "home_hero").map((p) => <Link key={p.id} to="/admin/promotions"><img src={mobile ? p.mobile_image_url || p.image_url : p.image_url} alt={p.alt_text} className="w-full rounded-xl" /></Link>)}
          {data.hero.some((r) => r.is_enabled) ? <section><h2 className="mb-3 text-sm font-bold">홈 배너 교재</h2><div className={`grid gap-3 ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>{productTiles(data.hero)}</div></section> : null}
          <section><div className="flex gap-4 overflow-x-auto">{data.themes.filter((t) => t.is_enabled).map((theme) => <Link key={theme.id} to="/admin/themes" className="w-16 shrink-0 text-center"><img src={theme.image_url} alt="" className="h-16 w-16 rounded-full object-cover" /><p className="mt-2 text-[11px] font-semibold">{theme.title}</p></Link>)}</div></section>
          <section><h2 className="mb-3 text-sm font-bold">추천 교재</h2><div className={`grid gap-3 ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>{productTiles(data.recommended)}</div></section>
          {active.filter((p) => p.placement === "home_popup").map((p) => <section key={p.id} className="rounded-xl border border-dashed border-slate-300 p-3"><p className="mb-2 text-xs font-semibold text-slate-500">팝업 미리보기</p><img src={mobile ? p.mobile_image_url || p.image_url : p.image_url} alt={p.alt_text} className="w-full rounded-lg" /></section>)}
        </div></div>
        <aside className="space-y-4"><div className="card max-h-[32rem] overflow-y-auto"><h2 className="text-sm font-bold">노출 확인</h2><p className="mt-3 text-xs text-slate-600">상태 확인이 필요한 연결 교재 {unavailable.length}종</p>{unavailable.map((row,i) => <Link key={`${row.product_id}-${i}`} to={`/admin/products?product=${row.product_id}`} className="mt-2 block text-xs text-amber-700">{data.products[row.product_id]?.title || `#${row.product_id}`} · 상태 확인 ↗</Link>)}{active.filter((p) => p.placement === "home_popup").length > 1 ? <p className="mt-3 text-xs font-semibold text-amber-700">동시에 활성인 팝업이 여러 개입니다. 노출 순서를 확인하세요.</p> : null}</div><div className="card"><h2 className="text-sm font-bold">배너·팝업 일정</h2>{data.promotions.map((p) => <Link key={p.id} to="/admin/promotions" className="mt-3 block border-t border-slate-100 pt-3 text-xs"><span className="font-semibold">{p.title}</span><span className="float-right text-slate-500">{promotionStatus(p,previewTime)}</span><p className="mt-1 text-slate-400">{toKstInput(p.starts_at).replace("T"," ") || "즉시"} ~ {toKstInput(p.ends_at).replace("T"," ") || "무기한"}</p></Link>)}</div></aside>
      </div> : null}
    </AdminQueryState>
  </AdminShell>;
}
