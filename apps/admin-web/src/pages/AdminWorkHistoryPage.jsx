import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminQueryState from "../components/AdminQueryState";
import AdminPagination from "../components/AdminPagination";
import { useAdminOperations } from "../lib/useAdminOperations";
import { useAdminListState, useDebouncedSearch } from "../lib/useAdminListState";
import AdminViewTabs from "../components/AdminViewTabs";
import { SearchIcon } from "../components/icons";
import { toKstInput } from "../lib/adminDateTime";
import { historyActionLabel, historyDetailLabel, historySearchTerm } from "../lib/adminHistoryLabels";

const STATUS = { running: "진행 중", completed: "완료", partial: "일부 실패", failed: "실패", interrupted: "중단" };
const ENTITIES = { books: "교재", products: "상품", orders: "주문", pickup_requests: "수거 신청", shipments: "검수", coupons: "쿠폰", notices: "공지", faqs: "FAQ", admin_cs_cases: "문의", admin_work_jobs: "대량 작업" };
function entityHref(row) {
  if (row.entity_type === "orders") return `/admin/orders?order=${row.entity_id}&detail=${row.entity_id}`;
  if (row.entity_type === "shipments") return `/admin/shipments/${row.entity_id}`;
  if (row.entity_type === "admin_cs_cases") return `/admin/cs?case=${row.entity_id}`;
  if (row.entity_type === "products") return `/admin/products?product=${row.entity_id}`;
  return null;
}
export default function AdminWorkHistoryPage() {
  const [list, update] = useAdminListState({ tab: "jobs", q: "", entity: "", status: "", page: 1 });
  const jobs = list.tab !== "history";
  const result = useAdminOperations(jobs ? "jobs" : "history", { ...list, q: jobs ? list.q : historySearchTerm(list.q) });
  const [searchInput, setSearchInput] = useDebouncedSearch(list.q, (q) => update({ q }));
  return <AdminShell title="작업·변경 이력" activeModule="work-history" actions={<button type="button" className="btn-secondary !px-3.5 !py-2.5 text-[13px]" onClick={result.refresh}>새로고침</button>}>
    <AdminViewTabs activeKey={jobs ? "jobs" : "history"} label="이력 종류" onSelect={(tab) => update({ tab, status: "", entity: "", q: "" })} tabs={[{ key: "jobs", label: "대량 작업 결과" }, { key: "history", label: "변경 이력" }]} />
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">이력 검색</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white pl-10 pr-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-[15px]" placeholder={jobs ? "작업 이름" : "대상 ID, 변경 항목"} type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        {jobs ? <select aria-label="작업 상태" className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none hover:border-slate-300 focus:border-brand" value={list.status} onChange={(e) => update({ status: e.target.value })}><option value="">모든 상태</option>{Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select> : <select aria-label="변경 대상" className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none hover:border-slate-300 focus:border-brand" value={list.entity} onChange={(e) => update({ entity: e.target.value })}><option value="">모든 대상</option>{Object.entries(ENTITIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>}
        <span className="ml-auto pl-1 text-sm text-slate-500">총 <strong className="font-bold tabular-nums text-slate-900">{Number(result.data?.total_count || 0).toLocaleString("ko-KR")}</strong>건</span>
      </div>
    </div>
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!result.data?.items?.length}>
      <div className="space-y-2">{result.data?.items.map((row) => <article key={row.id} className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{jobs ? row.label : `${ENTITIES[row.entity_type] || row.entity_type} #${row.entity_id} · ${historyActionLabel(row.action)}`}</h2><time className="text-xs text-slate-400">{toKstInput(row.updated_at || row.created_at).replace("T", " ")} KST</time></div>
        {jobs ? <><div className="mt-3 flex gap-3 text-xs"><span className={['failed','partial'].includes(row.status) ? "font-bold text-rose-600" : "font-bold text-slate-600"}>{STATUS[row.status]}</span><span>{row.done} / {row.total}건 처리</span>{row.result_href?.startsWith("/admin/") ? <Link to={row.result_href} className="text-brand">대상 화면 ↗</Link> : null}</div>{row.target_ids?.length ? <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">대상 {row.target_ids.length}건</summary><p className="mt-2 break-words">{row.target_ids.join(", ")}</p></details> : null}<progress className="mt-3 h-1 w-full accent-brand" value={row.done} max={row.total || 1} aria-label="작업 진행률" />{row.status === "running" && Date.now() - new Date(row.updated_at) > 600000 ? <p className="mt-2 text-xs text-amber-700">10분 이상 갱신되지 않았습니다. 실행 화면에서 완료 여부를 확인하세요.</p> : null}{row.failures?.length ? <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-rose-700">실패 {row.failures.length}건 확인</summary><ul className="mt-2 space-y-1">{row.failures.map((f,i) => <li key={i}>{f.title || `#${f.id || i+1}`} · {f.message || f.error || "결과 확인 필요"}</li>)}</ul></details> : null}</> : <><p className="mt-2 break-words text-xs text-slate-500">{historyDetailLabel(row.detail)}</p><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400"><span>처리자 {row.actor_id || "시스템"}</span>{entityHref(row) ? <Link className="text-brand" to={entityHref(row)}>상세 열기 ↗</Link> : null}</div></>}
      </article>)}</div>
    </AdminQueryState>
    <AdminPagination currentPage={list.page} totalCount={result.data?.total_count || 0} pageSize={50} isLoading={result.loading} onPageChange={(page) => update({ page }, { replace: false })} />
  </AdminShell>;
}
