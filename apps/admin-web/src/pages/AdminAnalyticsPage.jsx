import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";

const PRESETS = [
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "90d", label: "최근 90일", days: 90 },
];

const SUBJECT_COLORS = ["#1B3A5C", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#A855F7", "#6B7280"];

function toIsoDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeRange(days) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - (days - 1));
  return { from: toIsoDate(from), to: toIsoDate(today), days };
}

function StatCard({ label, value, hint, tone = "default" }) {
  const toneClass = {
    default: "bg-white",
    primary: "bg-blue-50",
    success: "bg-emerald-50",
    warning: "bg-amber-50",
    danger: "bg-rose-50",
  }[tone];
  return (
    <div className={`rounded-2xl shadow-sm border border-slate-100 p-5 ${toneClass}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function ChartCard({ title, hint, children }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function AdminAnalyticsPage() {
  const [range, setRange] = useState(() => computeRange(30));
  const [kpi, setKpi] = useState(null);
  const [series, setSeries] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [subjectBreakdown, setSubjectBreakdown] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage("Supabase 환경 변수가 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");

    const [kpiResult, seriesResult, sellersResult, productsResult, subjectsResult] = await Promise.all([
      supabase.rpc("admin_dashboard_kpi", { p_from: range.from, p_to: range.to }),
      supabase.rpc("admin_dashboard_revenue_series", { p_days: range.days }),
      supabase.rpc("admin_dashboard_top_sellers", { p_limit: 10, p_from: range.from, p_to: range.to }),
      supabase.rpc("admin_dashboard_top_products", { p_limit: 10, p_from: range.from, p_to: range.to }),
      supabase.rpc("admin_dashboard_subject_breakdown", { p_from: range.from, p_to: range.to }),
    ]);

    const firstError = [kpiResult, seriesResult, sellersResult, productsResult, subjectsResult]
      .map((r) => r.error)
      .find(Boolean);
    if (firstError) {
      setErrorMessage(firstError.message || "데이터를 불러오지 못했어요.");
      setIsLoading(false);
      return;
    }

    setKpi(Array.isArray(kpiResult.data) ? kpiResult.data[0] : kpiResult.data);
    setSeries(Array.isArray(seriesResult.data) ? seriesResult.data : []);
    setTopSellers(Array.isArray(sellersResult.data) ? sellersResult.data : []);
    setTopProducts(Array.isArray(productsResult.data) ? productsResult.data : []);
    setSubjectBreakdown(Array.isArray(subjectsResult.data) ? subjectsResult.data : []);
    setIsLoading(false);
  }, [range.days, range.from, range.to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const seriesData = useMemo(
    () =>
      series.map((row) => ({
        date: row.bucket_date,
        label: row.bucket_date ? row.bucket_date.slice(5).replace("-", "/") : "",
        결제완료: Number(row.paid_amount) || 0,
        구매확정: Number(row.confirmed_amount) || 0,
        주문수: Number(row.order_count) || 0,
      })),
    [series],
  );

  const subjectData = useMemo(
    () =>
      subjectBreakdown.map((row) => ({
        name: row.subject || "기타",
        value: Number(row.total_sales) || 0,
        orderCount: Number(row.order_count) || 0,
      })),
    [subjectBreakdown],
  );

  return (
    <AdminShell title="대시보드" subtitle="매출/주문/검수 KPI와 트렌드 한눈에 확인">
      {/* 기간 선택 */}
      <div className="flex items-center gap-2 mb-5">
        {PRESETS.map((preset) => (
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              range.days === preset.days
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            key={preset.key}
            onClick={() => setRange(computeRange(preset.days))}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          {range.from} ~ {range.to}
        </span>
        <button
          className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          disabled={isLoading}
          onClick={loadData}
          type="button"
        >
          {isLoading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-4 py-3">
          {errorMessage}
        </p>
      ) : null}

      {/* KPI 카드 */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard
          label="결제완료 매출"
          tone="primary"
          value={formatCurrency(Number(kpi?.revenue_total) || 0)}
          hint={`${kpi?.paid_order_count ?? 0}건`}
        />
        <StatCard
          label="구매확정 매출"
          tone="success"
          value={formatCurrency(Number(kpi?.confirmed_revenue) || 0)}
          hint={`${kpi?.confirmed_order_count ?? 0}건`}
        />
        <StatCard
          label="정산 대기"
          tone="warning"
          value={formatCurrency(Number(kpi?.pending_settlement_amount) || 0)}
          hint="pending+approved"
        />
        <StatCard
          label="총 주문"
          value={`${kpi?.order_count ?? 0}건`}
          hint={`취소 ${kpi?.cancelled_order_count ?? 0} · 환불 ${kpi?.refunded_order_count ?? 0}`}
        />
        <StatCard
          label="검수 처리"
          value={`${kpi?.inspection_processed_count ?? 0}건`}
          hint="기간 내 inspected_at"
        />
        <StatCard
          label="누적 판매완료"
          value={`${kpi?.settled_book_count ?? 0}권`}
          hint="status=settled"
        />
      </section>

      {/* 매출 시계열 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="매출 추이" hint={`${range.days}일`}>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={seriesData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelStyle={{ color: "#1f2937" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="결제완료" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="구매확정" stroke="#10B981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* 과목별 매출 비율 */}
        <ChartCard title="과목별 매출 비율" hint={`${subjectData.length}개`}>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={subjectData}
                  dataKey="value"
                  innerRadius={50}
                  label={(entry) => entry.name}
                  outerRadius={90}
                >
                  {subjectData.map((entry, index) => (
                    <Cell key={entry.name} fill={SUBJECT_COLORS[index % SUBJECT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* 일별 주문수 */}
      <ChartCard title="일별 주문수" hint={`${range.days}일`}>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={seriesData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip />
              <Bar dataKey="주문수" fill="#1B3A5C" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 상위 셀러 */}
        <ChartCard title="상위 셀러 (정산 금액 기준)" hint="기간 내 approved/completed">
          {topSellers.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">데이터 없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2">셀러</th>
                  <th className="py-2 text-right">정산 금액</th>
                  <th className="py-2 text-right">권수</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((row, idx) => (
                  <tr className="border-b border-slate-50 last:border-0" key={row.seller_user_id}>
                    <td className="py-2.5">
                      <span className="inline-block w-5 text-xs text-slate-400 tabular-nums">{idx + 1}</span>
                      <span className="font-semibold text-slate-900">{row.seller_name || "Unknown"}</span>
                      <span className="ml-1 text-xs text-slate-400">
                        {(row.seller_email || "").replace(/@oauth\.subook\.local$/i, "(OAuth)")}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">
                      {formatCurrency(Number(row.total_net_amount) || 0)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.book_count}권</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>

        {/* 인기 상품 */}
        <ChartCard title="인기 상품 (매출 기준)" hint="기간 내 결제완료 이상">
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">데이터 없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2">상품</th>
                  <th className="py-2 text-right">매출</th>
                  <th className="py-2 text-right">판매</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row, idx) => (
                  <tr className="border-b border-slate-50 last:border-0" key={row.product_id}>
                    <td className="py-2.5">
                      <span className="inline-block w-5 text-xs text-slate-400 tabular-nums">{idx + 1}</span>
                      <span className="font-semibold text-slate-900">{row.product_title}</span>
                      <span className="ml-1 text-xs text-slate-400">
                        {row.product_subject ?? ""}{row.product_brand ? ` · ${row.product_brand}` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">
                      {formatCurrency(Number(row.total_sales) || 0)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">
                      {row.sold_quantity}권
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        마지막 업데이트: {kpi ? formatDate(new Date()) : "-"}
      </p>
    </AdminShell>
  );
}

export default AdminAnalyticsPage;
