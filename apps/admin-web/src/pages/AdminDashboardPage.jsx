import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminQueryState from "../components/AdminQueryState";
import { useAdminBadgeCounts, refreshAdminBadgeCounts } from "../lib/useAdminBadgeCounts";
import { useAdminOperations } from "../lib/useAdminOperations";
import { toKstInput } from "../lib/adminDateTime";

function elapsed(value) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value)) / 3600000));
  return hours >= 24 ? Math.floor(hours / 24) + "일 경과" : hours + "시간 경과";
}
export default function AdminDashboardPage() {
  const counts = useAdminBadgeCounts();
  const queue = useAdminOperations("queue");
  const tasks = [
    ["입금 확인", "ordersPending", "/admin/orders?status=pending", "주문"],
    ["출고 대기", "ordersPreparing", "/admin/orders?view=fulfillment", "주문"],
    ["수거 접수", "pickups", "/admin/pickups?status=pending", "신청"],
    ["검수·등록", "inspection", "/admin/pickups?tab=inspection", "수거 건"],
    ["정산 지급", "settlements", "/admin/settlements", "미지급 원장"],
  ];
  return <AdminShell title="오늘 할 일" activeModule="overview" actions={<button type="button" className="btn-secondary !py-2 text-xs" onClick={() => { void refreshAdminBadgeCounts(); queue.refresh(); }}>새로고침</button>}>
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-5" aria-label="처리 대기 업무">{tasks.map(([label,key,to,unit]) => <Link to={to} key={key} className="rounded-xl border border-slate-200 bg-white px-4 py-4 transition hover:border-brand/40"><p className="text-xs font-semibold text-slate-500">{label}<span className="float-right text-slate-300">↗</span></p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{counts[key] == null ? "—" : counts[key].toLocaleString("ko-KR")}</p><p className="mt-1 text-[11px] text-slate-400">{counts[key] == null ? (counts.error ? "조회 실패" : "조회 중") : unit}</p></Link>)}</section>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-base font-bold">먼저 확인할 업무</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold tabular-nums">{queue.data ? queue.data.total_count + "건" : "—"}</span></div>
        <AdminQueryState loading={queue.loading} error={queue.error} onRetry={queue.refresh} empty={!queue.data?.items?.length}>
          <div className="divide-y divide-slate-100">{queue.data?.items.map((task) => <Link to={task.href} key={task.id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"><div className="min-w-0"><p className={task.priority === 1 ? "text-xs font-bold text-rose-600" : "text-xs font-semibold text-slate-500"}>{task.category}</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{task.title}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-slate-600">{elapsed(task.since)}</p><p className="mt-1 text-[10px] text-slate-400">{toKstInput(task.since).replace("T"," ")}</p></div></Link>)}</div>
          {queue.data?.total_count > 30 ? <p className="border-t border-slate-100 p-4 text-xs text-slate-500">우선순위·경과시간 순 상위 30건입니다. 각 업무 메뉴에서 전체 대상을 확인하세요.</p> : null}
        </AdminQueryState>
      </section>
      <aside className="space-y-4">
        <section className="card"><h2 className="mb-3 text-sm font-bold">빠른 작업</h2>{[["상품 등록","/admin/register"],["상세 사진 촬영","/admin/photo-intake"],["환불 신청 확인","/admin/orders?view=refunds"],["문의 등록·응대","/admin/cs"],["기지급 환불 확인","/admin/settlement-exceptions"],["작업 결과 확인","/admin/work-history"]].map(([label,to]) => <Link to={to} key={to} className="flex justify-between border-t border-slate-100 py-3 text-xs font-semibold text-slate-600">{label}<span>→</span></Link>)}</section>
        <section className="rounded-xl border border-slate-200 px-4 py-3 text-xs leading-6 text-slate-500"><p>출고·수거 접수 2일, 검수 7일 이상 대기한 건과 미처리 환불을 표시합니다.</p><p>알림 실패는 최근 24시간 기준입니다.</p>{counts.updatedAt ? <p className="mt-2 text-[10px] text-slate-400">업무 건수 갱신 {toKstInput(counts.updatedAt).replace("T"," ")}</p> : null}</section>
      </aside>
    </div>
  </AdminShell>;
}
