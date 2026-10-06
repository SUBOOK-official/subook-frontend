import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminQueryState from "../components/AdminQueryState";
import AdminPagination from "../components/AdminPagination";
import { useAdminListState } from "../lib/useAdminListState";
import { useAdminOperations } from "../lib/useAdminOperations";
import { formatCurrency } from "@shared-domain/format";

export default function AdminSettlementExceptionsPage() {
  const [list, update] = useAdminListState({ page: 1 });
  const result = useAdminOperations("settlements", list);
  return <AdminShell title="정산 확인 필요" activeModule="settlement-exceptions" actions={<Link to="/admin/settlements" className="btn-secondary !py-2 text-xs">정산 지급</Link>}>
    <p className="text-sm text-slate-600">지급 완료 후 환불이 발생했거나 신청된 교재입니다. 원 지급 기록을 보존하며, 회수·차감 여부는 관련 주문과 문의에서 확인하세요.</p>
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!result.data?.items?.length}>
      <div className="space-y-2">{result.data?.items.map((row) => <article key={row.id} className="card flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs font-bold text-amber-700">{row.reason}</span><h2 className="mt-1 font-semibold">{row.title}</h2><p className="mt-1 text-xs text-slate-500">{row.order_number} · 원 지급액 {formatCurrency(row.net_amount)}</p></div><div className="flex gap-3"><Link className="text-xs font-bold text-brand" to={`/admin/orders?order=${row.order_id}&detail=${row.order_id}`}>주문 확인</Link><Link className="text-xs font-bold text-brand" to={`/admin/cs?order=${row.order_id}`}>확인 메모 등록</Link></div></article>)}</div>
    </AdminQueryState>
    <AdminPagination currentPage={list.page} totalCount={result.data?.total_count || 0} pageSize={50} isLoading={result.loading} onPageChange={(page) => update({ page }, { replace: false })} />
  </AdminShell>;
}
