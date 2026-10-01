import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import CuratedProductPicker from "../components/CuratedProductPicker";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { addRecommendations, listRecommendations, saveRecommendation } from "@shared-supabase/recommendationsClient";
import { getCuratedProductDetails } from "@shared-supabase/curatedContentClient";
import { productStatusLabel } from "@shared-domain/status";
import { getThumbnailImageUrl } from "@shared-domain/storageImage";

const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = "shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

function RecommendationList({ placement }) {
  const isHero = placement === "hero";
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState({});
  async function load() {
    setLoading(true); setError("");
    try {
      const items = await listRecommendations(supabase, false, placement);
      const products = [];
      for (let offset = 0; offset < items.length; offset += 100) {
        products.push(...await getCuratedProductDetails(supabase, items.slice(offset, offset + 100).map((item) => item.product_id)));
      }
      setDetails(Object.fromEntries(products.map((product) => [product.id, product])));
      setRows(items);
      return true;
    } catch { setError("설정을 불러오지 못했습니다. 새로고침해 주세요."); return false; }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(products) {
    const existing = new Set(rows.map((row) => String(row.product_id)));
    const newProducts = products.filter((product) => !existing.has(String(product.id)));
    if (!newProducts.length) return true;
    const start = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 0;
    setBusy(true); setError(""); setNotice("");
    try {
      await addRecommendations(supabase, newProducts.map((product, index) => ({
        product_id: product.id, sort_order: Math.min(9999, start + index * 10), headline: "", is_enabled: !isHero,
      })), placement);
      if (await load()) setNotice(isHero
        ? `${newProducts.length}종을 추가했습니다. 순서를 확인하고 노출을 켜주세요.`
        : `${newProducts.length}종을 노출 켜짐으로 추가했습니다.`);
      return true;
    } catch (failure) { setError(failure.code === "23505" ? "이미 추가된 교재가 있습니다. 새로고침 후 다시 추가해 주세요." : "추가 결과를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요."); return false; }
    finally { setBusy(false); }
  }
  async function save(row) {
    setBusy(true); setError(""); setNotice("");
    try {
      await saveRecommendation(supabase, row, placement);
      setEditor(null);
      if (await load()) setNotice(isHero ? "홈 배너 설정을 저장했습니다." : "추천순 설정을 저장했습니다.");
    } catch (failure) { setError(failure.message || "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  return <>
    <p className="mb-5 text-sm leading-6 text-slate-600">{isHero
      ? "홈 상단에 표시할 교재와 순서를 설정합니다. 문구를 비워두면 AI 문구를 사용합니다."
      : "홈페이지 ‘추천순’은 순서가 작은 교재부터 표시합니다. 같은 순서라면 상품번호가 작은 교재가 먼저 나옵니다."}
      <br />고객에게 공개 가능한 교재만 표시됩니다. 품절·숨김 상태를 함께 확인해주세요.</p>
    {notice && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <CuratedProductPicker selectedIds={rows.map((row) => row.product_id)} onAdd={add} disabled={busy || loading} />
    <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-bold">{isHero ? "홈 배너 교재" : "추천 교재"} ({rows.length}종)</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="노출 필터">
        {[["all", "전체"], ["enabled", "노출 켜짐"], ["disabled", "노출 꺼짐"]].map(([value, label]) => <button key={value} className={filter === value ? primary : button} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        <button className={button} onClick={load} disabled={busy || loading}>새로고침</button>
      </div>
    </div>
    {loading && <p role="status">설정을 불러오는 중…</p>}
    <ol className="space-y-3">{rows.filter((row) => filter === "all" || row.is_enabled === (filter === "enabled")).map((row) => {
      const product = details[row.product_id];
      return <li key={row.product_id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <span className="w-12 text-center text-sm font-bold text-slate-500">{row.sort_order}</span>
        {product?.cover_image_url && <img src={getThumbnailImageUrl(product.cover_image_url)} alt="" className="h-20 w-14 object-contain" loading="lazy" />}
        <div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{product?.title ?? `상품 #${row.product_id}`}</h3>
          <p className="mt-1 text-xs text-slate-500">#{row.product_id} · {product?.is_listed === false ? "숨김 · 고객 미노출" : productStatusLabel[product?.status] || "상품 상태 확인 필요"} · {row.is_enabled ? "노출 켜짐" : "노출 꺼짐"}</p>
          {isHero && <p className="mt-1 text-xs text-slate-500">{row.headline || "AI 문구 사용"}</p>}
        </div>
        <div className="flex gap-2"><button className={button} disabled={busy || loading} onClick={() => setEditor({ ...row })}>수정</button>
          <button className={button} disabled={busy || loading} onClick={() => save({ ...row, is_enabled: !row.is_enabled })}>{row.is_enabled ? "노출 끄기" : "노출 켜기"}</button></div>
      </li>;
    })}</ol>
    {!loading && !error && !rows.some((row) => filter === "all" || row.is_enabled === (filter === "enabled")) && <p className="rounded-xl border bg-white p-8 text-slate-500">등록된 교재가 없습니다.</p>}
    <AdminDialog open={Boolean(editor)} onClose={() => setEditor(null)} title={isHero ? "홈 배너 교재 수정" : "추천 교재 수정"} size="xl" busy={busy} dirty
      footer={<div className="flex justify-end gap-2"><button className={button} onClick={() => setEditor(null)} disabled={busy}>취소</button><button className={primary} type="submit" form="recommendation-editor" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div>}>
      {editor && <form id="recommendation-editor" className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); void save(editor); }}>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <p className="font-bold">{details[editor.product_id]?.title ?? `상품 #${editor.product_id}`}</p>
        <fieldset disabled={busy} className="space-y-5">
          <label className="block text-sm font-semibold">노출 순서<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="0" max="9999" required value={editor.sort_order} onChange={(event) => setEditor({ ...editor, sort_order: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
          {isHero && <label className="block text-sm font-semibold">배너 소개 문구 (20자 이내)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={20} placeholder="비워두면 AI 문구 사용" value={editor.headline} onChange={(event) => setEditor({ ...editor, headline: event.target.value })} /></label>}
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editor.is_enabled} onChange={(event) => setEditor({ ...editor, is_enabled: event.target.checked })} />노출 사용</label>
        </fieldset>
      </form>}
    </AdminDialog>
  </>;
}

export default function AdminRecommendationsPage() {
  const [params, setParams] = useSearchParams();
  const placement = params.get("tab") === "hero" ? "hero" : "recommended";
  return <AdminShell activeModule="recommendations" title="추천 교재·홈 배너 관리" description="홈페이지 추천순과 상단 배너 교재를 각각 관리합니다.">
    <div className="mb-5 flex gap-2" role="group" aria-label="설정 대상">
      {[["recommended", "추천순"], ["hero", "홈 배너"]].map(([value, label]) => <button key={value} className={placement === value ? primary : button} aria-pressed={placement === value} onClick={() => setParams(value === "hero" ? { tab: value } : {})}>{label}</button>)}
    </div>
    <RecommendationList key={placement} placement={placement} />
  </AdminShell>;
}
