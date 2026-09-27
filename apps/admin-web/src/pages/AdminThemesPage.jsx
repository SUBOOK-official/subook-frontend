import { useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { listContentThemes } from "@shared-supabase/contentThemesClient";
import { uploadPromotionImage } from "@shared-supabase/sitePromotionsClient";
import { preparePromotionImage } from "../lib/promotionImage";
const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";
const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export default function AdminThemesPage() {
  const [filter, setFilter] = useState("all");
  const [themes, setThemes] = useState([]);
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [checkedIds, setCheckedIds] = useState([]);
  const selectedIds = new Set(selected.map((product) => String(product.id)));
  const availableResults = results.filter((product) => !selectedIds.has(String(product.id)));
  const checkedProducts = availableResults.filter((product) => checkedIds.includes(String(product.id)));
  function addProducts(products) {
    setSelected((current) => {
      const ids = new Set(current.map((product) => String(product.id)));
      return [...current, ...products.filter((product) => {
        if (ids.has(String(product.id))) return false;
        ids.add(String(product.id));
        return true;
      })];
    });
    setCheckedIds((current) => current.filter((id) => !products.some((product) => String(product.id) === id)));
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { setThemes(await listContentThemes(supabase, false)); }
    catch { setError("테마를 불러오지 못했습니다. DB 설정 및 관리자 권한을 확인해주세요."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function edit(theme) {
    setError(""); setNotice(""); setBusy(true); setQuery(""); setResults([]); setCheckedIds([]);
    try {
      let chosen = [];
      if (theme) {
        const products = new Map();
        for (let offset = 0; offset < theme.product_ids.length; offset += 100) {
          const { data, error: failure } = await supabase.from("products").select("id,title").in("id", theme.product_ids.slice(offset, offset + 100));
          if (failure) throw failure;
          for (const product of data ?? []) products.set(String(product.id), product);
        }
        chosen = theme.product_ids.map((id) => products.get(String(id)) ?? { id, title: `삭제되었거나 조회할 수 없는 교재 #${id}` });
      }
      setSelected(chosen);
      setEditor(theme ? { ...theme } : { id: crypto.randomUUID(), title: "", image_url: "", product_ids: [], is_enabled: false, sort_order: 100 });
    } catch { setError("테마의 교재를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function upload(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const square = bitmap.width === bitmap.height;
      bitmap.close();
      if (!square) throw new Error("아이콘은 가로·세로가 같은 1:1 이미지로 등록해주세요.");
      const result = await preparePromotionImage(file, { mobile: true });
      const url = await uploadPromotionImage(supabase, result.file);
      setEditor((current) => ({ ...current, image_url: url }));
    } catch (failure) { setError(failure.message || "아이콘 업로드에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function search() {
    if (query.trim().length < 2) { setError("검색어를 두 글자 이상 입력해주세요."); return; }
    setBusy(true); setError("");
    setCheckedIds([]); setResults([]);
    try {
      const matches = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: failure } = await supabase.from("products").select("id,title").ilike("title", `%${query.trim().replace(/[%_]/g, "")}%`).order("id").range(offset, offset + 499);
        if (failure) throw failure;
        matches.push(...(data ?? []));
        if ((data ?? []).length < 500) break;
      }
      setResults(matches);
      if (!matches.length) setError("검색 결과가 없습니다.");
    } catch { setError("교재 검색에 실패했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  function move(index, delta) {
    setSelected((current) => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  async function save(event) {
    event.preventDefault(); setError("");
    if (!editor.title.trim() || !editor.image_url || !selected.length) { setError("테마명, 1:1 아이콘과 교재를 한 권 이상 등록해주세요."); return; }
    setBusy(true);
    const { error: failure } = await supabase.from("content_themes").upsert({ ...editor, title: editor.title.trim(), sort_order: Number(editor.sort_order), product_ids: selected.map((product) => product.id) });
    if (failure) setError("테마를 저장하지 못했습니다. DB 설정과 권한을 확인해주세요.");
    else { setEditor(null); await load(); setNotice("테마관을 저장했습니다."); }
    setBusy(false);
  }
  return <AdminShell activeModule="themes" title="테마관 관리" description="아이콘 사진(1:1), 테마명, 테마에 포함할 교재를 등록합니다.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="테마 노출 필터">{[["all", "전체"], ["enabled", "노출 중"], ["disabled", "비노출"]].map(([value, label]) => <button type="button" key={value} className={filter === value ? primary : button} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="flex gap-2"><button className={button} disabled={busy || loading} onClick={load}>새로고침</button><button className={primary} disabled={busy} onClick={() => edit(null)}>새 테마관</button></div>
    </div>
    <p className="mb-5 text-sm text-slate-500">순서가 작은 테마부터 홈에 표시합니다. 정사각형 아이콘과 테마명, 포함할 교재를 등록해주세요.</p>
    {notice && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>}
    {!editor && error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="py-10 text-center text-slate-500">목록을 불러오는 중입니다.</p> : <div className="grid gap-4 xl:grid-cols-2">
      {themes.filter((theme) => filter === "all" || theme.is_enabled === (filter === "enabled")).map((theme) => <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white" key={theme.id}>
        <div className="flex h-40 items-center justify-center bg-slate-50 p-3"><img className="h-28 w-28 rounded-full object-cover" src={theme.image_url} alt="" loading="lazy" /></div>
        <div className="p-5"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">테마관 · 순서 {theme.sort_order}</span><span className={`rounded-full px-2 py-1 font-bold ${theme.is_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{theme.is_enabled ? "노출 중" : "비노출"}</span></div>
        <h2 className="mb-2 text-base font-bold text-slate-900">{theme.title}</h2><p className="text-xs leading-6 text-slate-500">포함 교재 {theme.product_ids.length}권</p>
        <div className="mt-4 flex gap-2"><button disabled={busy} className={button} onClick={() => edit(theme)}>수정</button></div></div>
      </article>)}
      {!themes.some((theme) => filter === "all" || theme.is_enabled === (filter === "enabled")) && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 xl:col-span-2">등록된 항목이 없습니다. 새 테마관을 추가해주세요.</div>}
    </div>}
    <AdminDialog open={Boolean(editor)} onClose={() => setEditor(null)} title={themes.some((theme) => theme.id === editor?.id) ? "테마관 수정" : "새 테마관"} busy={busy} dirty size="xl"
      footer={<div className="flex justify-end gap-2"><button className={button} type="button" onClick={() => setEditor(null)} disabled={busy}>취소</button><button className={primary} type="submit" form="theme-editor" disabled={busy}>{busy ? "처리 중…" : "저장"}</button></div>}>
      {editor && <form id="theme-editor" onSubmit={save} className="space-y-5 p-6"><fieldset disabled={busy} className="space-y-5">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <label className="block text-sm font-semibold">아이콘 사진 (1:1)<input type="file" accept="image/png,image/jpeg,image/webp" className={input} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
        {editor.image_url && <img className="h-24 w-24 rounded-full object-cover" src={editor.image_url} alt="테마 아이콘 미리보기" />}
        <label className="block text-sm font-semibold">테마명<input required maxLength={20} className={input} value={editor.title} placeholder="시대인재관, 추석할인, 메가세일" onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
        <label className="block text-sm font-semibold">홈 노출 순서<input required type="number" min="0" max="9999" className={input} value={editor.sort_order} onChange={(event) => setEditor({ ...editor, sort_order: event.target.value })} /></label>
        <div><label>포함할 교재 검색<input className={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /></label><button type="button" className={`${button} mt-2`} onClick={search}>검색</button></div>
        {results.length > 0 && <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!availableResults.length} checked={availableResults.length > 0 && checkedProducts.length === availableResults.length} onChange={(event) => setCheckedIds(event.target.checked ? availableResults.map((product) => String(product.id)) : [])} />검색 결과 전체 선택</label>
          <span className="text-sm text-slate-500">검색 {results.length}권 · 선택 {checkedProducts.length}권</span>
          <button type="button" className={button} disabled={!checkedProducts.length} onClick={() => addProducts(checkedProducts)}>선택한 교재 한 번에 추가</button>
        </div>}
        <div className="max-h-60 overflow-auto">{results.map((product) => {
          const added = selectedIds.has(String(product.id));
          return <div className="flex items-center justify-between gap-3 border-b py-2" key={product.id}>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={added} checked={added || checkedIds.includes(String(product.id))} onChange={(event) => setCheckedIds((current) => event.target.checked ? [...current, String(product.id)] : current.filter((id) => id !== String(product.id)))} />{product.title}</label>
            <button type="button" className={button} disabled={added} onClick={() => addProducts([product])}>{added ? "추가됨" : "추가"}</button>
          </div>;
        })}</div>
        <h3 className="font-bold">선택한 교재 ({selected.length}권)</h3>
        <ol className="space-y-2">{selected.map((product, index) => <li key={product.id} className="flex items-center gap-2 rounded bg-slate-50 p-2"><span className="flex-1 text-sm">{index + 1}. {product.title}</span><button type="button" aria-label={`${product.title} 위로`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${product.title} 아래로`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className={button} onClick={() => setSelected(selected.filter((item) => item.id !== product.id))}>제외</button></li>)}</ol>
        <label className="flex gap-2"><input type="checkbox" checked={editor.is_enabled} onChange={(event) => setEditor({ ...editor, is_enabled: event.target.checked })} />홈에 노출</label>
      </fieldset></form>}
    </AdminDialog>
  </AdminShell>;
}
