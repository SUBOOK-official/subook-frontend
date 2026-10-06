import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import AdminQueryState from "../components/AdminQueryState";
import { useAdminListState } from "../lib/useAdminListState";
import { useAdminOperations } from "../lib/useAdminOperations";
import { formatCurrency } from "@shared-domain/format";

export default function AdminInventoryInsightsPage() {
  const [list, update] = useAdminListState({ q: "", days: "90", page: 1 });
  const result = useAdminOperations("inventory", list);
  return <AdminShell title="재고 분석" activeModule="inventory-insights" summaryCards={result.data ? [{ label: "대상 상품", value: `${result.data.total_count}종` }, { label: "가용 재고", value: `${result.data.quantity}권` }, { label: "현재 판매가 합계", value: formatCurrency(result.data.inventory_value) }] : []}>
    <div className="card space-y-3"><div className="flex flex-wrap gap-2">{[0,30,90,180].map((days) => <button type="button" key={days} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${Number(list.days) === days ? "border-brand bg-brand/5 text-brand" : "border-slate-200"}`} onClick={() => update({ days })}>{days ? `${days}일 이상` : "전체 재고"}</button>)}</div><input aria-label="재고 분석 상품 검색" className="input-base" placeholder="교재명 검색" value={list.q} onChange={(e) => update({ q: e.target.value })} /><p className="text-xs text-slate-500">입고 등록 후 경과일 기준 · 활성 주문·재판매 보류 교재 제외 · 금액은 현재 판매가 합계. 30일 판매는 결제일 기준이며 현재 취소·환불 품목을 제외합니다.</p></div>
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!result.data?.items?.length}>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{result.data?.items.map((row) => <Link key={row.id} to={`/admin/products?product=${row.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">{row.cover_image_url ? <img src={row.cover_image_url} alt="" className="h-16 w-12 shrink-0 rounded object-cover" /> : <span className="h-16 w-12 shrink-0 rounded bg-slate-100" />}<div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.quantity}권 · {formatCurrency(row.inventory_value)}</p><p className="mt-1 text-xs text-slate-500">최근 30일 판매 {row.sold_30d}권 · {row.stock_days != null ? `대상 재고 기준 약 ${row.stock_days}일분` : "최근 판매 없음 · 가격 검토"}</p></div><span className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold tabular-nums text-amber-800">{row.age_days}일</span></Link>)}</div>
    </AdminQueryState>
    <AdminPagination currentPage={list.page} totalCount={result.data?.total_count || 0} pageSize={50} isLoading={result.loading} onPageChange={(page) => update({ page }, { replace: false })} />
  </AdminShell>;
}
