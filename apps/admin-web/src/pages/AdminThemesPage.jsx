import { useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import CuratedProductPicker from "../components/CuratedProductPicker";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { listContentThemes, saveContentTheme } from "@shared-supabase/contentThemesClient";
import { getCuratedProductDetails } from "@shared-supabase/curatedContentClient";
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
  function addProducts(products) {
    setSelected((current) => {
      const ids = new Set(current.map((product) => String(product.id)));
      return [...current, ...products.filter((product) => {
        if (ids.has(String(product.id))) return false;
        ids.add(String(product.id));
        return true;
      })];
    });
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
    setError(""); setNotice(""); setBusy(true);
    try {
      let chosen = [];
      if (theme) {
        const products = new Map();
        for (let offset = 0; offset < theme.product_ids.length; offset += 100) {
          const data = await getCuratedProductDetails(supabase, theme.product_ids.slice(offset, offset + 100));
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

  function move(index, delta) {
    setSelected((current) => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  async function save(event) {
    event.preventDefault(); setError("");
    if (!editor.title.trim() || !editor.image_url || !selected.length) { setError("테마명, 1:1 아이콘과 교재를 한 권 이상 등록해주세요."); return; }
    setBusy(true);
    try {
      await saveContentTheme(supabase, { ...editor, product_ids: selected.map((product) => product.id) });
      setEditor(null); await load(); setNotice("테마관을 저장했습니다.");
    } catch (failure) { setError(failure.message || "테마를 저장하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
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
        <CuratedProductPicker selectedIds={selected.map((product) => product.id)} onAdd={addProducts} disabled={busy} />
        <h3 className="font-bold">선택한 교재 ({selected.length}권)</h3>
        <ol className="space-y-2">{selected.map((product, index) => <li key={product.id} className="flex items-center gap-2 rounded bg-slate-50 p-2"><span className="flex-1 text-sm">{index + 1}. {product.title}</span><button type="button" aria-label={`${product.title} 위로`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${product.title} 아래로`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className={button} onClick={() => setSelected(selected.filter((item) => item.id !== product.id))}>제외</button></li>)}</ol>
        <label className="flex gap-2"><input type="checkbox" checked={editor.is_enabled} onChange={(event) => setEditor({ ...editor, is_enabled: event.target.checked })} />홈에 노출</label>
      </fieldset></form>}
    </AdminDialog>
  </AdminShell>;
}
