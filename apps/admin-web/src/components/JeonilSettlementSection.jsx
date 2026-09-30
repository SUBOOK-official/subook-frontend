import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { JEONIL_SETTLEMENT_FEE_PERCENT, summarizeJeonilSettlements } from "@shared-domain/jeonilSettlement";
import { completeJeonilSettlements, fetchJeonilSettlementData } from "@shared-supabase/adminSettlementClient";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import AdminDialog from "./AdminDialog";
import { InlineLoading } from "./Loading";

const labels = { payable: "미지급", waiting: "정산 대기", completed: "지급 완료" };

function AmountSummary({ summary, amountLabel }) {
  return <dl className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
    {[["판매금액", summary.saleAmount], [`수수료 ${JEONIL_SETTLEMENT_FEE_PERCENT}%`, summary.feeAmount], [amountLabel, summary.netAmount]].map(([label, amount]) => (
      <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-lg font-black tabular-nums text-slate-950">{formatCurrency(amount)}</dd></div>
    ))}
  </dl>;
}

export default function JeonilSettlementSection({ status, refreshKey }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailMode, setDetailMode] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [reference, setReference] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("정산 서비스에 연결할 수 없습니다.");
      const result = await fetchJeonilSettlementData(supabase, () => request === requestRef.current);
      if (!result || request !== requestRef.current) return;
      // 잘못된 금액은 0원처럼 표시하지 않고 조회 오류로 처리한다.
      Object.keys(labels).forEach((key) => summarizeJeonilSettlements(result[key]));
      setData(result);
    } catch (cause) {
      if (request !== requestRef.current) return;
      setData(null);
      setError(cause?.message || "전일학원 정산 내역을 불러오지 못했습니다.");
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load, refreshKey]);

  const summaries = useMemo(() => Object.fromEntries(Object.keys(labels).map((key) => [key, summarizeJeonilSettlements(data?.[key])])), [data]);
  const summary = summaries[status];
  const details = data?.[detailMode] ?? [];
  const detailSummary = summaries[detailMode];
  const disabled = isLoading || isSaving || !data;
  const isPayable = status === "payable";
  const requestCompletion = () => {
    if (disabled || !data.payable.length) return;
    setReference("");
    setNotice("");
    setDetailMode(null);
    // 확인 화면에서 본 품목/금액을 고정하고 서버에서 다시 검증한다.
    setConfirmation({ rows: [...data.payable], summary: summaries.payable });
  };
  const complete = async () => {
    if (!confirmation || isSaving || reference.trim().length < 2) return;
    setIsSaving(true);
    try {
      await completeJeonilSettlements(supabase, confirmation.rows, confirmation.summary.netAmount, reference);
      setNotice("전일학원 지급 완료를 기록했습니다. 지급 완료 탭에서 확인할 수 있습니다.");
    } catch (cause) {
      setNotice(`${cause?.message || "지급 기록을 저장하지 못했습니다."} 목록을 다시 조회했습니다. 지급 완료 내역을 확인해 주세요.`);
    } finally {
      setConfirmation(null);
      await load();
      setIsSaving(false);
    }
  };

  return <section className="rounded-2xl border border-indigo-200 bg-white p-5 sm:p-6" aria-label="전일학원 모의고사 정산">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-950">전일학원 모의고사</h2><span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">별도 정산</span></div>
        <p className="mt-2 text-sm text-slate-500">전일학원 원장님 지급 · 수수료 {JEONIL_SETTLEMENT_FEE_PERCENT}%</p>
      </div>
      <span className="text-xs font-semibold text-slate-500">{labels[status]}</span>
    </div>
    {isLoading ? <div className="py-8"><InlineLoading label="전일학원 정산 내역을 불러오는 중..." /></div>
      : error ? <div className="mt-4 space-y-3" role="alert"><p className="text-sm text-rose-700">{error}</p><button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button" onClick={load}>전일학원 다시 불러오기</button></div>
        : <>
          <button className="mt-4 flex w-full flex-wrap items-center justify-between gap-4 rounded-xl bg-indigo-50/60 p-4 text-left hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600" type="button" disabled={disabled} onClick={() => setDetailMode(status)} aria-label={`전일학원 ${labels[status]} 상세`}>
            <span><span className="block text-xs font-semibold text-slate-500">{isPayable ? "원장님께 정산할 금액" : "원장님께 지급한 금액"}</span><span className="mt-1 block text-2xl font-black tabular-nums text-slate-950">{formatCurrency(summary.netAmount)}</span></span>
            <span className="text-right"><span className="block text-sm font-bold text-slate-700">{summary.quantity}권</span><span className="mt-1 block text-xs font-semibold text-indigo-700">교재 내역 보기 →</span></span>
          </button>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-500">{isPayable ? "구매확정된 미지급 판매분입니다. 원장님께 입금한 뒤 완료 처리해 주세요." : "입금 후 완료 처리한 내역입니다."}</p>
            {isPayable && data.payable.length > 0 ? <button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button" disabled={disabled} onClick={requestCompletion}>전일학원 지급 완료 처리</button> : null}
          </div>
          {isPayable && data.waiting.length > 0 ? <button className="mt-4 w-full border-t border-slate-100 pt-4 text-left text-xs font-semibold leading-5 text-slate-500 hover:text-slate-800" type="button" disabled={disabled} onClick={() => setDetailMode("waiting")}>정산 대기 {summaries.waiting.quantity}권 · 예상 지급액 {formatCurrency(summaries.waiting.netAmount)} · 사유 보기 →</button> : null}
          {!isPayable && data.completed.some((row) => row.refunded_after_payment) ? <p className="mt-3 text-sm font-semibold text-amber-700">지급 후 환불된 판매분이 있습니다. 상세 내역에서 확인해 주세요.</p> : null}
        </>}
    {notice ? <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700" role="status">{notice}</p> : null}

    <AdminDialog open={Boolean(detailMode) && !isLoading && Boolean(data)} title={`전일학원 ${labels[detailMode] ?? ""} 상세`} size="2xl" onClose={() => setDetailMode(null)}
      footer={<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">{detailSummary?.quantity ?? 0}권 · {formatCurrency(detailSummary?.netAmount ?? 0)}</p><div className="flex gap-2"><button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button" onClick={() => setDetailMode(null)}>닫기</button>{detailMode === "payable" && details.length > 0 ? <button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button" disabled={disabled} onClick={requestCompletion}>지급 완료 처리</button> : null}</div></div>}>
      {detailSummary ? <div className="space-y-5 p-5 sm:p-6">
        <AmountSummary summary={detailSummary} amountLabel={detailMode === "completed" ? "지급한 금액" : detailMode === "waiting" ? "예상 지급액" : "정산할 금액"} />
        <p className="text-xs leading-5 text-slate-500">주문 시 교재금액 기준 · 쿠폰/포인트 차감 전 · 배송비 제외</p>
        {details.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{labels[detailMode]} 내역이 없습니다.</p> : <>
          <div><h3 className="mb-3 font-bold text-slate-900">교재별 내역</h3><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3 text-left">교재 / 옵션</th><th className="px-3 py-3 text-right">수량</th><th className="px-3 py-3 text-right">판매금액</th><th className="px-3 py-3 text-right">수수료 50%</th><th className="px-3 py-3 text-right">지급액</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{detailSummary.products.map((product) => <tr key={product.key}><td className="px-3 py-4"><p className="font-bold text-slate-900">{product.title}</p><p className="mt-1 text-xs text-slate-500">{product.option}</p></td><td className="whitespace-nowrap px-3 py-4 text-right">{product.quantity}권</td><td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{formatCurrency(product.saleAmount)}</td><td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{formatCurrency(product.feeAmount)}</td><td className="whitespace-nowrap px-3 py-4 text-right font-bold tabular-nums">{formatCurrency(product.netAmount)}</td></tr>)}</tbody>
          </table></div></div>
          <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-700">주문별 상세 {details.length}건</summary><ul className="mt-3 divide-y divide-slate-100">{details.map((row) => <li className="space-y-1 py-3 text-xs text-slate-500" key={row.order_item_id}>
            <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-800">{row.book_title} {row.book_option} · {row.quantity}권</p><p className="font-bold tabular-nums text-slate-900">{formatCurrency(row.net_amount)}</p></div>
            <p>주문 {row.order_number}</p>
            {detailMode === "completed" ? <><p>지급 기록 {formatDate(row.completed_at)} · {row.transfer_reference}</p>{row.refunded_after_payment ? <p className="font-bold text-amber-700">지급 후 환불 · 원장님과 지급액 확인 필요</p> : null}</> : <p>{row.hold_reason || `구매확정 ${formatDate(row.confirmed_at)}`}</p>}
          </li>)}</ul></details>
        </>}
      </div> : null}
    </AdminDialog>

    <AdminDialog open={Boolean(confirmation)} title="전일학원 지급 완료 확인" busy={isSaving} onClose={() => setConfirmation(null)}
      footer={<div className="flex justify-end gap-2"><button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button" disabled={isSaving} onClick={() => setConfirmation(null)}>취소</button><button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button" disabled={isSaving || reference.trim().length < 2} onClick={complete}>{isSaving ? "기록하는 중..." : "입금 확인 · 지급 완료"}</button></div>}>
      {confirmation ? <div className="space-y-5 p-6"><p className="text-sm text-slate-600">전일학원 원장님 · 교재 {confirmation.summary.quantity}권</p><AmountSummary summary={confirmation.summary} amountLabel="입금 확인 금액" /><p className="text-sm font-semibold text-slate-700">원장님 계좌로 {formatCurrency(confirmation.summary.netAmount)}을 입금하셨다면 완료 처리해 주세요.</p><p className="text-xs text-slate-500">이 버튼은 지급 기록만 저장하며, 계좌이체를 실행하지 않습니다.</p><label className="block text-sm font-bold text-slate-700" htmlFor="jeonil-transfer-reference">이체 메모<textarea className="input mt-2 min-h-24 w-full" id="jeonil-transfer-reference" value={reference} maxLength={500} disabled={isSaving} onChange={(event) => setReference(event.target.value)} placeholder="예: 9월 30일 원장님 계좌 입금 완료" /><span className="mt-1 block text-xs font-normal text-slate-500">입금일과 확인 내용을 2자 이상 남겨 주세요.</span></label></div> : null}
    </AdminDialog>
  </section>;
}
