import { useEffect, useId, useState } from "react";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { searchCuratedProducts } from "@shared-supabase/curatedContentClient";
import { productStatusLabel } from "@shared-domain/status";
import { getThumbnailImageUrl } from "@shared-domain/storageImage";

const pageSize = 30;
const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";

export default function CuratedProductPicker({ selectedIds = [], onAdd, disabled = false }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState({ search: "", page: 1 });
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const addedIds = new Set(selectedIds.map(String));
  const available = products.filter((product) => !addedIds.has(String(product.id)));
  const chosen = checked.filter((product) => !addedIds.has(String(product.id)));
  const checkedIds = new Set(chosen.map((product) => String(product.id)));
  const allChecked = available.length > 0 && available.every((product) => checkedIds.has(String(product.id)));
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(""); setProducts([]);
    searchCuratedProducts(supabase, request.search, (request.page - 1) * pageSize, pageSize)
      .then((result) => {
        if (disposed) return;
        setProducts(result.products); setTotal(result.total_count);
      }).catch(() => { if (!disposed) setError("교재 목록을 불러오지 못했습니다. 다시 시도해주세요."); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [request, retry]);

  function search() {
    setChecked([]);
    setRequest({ search: query.trim(), page: 1 });
  }
  function toggle(product, checked) {
    setChecked((current) => checked
      ? [...current.filter((item) => item.id !== product.id), product]
      : current.filter((item) => item.id !== product.id));
  }
  async function add(items) {
    const succeeded = await onAdd(items);
    if (succeeded !== false) setChecked((current) => current.filter((item) => !items.some((product) => item.id === product.id)));
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="추가할 교재 목록">
    <label htmlFor={inputId} className="mb-2 block text-sm font-bold">교재 목록에서 추가</label>
    <div className="flex gap-2">
      <input id={inputId} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="교재명·강사·브랜드·과목·상품번호 검색" value={query} disabled={disabled}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); search(); } }} />
      <button type="button" className={button} disabled={disabled} onClick={search}>검색</button>
      {request.search && <button type="button" className={button} disabled={disabled} onClick={() => { setQuery(""); setChecked([]); setRequest({ search: "", page: 1 }); }}>전체</button>}
    </div>
    <div className="my-3 flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled || loading || !available.length} checked={allChecked} onChange={(event) => {
        setChecked((current) => event.target.checked
          ? [...current.filter((item) => !available.some((product) => product.id === item.id)), ...available]
          : current.filter((item) => !available.some((product) => product.id === item.id)));
      }} />현재 페이지 선택</label>
      <span className="text-slate-500">{loading ? "불러오는 중…" : error ? "조회 실패" : `${request.search ? "검색 결과" : "전체"} ${total.toLocaleString()}종`} · 선택 {chosen.length}종</span>
      <button type="button" className={button} disabled={disabled || !chosen.length} onClick={() => void add(chosen)}>선택 교재 추가</button>
    </div>
    {error ? <div role="alert" className="py-4 text-sm text-rose-700">{error} <button type="button" className={button} onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>
      : loading ? <p role="status" className="py-10 text-center text-sm text-slate-500">교재 목록을 불러오는 중…</p>
        : <div className="max-h-96 overflow-y-auto">
          {products.map((product) => {
            const added = addedIds.has(String(product.id));
            return <div key={product.id} className="flex items-center gap-3 border-b border-slate-100 py-3">
              <input type="checkbox" aria-label={`${product.title} 선택`} disabled={disabled || added} checked={added || checkedIds.has(String(product.id))} onChange={(event) => toggle(product, event.target.checked)} />
              {product.cover_image_url && <img className="h-14 w-10 shrink-0 object-contain" src={getThumbnailImageUrl(product.cover_image_url)} alt="" loading="lazy" />}
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{product.title}</p>
                <p className="mt-1 text-xs text-slate-500">{[product.option, product.brand, product.instructor_name, `#${product.id}`].filter(Boolean).join(" · ")}</p>
                <span className="text-xs text-slate-500">{product.is_listed === false ? "숨김" : productStatusLabel[product.status] || "상태 확인 필요"}</span>
              </div>
              <button type="button" className={`${button} shrink-0`} disabled={disabled || added} onClick={() => void add([product])}>{added ? "추가됨" : "추가"}</button>
            </div>;
          })}
          {!products.length && <p className="py-10 text-center text-sm text-slate-500">검색 결과가 없습니다.</p>}
        </div>}
    <div className="mt-3 flex items-center justify-end gap-3 text-sm">
      <button type="button" className={button} disabled={disabled || loading || request.page <= 1} onClick={() => setRequest((current) => ({ ...current, page: current.page - 1 }))}>이전</button>
      <span>{request.page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
      <button type="button" className={button} disabled={disabled || loading || Boolean(error) || request.page * pageSize >= total} onClick={() => setRequest((current) => ({ ...current, page: current.page + 1 }))}>다음</button>
    </div>
  </section>;
}
