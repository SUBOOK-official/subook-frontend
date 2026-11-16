import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import AdminQueryState from "../components/AdminQueryState";
import { useAdminListState, useDebouncedSearch } from "../lib/useAdminListState";
import AdminViewTabs from "../components/AdminViewTabs";
import { SearchIcon } from "../components/icons";
import { useAdminOperations } from "../lib/useAdminOperations";
import { formatCurrency } from "@shared-domain/format";

export default function AdminInventoryInsightsPage() {
  const [list, update] = useAdminListState({ q: "", days: "90", page: 1 });
  const result = useAdminOperations("inventory", list);
  const [searchInput, setSearchInput] = useDebouncedSearch(list.q, (q) => update({ q }));
  return <AdminShell title="재고 분석" activeModule="inventory-insights" summaryCards={result.data ? [{ label: "대상 상품", value: `${result.data.total_count}종` }, { label: "가용 재고", value: `${result.data.quantity}권` }, { label: "현재 판매가 합계", value: formatCurrency(result.data.inventory_value) }] : []}>
    <AdminViewTabs activeKey={String(Number(list.days))} label="입고 후 경과일" onSelect={(days) => update({ days })} tabs={[0, 30, 90, 180].map((days) => ({ key: String(days), label: days ? `${days}일 이상` : "전체 재고" }))} />
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <label className="relative block">
        <span className="sr-only">재고 분석 상품 검색</span>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white pl-10 pr-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-[15px]" placeholder="교재명" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
      </label>
      <p className="mt-2.5 text-[13px] text-slate-500">입고 등록 후 경과일 기준 · 활성 주문·재판매 보류 교재 제외 · 금액은 현재 판매가 합계. 30일 판매는 결제일 기준이며 현재 취소·환불 품목을 제외합니다.</p>
    </div>
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!result.data?.items?.length}>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{result.data?.items.map((row) => <Link key={row.id} to={`/admin/products?product=${row.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">{row.cover_image_url ? <img src={row.cover_image_url} alt="" className="h-16 w-12 shrink-0 rounded object-cover" /> : <span className="h-16 w-12 shrink-0 rounded bg-slate-100" />}<div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.quantity}권 · {formatCurrency(row.inventory_value)}</p><p className="mt-1 text-xs text-slate-500">최근 30일 판매 {row.sold_30d}권 · {row.stock_days != null ? `대상 재고 기준 약 ${row.stock_days}일분` : "최근 판매 없음 · 가격 검토"}</p></div><span className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold tabular-nums text-amber-800">{row.age_days}일</span></Link>)}</div>
    </AdminQueryState>
    <AdminPagination currentPage={list.page} totalCount={result.data?.total_count || 0} pageSize={50} isLoading={result.loading} onPageChange={(page) => update({ page }, { replace: false })} />
  </AdminShell>;
}
