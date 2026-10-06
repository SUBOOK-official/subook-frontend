import { useState } from "react";
import { Link } from "react-router-dom";
import { saveAdminCase } from "@shared-supabase/adminOperationsClient";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import AdminPagination from "../components/AdminPagination";
import AdminQueryState from "../components/AdminQueryState";
import AdminEntityTimeline from "../components/AdminEntityTimeline";
import { useAdminListState } from "../lib/useAdminListState";
import { useAdminOperations } from "../lib/useAdminOperations";
import { toKstInput } from "../lib/adminDateTime";

const STATUS = { open: "접수", waiting: "확인 중", done: "완료" };
const blank = { title: "", customer_name: "", contact: "", member_user_id: "", order_id: "", pickup_request_id: "", assignee: "", status: "open", priority: "normal", due_date: "", note: "" };

export default function AdminCsPage() {
  const [list, update] = useAdminListState({ q: "", status: "", page: 1, case: "", order: "", pickup: "" });
  const result = useAdminOperations("cases", { ...list, id: list.case });
  const [editor, setEditor] = useState(null);
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function edit(row) { setOriginal(row || null); setEditor({ ...blank, ...(row || {}), order_id: row?.order_id || list.order, pickup_request_id: row?.pickup_request_id || list.pickup }); setError(""); }
  const change = (field) => (e) => setEditor((value) => ({ ...value, [field]: e.target.value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await saveAdminCase(editor, original); setEditor(null); result.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminShell title="문의 작업함" activeModule="cs" actions={<button type="button" className="btn-primary !w-auto !py-2" onClick={() => edit(null)}>+ 문의 등록</button>}>
    <div className="card flex flex-wrap gap-3">
      <input aria-label="문의 검색" placeholder="제목·고객·연락처·담당자 검색" className="input-base !mt-0 flex-1 min-w-48" value={list.q} onChange={(e) => update({ q: e.target.value, case: "" })} />
      <select aria-label="문의 상태" className="input-base !mt-0 !w-auto" value={list.status} onChange={(e) => update({ status: e.target.value, case: "" })}><option value="">전체 상태</option>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <button type="button" className="btn-secondary !py-2" onClick={() => { update({ q: "", status: "", case: "", order: "", pickup: "" }); result.refresh(); }}>초기화</button>
    </div>
    {list.order || list.pickup ? <p className="text-sm text-slate-500">{list.order ? `주문 #${list.order}` : `수거 #${list.pickup}`}에 연결된 문의 · 새 문의에도 이 대상이 연결됩니다.</p> : null}
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!result.data?.items?.length}>
      <div className="space-y-2">{result.data?.items.map((row) => <button type="button" key={row.id} onClick={() => edit(row)} className="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand/40">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs tabular-nums text-slate-400">#{row.id}</span>{row.priority === "urgent" ? <span className="rounded bg-rose-50 px-1.5 text-xs font-bold text-rose-600">긴급</span> : null}<span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{STATUS[row.status]}</span></div><h2 className="mt-2 font-semibold text-slate-900">{row.title}</h2><p className="mt-1 text-xs text-slate-500">{row.customer_name || "비회원/미확인"} · {row.contact || "연락처 없음"} · 담당 {row.assignee || "미배정"}</p></div>
        <div className="shrink-0 text-right text-xs text-slate-400">{row.due_date ? <p className={row.status !== "done" && row.due_date <= toKstInput(new Date()).slice(0, 10) ? "font-bold text-rose-600" : ""}>기한 {row.due_date}</p> : null}<p className="mt-1">{toKstInput(row.updated_at).replace("T", " ")}</p></div>
      </button>)}</div>
    </AdminQueryState>
    <AdminPagination currentPage={list.page} totalCount={result.data?.total_count || 0} pageSize={50} isLoading={result.loading} onPageChange={(page) => update({ page }, { replace: false })} />
    <AdminDialog open={Boolean(editor)} onClose={() => setEditor(null)} title={original ? `문의 #${original.id}` : "문의 등록"} busy={busy} dirty={Boolean(editor) && JSON.stringify(editor) !== JSON.stringify({ ...blank, ...(original || {}), order_id: original?.order_id || list.order, pickup_request_id: original?.pickup_request_id || list.pickup })} size="xl">
      {editor ? <form onSubmit={save} className="space-y-4 p-5">
        {error ? <p role="alert" className="notice-error">{error}</p> : null}
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold sm:col-span-2">제목<input required maxLength={160} className="input-base" value={editor.title} onChange={change("title")} /></label>
          {[['customer_name','고객 이름'],['contact','연락처'],['assignee','담당자']].map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input maxLength={160} className="input-base" value={editor[key] || ""} onChange={change(key)} /></label>)}
          <label className="text-xs font-semibold">처리 기한<input type="date" className="input-base" value={editor.due_date || ""} onChange={change("due_date")} /></label>
          <label className="text-xs font-semibold">상태<select className="input-base" value={editor.status} onChange={change("status")}>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">우선순위<select className="input-base" value={editor.priority} onChange={change("priority")}><option value="normal">보통</option><option value="urgent">긴급</option></select></label>
          <label className="text-xs font-semibold">주문 ID<input type="number" min="1" step="1" className="input-base" value={editor.order_id || ""} onChange={change("order_id")} /></label>
          <label className="text-xs font-semibold">수거 신청 ID<input type="number" min="1" step="1" className="input-base" value={editor.pickup_request_id || ""} onChange={change("pickup_request_id")} /></label>
          <label className="text-xs font-semibold sm:col-span-2">문의 내용·응대 메모<textarea rows={7} maxLength={10000} className="input-base" value={editor.note} onChange={change("note")} /></label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          {editor.order_id ? <Link className="text-xs font-bold text-brand" to={`/admin/orders?order=${editor.order_id}&detail=${editor.order_id}`}>연결 주문 열기 ↗</Link> : null}
          {editor.pickup_request_id ? <Link className="text-xs font-bold text-brand" to={`/admin/pickups?request=${editor.pickup_request_id}`}>연결 수거 열기 ↗</Link> : null}
          <button disabled={busy} className="btn-primary !ml-auto !w-auto" type="submit">{busy ? "저장 중…" : "저장"}</button>
        </div>
        {original ? <AdminEntityTimeline entity="admin_cs_cases" id={original.id} milestones={[{ label: "접수", at: original.created_at }]} /> : null}
      </form> : null}
    </AdminDialog>
  </AdminShell>;
}
