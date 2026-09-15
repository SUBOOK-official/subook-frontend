import { useEffect, useState } from "react";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";

// 상품 등록 '기존 교재 재고 추가'의 판매 내역 (2026-09-15).
// 옵션별 요약만으로는 판매가를 정하기 어렵고, 재고가 모두 빠진 상품은 옵션 행 자체가 사라져
// '기본 옵션'만 보였다. 실제 판매 기록(주문·식스샵/수동 정산)과, 학년도·띄어쓰기만 다른
// 같은 교재 상품(연도 오기·중복 등록)의 현재 재고를 함께 보여준다.
const GRADE_LABEL = { S: "S", A_PLUS: "A+", A: "A" };
const SOURCE_LABEL = { order: "주문", manual: "식스샵·수동" };

function formatKstDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" });
}

function priceRange(min, max) {
  if (min == null && max == null) return null;
  return min === max ? formatCurrency(min) : `${formatCurrency(min)}~${formatCurrency(max)}`;
}

export default function RegisterSalesHistory({ productId }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!productId || !supabase) return undefined;
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    supabase
      .rpc("admin_get_register_sales_history", { p_product_id: productId, p_limit: 30 })
      .then(({ data, error }) => {
        if (cancelled) return;
        setState({ loading: false, error: error ? error.message || "판매 내역을 불러오지 못했습니다." : null, data: error ? null : data });
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const sales = Array.isArray(state.data?.sales) ? state.data.sales : [];
  const salesCount = Number(state.data?.sales_count ?? 0);
  const similar = Array.isArray(state.data?.similar_products) ? state.data.similar_products : [];

  return (
    <div className="mt-5">
      <h3 className="text-sm font-black text-slate-900">
        판매 내역
        {!state.loading && !state.error ? <span className="ml-1.5 text-xs font-bold text-slate-500">{salesCount}건</span> : null}
      </h3>

      {state.loading ? (
        <p className="mt-2 text-xs text-slate-400">판매 내역을 불러오는 중…</p>
      ) : state.error ? (
        <p className="mt-2 text-xs text-rose-600">{state.error}</p>
      ) : sales.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">이 상품으로 판매된 기록이 없습니다.</p>
      ) : (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left font-bold text-slate-500">
              <tr>
                <th className="px-3 py-2">판매일</th>
                <th className="px-3 py-2">옵션</th>
                <th className="px-3 py-2">등급</th>
                <th className="px-3 py-2 text-right">판매가</th>
                <th className="px-3 py-2">경로</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((sale, index) => (
                <tr key={`${sale.sold_at}-${index}`}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 tabular-nums">{formatKstDate(sale.sold_at)}</td>
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{sale.option || "기본 옵션"}</td>
                  <td className="px-3 py-1.5 text-slate-600">{GRADE_LABEL[sale.grade] ?? sale.grade ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(sale.price)}</td>
                  <td className="px-3 py-1.5 text-slate-500">{SOURCE_LABEL[sale.source] ?? sale.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {salesCount > sales.length ? (
            <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">최근 {sales.length}건 표시 · 전체 {salesCount}건</p>
          ) : null}
        </div>
      )}

      {similar.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-bold text-amber-900">학년도·띄어쓰기만 다른 같은 제목 상품</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-900">
            {similar.map((item) => (
              <li key={item.id}>
                <span className="font-semibold">{item.title}</span>
                <span className="ml-1 text-amber-700">#{item.id}</span>
                <span className="ml-1">
                  {[
                    `판매중 ${item.stock_count}권`,
                    priceRange(item.min_price, item.max_price),
                    item.options?.length ? `옵션 ${item.options.join("·")}` : null,
                    item.locations?.length ? `위치 ${item.locations.join("·")}` : null,
                    Number(item.sold_count) > 0 ? `주문·정산 ${item.sold_count}권` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
