import { useCallback, useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { formatImageBytes, preparePromotionImage } from "../lib/promotionImage";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { deletePromotion, listPromotions, savePromotion, uploadPromotionImage } from "@shared-supabase/sitePromotionsClient";
import { fromKstInput, isPromotionUrl, PROMOTION_PLACEMENTS, promotionStatus, toKstInput } from "@shared-domain/sitePromotions";

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primaryClass = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const previewUrl = (url) => isPromotionUrl(url) ? (url.startsWith("/") ? `https://subook.kr${url}` : url) : undefined;
const scheduleLabel = (value, end = false) => toKstInput(value, end).replace("T", " ");

function AdminPromotionsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [uploadPhase, setUploadPhase] = useState("");
  const [imageResults, setImageResults] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await listPromotions(supabase)); }
    catch { setError("목록을 불러오지 못했습니다. 관리자 로그인과 연결 상태를 확인한 뒤 새로고침해 주세요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openEditor = (row = null) => {
    setEditorError("");
    setImageResults({});
    setEditor(row ? { ...row, starts_at: toKstInput(row.starts_at), ends_at: toKstInput(row.ends_at, true) } : {
      id: crypto.randomUUID(), placement: filter === "home_popup" ? "home_popup" : "home_hero", title: "",
      image_url: "", mobile_image_url: "", alt_text: "", link_url: "", is_enabled: false,
      sort_order: 100, starts_at: "", ends_at: "",
    });
  };
  const change = (key, value) => {
    setEditor((old) => ({ ...old, [key]: value }));
    if (key === "image_url" || key === "mobile_image_url") setImageResults((old) => ({ ...old, [key]: null }));
  };
  const upload = async (key, file) => {
    if (!file) return;
    setUploading(key);
    setUploadPhase("이미지 최적화 중…");
    setEditorError("");
    try {
      const result = await preparePromotionImage(file, { placement: editor.placement, mobile: key === "mobile_image_url" });
      setUploadPhase("이미지 업로드 중…");
      change(key, await uploadPromotionImage(supabase, result.file));
      setImageResults((old) => ({ ...old, [key]: result }));
    }
    catch (err) { setEditorError(err.message || "이미지를 업로드하지 못했습니다. 다시 시도해 주세요."); }
    finally { setUploading(""); }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setEditorError("");
    try {
      await savePromotion(supabase, { ...editor, starts_at: fromKstInput(editor.starts_at), ends_at: fromKstInput(editor.ends_at, true), sort_order: Number(editor.sort_order) }, editor.updated_at);
      setEditor(null);
      setMessage("저장했습니다. 고객 홈 새로고침 시 반영되며, 열려 있는 홈은 30초 이내에 갱신됩니다.");
      await load();
    } catch (err) { setEditorError(err.message || "저장하지 못했습니다. 목록을 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const toggle = async (row) => {
    setBusy(true);
    setError("");
    try {
      await savePromotion(supabase, { ...row, is_enabled: !row.is_enabled }, row.updated_at);
      setMessage(row.is_enabled ? "비노출로 변경했습니다." : "노출을 켰습니다. 예약 기간에 맞춰 표시됩니다.");
      await load();
    } catch (err) { setError(err.message || "변경하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deletePromotion(supabase, deleteTarget);
      setDeleteTarget(null);
      setMessage("항목을 삭제했습니다.");
      await load();
    } catch (err) { setError(err.message || "삭제하지 못했습니다."); setDeleteTarget(null); }
    finally { setBusy(false); }
  };
  const visibleRows = rows.filter((row) => filter === "all" || row.placement === filter);
  const blocked = busy || Boolean(uploading);

  return (
    <AdminShell activeModule="promotions" title="배너·팝업 관리" description="고객 홈에 보여줄 이미지와 연결 주소, 노출 기간을 관리합니다.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="노출 위치 필터">
          {Object.entries({ all: "전체", ...PROMOTION_PLACEMENTS }).map(([value, label]) => (
            <button key={value} type="button" className={filter === value ? primaryClass : buttonClass} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={load} disabled={loading || blocked}>새로고침</button>
          <button type="button" className={primaryClass} onClick={() => openEditor()} disabled={blocked}>새 배너·팝업</button>
        </div>
      </div>
      <p className="mb-5 text-sm text-slate-500">순서가 작은 항목부터 표시합니다. 모든 일시는 한국시간이며, 팝업은 닫으면 해당 브라우저 세션 동안 다시 표시하지 않습니다.</p>
      {message && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm" role="status">{message}</p>}
      {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {loading ? <p className="py-10 text-center text-slate-500">목록을 불러오는 중입니다.</p> : visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">등록된 항목이 없습니다. 새 배너·팝업을 추가해 주세요.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleRows.map((row) => (
            <article key={row.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex h-40 items-center justify-center bg-slate-50 p-3">
                <img src={previewUrl(row.image_url)} alt={row.alt_text} className="max-h-full max-w-full object-contain" loading="lazy" />
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">{PROMOTION_PLACEMENTS[row.placement]} · 순서 {row.sort_order}</span>
                  <span className={`rounded-full px-2 py-1 font-bold ${promotionStatus(row) === "노출 중" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{promotionStatus(row)}</span>
                </div>
                <h2 className="mb-2 text-base font-bold text-slate-900">{row.title}</h2>
                <p className="text-xs leading-6 text-slate-500">{row.starts_at ? scheduleLabel(row.starts_at) : "시작 제한 없음"} ~ {row.ends_at ? `${scheduleLabel(row.ends_at, true)}까지` : "종료 제한 없음"}</p>
                <p className="truncate text-xs leading-6 text-slate-500" title={row.link_url || "연결 없음"}>{row.link_url || "연결 없음"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={blocked} onClick={() => openEditor(row)}>수정</button>
                  <button type="button" className={buttonClass} disabled={blocked} onClick={() => toggle(row)}>{row.is_enabled ? "노출 끄기" : "노출 켜기"}</button>
                  <button type="button" className={`${buttonClass} ml-auto text-rose-700`} disabled={blocked} onClick={() => setDeleteTarget(row)}>삭제</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <AdminDialog open={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.updated_at ? "배너·팝업 수정" : "새 배너·팝업"} size="xl" busy={blocked} dirty
        footer={<div className="flex justify-end gap-2"><button className={buttonClass} type="button" onClick={() => setEditor(null)} disabled={blocked}>취소</button><button className={primaryClass} type="submit" form="promotion-editor" disabled={blocked}>{uploading ? uploadPhase : busy ? "저장 중…" : "저장"}</button></div>}>
        {editor && <form id="promotion-editor" onSubmit={save} className="space-y-5 p-6">
          {editorError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{editorError}</p>}
          <fieldset disabled={blocked} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">노출 위치<select className={inputClass} value={editor.placement} onChange={(e) => change("placement", e.target.value)}>{Object.entries(PROMOTION_PLACEMENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block text-sm font-semibold">노출 순서<input className={inputClass} type="number" min="0" max="9999" required value={editor.sort_order} onChange={(e) => change("sort_order", e.target.value)} /></label>
            </div>
            <label className="block text-sm font-semibold">관리 제목<input className={inputClass} required maxLength={100} value={editor.title} onChange={(e) => change("title", e.target.value)} placeholder="예: 10월 교재 할인 안내" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              {[["image_url", "기본 이미지 (필수)"], ["mobile_image_url", "모바일 이미지 (선택)"]].map(([key, label]) => (
                <div key={key} className="rounded-xl border border-slate-200 p-4">
                  <label className="block text-sm font-semibold">{label}<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(key, file); }} /></label>
                  <label className="mt-3 block text-xs text-slate-500">{key === "image_url" ? "기본 이미지 주소" : "모바일 이미지 주소"}<input className={inputClass} value={editor[key] || ""} onChange={(event) => change(key, event.target.value.trim())} placeholder="업로드하거나 https:// 이미지 주소 입력" /></label>
                  {previewUrl(editor[key]) && <img src={previewUrl(editor[key])} alt={`${label} 미리보기`} className="mt-3 max-h-52 w-full rounded-lg object-contain bg-slate-50" />}
                  {imageResults[key] && <p role="status" className="mt-2 text-xs text-emerald-700">
                    {imageResults[key].optimized
                      ? `${formatImageBytes(imageResults[key].originalBytes)} → ${formatImageBytes(imageResults[key].outputBytes)} (${imageResults[key].savedPercent}% 절감)`
                      : `원본 유지 · ${formatImageBytes(imageResults[key].outputBytes)}${imageResults[key].animated ? " · 움직이는 이미지" : " · 이미 최적화된 이미지"}`}
                    {` · ${imageResults[key].format} · ${imageResults[key].width}×${imageResults[key].height}px`}
                  </p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">JPG·PNG·WebP 원본 25MB까지. 업로드 시 비율을 유지해 자동 축소·압축합니다. 홈 배너는 PC 3200×500px 비율을 권장합니다. 모바일 이미지를 비워두면 기본 이미지를 사용합니다.</p>
            <label className="block text-sm font-semibold">이미지 설명<textarea className={inputClass} rows={3} required maxLength={1000} value={editor.alt_text} onChange={(e) => change("alt_text", e.target.value)} placeholder="이미지에 적힌 주요 내용을 입력해 주세요. 스크린리더에서도 안내됩니다." /></label>
            <label className="block text-sm font-semibold">클릭 시 연결 주소 (선택)<input className={inputClass} value={editor.link_url || ""} onChange={(e) => change("link_url", e.target.value.trim())} placeholder="예: /mypage#coupons 또는 https://…" /></label>
            <p className="text-xs text-slate-500">교재 판매 안내: /sell · 전체 상품: /#products · 쿠폰함: /mypage#coupons · 비워두면 이동하지 않습니다.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">시작 일시 (한국시간)<input className={inputClass} type="datetime-local" value={editor.starts_at} onChange={(e) => change("starts_at", e.target.value)} /></label>
              <label className="block text-sm font-semibold">종료 일시 (한국시간, 해당 분까지)<input className={inputClass} type="datetime-local" value={editor.ends_at} onChange={(e) => change("ends_at", e.target.value)} /></label>
            </div>
            <p className="text-xs text-slate-500">비워두면 시간 제한이 없습니다. 예: 9월 28일 23:59 입력 시 9월 29일 00:00부터 자동으로 내려갑니다.</p>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editor.is_enabled} onChange={(e) => change("is_enabled", e.target.checked)} />노출 사용</label>
            <p className="text-xs text-slate-500">체크를 해제하면 임시 저장됩니다. 노출을 켠 항목만 설정한 기간에 표시합니다.</p>
          </fieldset>
        </form>}
      </AdminDialog>
      <AdminDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="항목 삭제" size="sm" busy={busy}>
        <div className="p-6"><p className="mb-5 text-sm">‘{deleteTarget?.title}’ 항목을 삭제할까요? 잠시 내리려면 노출 끄기를 사용하세요.</p><div className="flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setDeleteTarget(null)} disabled={busy}>취소</button><button type="button" className={primaryClass} onClick={remove} disabled={busy}>{busy ? "삭제 중…" : "삭제"}</button></div></div>
      </AdminDialog>
    </AdminShell>
  );
}

export default AdminPromotionsPage;
