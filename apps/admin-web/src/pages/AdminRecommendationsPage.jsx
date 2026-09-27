import { useEffect, useState } from "react";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { listRecommendations, saveRecommendation } from "@shared-supabase/recommendationsClient";
import { getCuratedProductDetails, searchCuratedProducts } from "@shared-supabase/curatedContentClient";

const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = "shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export default function AdminRecommendationsPage() {
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(null);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState({});
  const load = async () => {
    setLoading(true); setError("");
    try {
      const items = await listRecommendations(supabase, false);
      if (items.length) {
        const products = [];
        for (let offset = 0; offset < items.length; offset += 100) {
          products.push(...await getCuratedProductDetails(supabase, items.slice(offset, offset + 100).map((item) => item.product_id)));
        }
        setDetails(Object.fromEntries(products.map((product) => [product.id, product])));
      }
      setRows(items);
    }
    catch { setError("추천 설정을 불러오지 못했습니다. DB 마이그레이션과 관리자 권한을 확인해주세요."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  async function search(event) {
    event.preventDefault(); if (query.trim().length < 2) return; setBusy(true); setError(""); setNotice("");
    try {
      const data = await searchCuratedProducts(supabase, query);
      setProducts(data ?? []);
      if (!data?.length) setNotice("검색 결과가 없습니다.");
    } catch (failure) { setError(failure.message || "상품 검색에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function save(row) {
    setBusy(true); setError(""); setNotice("");
    try {
      await saveRecommendation(supabase, row);
      setEditor(null); await load(); setNotice("추천 교재 설정을 저장했습니다.");
    } catch (failure) { setError(failure.message || "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <AdminShell activeModule="recommendations" title="추천 교재 관리" description="낮은 순서부터 추천순과 홈 자동 배너에 표시합니다. 품절·비공개 상품은 고객 화면에서 제외합니다.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="group" aria-label="추천 노출 필터">{[["all", "전체"], ["enabled", "노출 중"], ["disabled", "비노출"]].map(([value, label]) => <button key={value} className={filter === value ? primary : button} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><button className={button} onClick={load} disabled={busy || loading}>새로고침</button></div>
    <p className="mb-5 text-sm text-slate-600">노출 순서가 낮은 교재부터 추천순에 표시됩니다. 노출 중인 상위 8개 교재로 홈 배너를 구성합니다.</p>
    {notice && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <form onSubmit={search} className="mb-6 flex gap-3"><input aria-label="추천 상품 검색" required minLength={2} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="교재명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><button disabled={busy} className={primary}>검색</button></form>
    <div className="mb-8 space-y-2">{products.map((product) => <div className="flex items-center justify-between gap-4 rounded border p-3" key={product.id}><span>{product.title} <small>#{product.id}</small></span><button disabled={busy || rows.some((row) => String(row.product_id) === String(product.id))} onClick={() => save({ product_id: product.id, headline: product.title.slice(0, 80), sort_order: rows.length ? Math.min(9999, Math.max(...rows.map((item) => item.sort_order)) + 10) : 0, is_enabled: false })}>추천에 추가</button></div>)}</div>
    {loading && <p role="status">추천 교재를 불러오는 중…</p>}
    {!loading && !error && !rows.length && <p className="rounded-xl border bg-white p-8 text-slate-500">등록된 추천 교재가 없습니다. 위에서 교재를 검색해 추가해주세요.</p>}
    <div className="grid gap-4 xl:grid-cols-2">{rows.filter((row) => filter === "all" || row.is_enabled === (filter === "enabled")).map((row) => <article key={row.product_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex h-40 items-center justify-center bg-slate-50 p-3">{details[row.product_id]?.cover_image_url ? <img src={details[row.product_id].cover_image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <span className="text-sm text-slate-400">표지 없음</span>}</div>
      <div className="p-5"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">추천 교재 · 순서 {row.sort_order}</span><span className={`rounded-full px-2 py-1 font-bold ${row.is_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.is_enabled ? "노출 중" : "비노출"}</span></div>
      <h2 className="mb-2 text-base font-bold text-slate-900">{details[row.product_id]?.title ?? `상품 #${row.product_id}`}</h2><p className="text-xs leading-6 text-slate-500">{row.headline}</p>
      <div className="mt-4 flex gap-2"><button className={button} disabled={busy} onClick={() => setEditor({ ...row })}>수정</button><button className={button} disabled={busy} onClick={() => save({ ...row, is_enabled: !row.is_enabled })}>{row.is_enabled ? "노출 끄기" : "노출 켜기"}</button></div></div>
    </article>)}</div>
    <AdminDialog open={Boolean(editor)} onClose={() => setEditor(null)} title="추천 교재 수정" size="xl" busy={busy} dirty
      footer={<div className="flex justify-end gap-2"><button className={button} onClick={() => setEditor(null)} disabled={busy}>취소</button><button className={primary} type="submit" form="recommendation-editor" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div>}>
      {editor && <form id="recommendation-editor" className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); void save(editor); }}>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <p className="font-bold">{details[editor.product_id]?.title ?? `상품 #${editor.product_id}`}</p>
        <fieldset disabled={busy} className="space-y-5">
          <label className="block text-sm font-semibold">노출 순서<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="0" max="9999" required value={editor.sort_order} onChange={(event) => setEditor({ ...editor, sort_order: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
          <label className="block text-sm font-semibold">배너 소개 문구<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={80} required value={editor.headline} onChange={(event) => setEditor({ ...editor, headline: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editor.is_enabled} onChange={(event) => setEditor({ ...editor, is_enabled: event.target.checked })} />노출 사용</label>
        </fieldset>
      </form>}
    </AdminDialog>
  </AdminShell>;
}
