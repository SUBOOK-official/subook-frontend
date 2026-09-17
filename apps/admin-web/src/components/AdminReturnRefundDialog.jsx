import { useCallback, useEffect, useState } from "react";
import AdminDialog from "./AdminDialog";
import { BusyText } from "./Loading";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { RETURN_REASONS, RETURN_STATUS_LABELS, getReturnRefundPreview, requiresPhysicalReturn } from "@shared-domain/returns";

export default function AdminReturnRefundDialog({ order, onClose, onCompleted, onChanged, onRegisterPickup, refundAccount }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pgProvider, setPgProvider] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ids, setIds] = useState(() => (order.items ?? []).filter(i => !i.refunded_at).map(i => i.id));
  const [reasonCode, setReasonCode] = useState("buyer_remorse");
  const [reason, setReason] = useState(order.refund_request_reason || "단순변심으로 반품 요청");
  const [receivedIds, setReceivedIds] = useState([]);
  const [note, setNote] = useState("");
  const [inspected, setInspected] = useState(false);
  const [restock, setRestock] = useState(false);
  const [manual, setManual] = useState(false);
  const [amount, setAmount] = useState("");
  const [deduction, setDeduction] = useState("");
  const [amountNote, setAmountNote] = useState("");
  const [transfer, setTransfer] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [directConfirmed, setDirectConfirmed] = useState(false);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const active = cases.find(row => !["refunded", "cancelled"].includes(row.status));
  const isBank = order.payment_method === "bank_transfer";
  const canRetryRemaining = active?.status === "attention" && !isBank && pgProvider === "nicepay"
    && active.refunded_before > 0 && active.refund_amount > 0
    && active.refund_amount === active.remaining_before
    && active.remaining_before === Number(order.total_amount) - Number(order.refunded_amount)
    && (order.items ?? []).every(item => item.refunded_at || active.items.some(selected => selected.id === item.id));
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error: loadError }, payment] = await Promise.all([
        supabase.rpc("admin_get_order_returns", { p_order_id: order.id }).abortSignal(AbortSignal.timeout(15000)),
        supabase.from("orders").select("pg_provider").eq("id", order.id).single().abortSignal(AbortSignal.timeout(15000)),
      ]);
      if (loadError) throw loadError;
      if (payment.error) throw payment.error;
      setPgProvider(payment.data.pg_provider);
      setCases(Array.isArray(data) ? data : []); setLoadFailed(false);
      return true;
    } catch (err) {
      setLoadFailed(true); setError(`반품 정보를 불러오지 못했습니다: ${err.message}`);
      return false;
    } finally { setLoading(false); }
  }, [order.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await fn(); }
    catch (err) {
      // 응답이 유실되어도 서버에서 접수/환불이 진행됐을 수 있으므로 현재 단계를 다시 조회한다.
      await load();
      setError(err.message || "처리에 실패했습니다. 다시 확인해주세요.");
    }
    finally { setBusy(false); }
  };
  const mutate = async (name, params) => {
    const { error: rpcError } = await supabase.rpc(name, params).abortSignal(AbortSignal.timeout(20000));
    if (rpcError) throw rpcError;
    setReceivedIds([]); setConfirmed(false); setInspected(false); setClosing(false);
    await load();
    await onChanged?.();
  };
  const preview = getReturnRefundPreview(order, active ? active.items.map(i => i.id) : ids,
    active?.reason_code ?? reasonCode, active?.requires_return);
  const noReturnSelected = !active && reasonCode === "not_delivered";
  const manualRequired = manual || !preview.automatic;
  const amountNum = Number(amount);
  const deductionNum = Number(deduction);
  const manualValid = !manualRequired || (amount.trim() !== "" && deduction.trim() !== ""
    && Number.isInteger(amountNum) && amountNum > 0 && Number.isInteger(deductionNum)
    && deductionNum >= 0 && deductionNum <= 6000 && amountNum + deductionNum <= preview.remaining && amountNote.trim().length >= 5);
  const noReturnManualValid = preview.automatic || (amount.trim() !== "" && Number.isInteger(amountNum)
    && amountNum > 0 && amountNum <= preview.remaining && amountNote.trim().length >= 5);
  const noReturnRefundAmount = preview.automatic ? preview.amount : (noReturnManualValid ? amountNum : null);
  const draft = active && ["requested", "received", "review_hold"].includes(active.status);
  const allReceived = active && (!active.requires_return || active.items.every(i => i.received_at));
  const executeRefund = async ({ returnId, action = "execute", transferReference = "", reasonText }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
    const response = await fetch("/api/admin/payment-cancel", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      signal: AbortSignal.timeout(65000),
      body: JSON.stringify({ returnId, action, transferReference, acknowledgeRecovery: recoveryNeeded && recoveryPhrase === "손실 감수" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      if ((body.error || "").includes("RECOVERY_REQUIRED_ACK")) setRecoveryNeeded(true);
      throw new Error(body.error || "환불 결과를 확인하지 못했습니다. 다시 실행하기 전에 결제 결과를 확인해주세요.");
    }
    if (!body.data?.already_completed) await onCompleted(body.data, order, reasonText);
    else { await onChanged?.(); onClose(); }
  };
  const submit = async (action = "execute") => {
    await run(() => executeRefund({
      returnId: active.id,
      action,
      transferReference: transfer.trim(),
      reasonText: active.reason,
    }));
  };
  const submitNoReturn = async () => {
    await run(async () => {
      const { data, error: prepareError } = await supabase.rpc("admin_prepare_no_return_refund", {
        p_order_id: order.id,
        p_item_ids: ids,
        p_reason: reason,
        p_restock: restock,
        p_manual_amount: preview.automatic ? null : amountNum,
        p_amount_note: preview.automatic ? null : amountNote,
      }).abortSignal(AbortSignal.timeout(20000));
      if (prepareError) throw prepareError;
      setDirectConfirmed(false);
      if (isBank) {
        await load();
        await onChanged?.();
        return;
      }
      await executeRefund({ returnId: data.return_id, reasonText: reason });
    });
  };
  const toggle = (list, id) => list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  return (
    <AdminDialog open busy={busy} onClose={onClose} size="md" title={`반품·환불 — ${order.order_number}`} dirty={Boolean((draft && note) || (closing && closeNote))}>
      <div className="p-6 space-y-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {loadFailed ? <button className="btn-secondary" type="button" disabled={loading || busy} onClick={() => { setError(""); load(); }}>반품 정보 다시 불러오기</button> : null}
        {loading ? <BusyText>반품 정보 확인 중...</BusyText> : null}
        {!loading && !error && !active && order.status === "refunded" ? <p>이미 환불 완료된 주문입니다.</p> : null}
        {!loading && !active && order.status !== "refunded" ? (
          <fieldset disabled={busy || loadFailed} className="space-y-4">
            <p className="text-sm text-slate-600">{noReturnSelected
              ? "구매자에게 전달되지 않은 상품은 반품 수거·도착 확인 없이 바로 환불할 수 있습니다."
              : "접수 단계에서는 돈이 환불되지 않습니다. 배송된 교재는 도착·검수 승인 후 최종 환불을 실행합니다."}</p>
            <div className="space-y-2">
              {(order.items ?? []).filter(i => !i.refunded_at).map(item => (
                <label key={item.id} className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <input type="checkbox" checked={ids.includes(item.id)} onChange={() => setIds(toggle(ids, item.id))} />
                  <span className="flex-1">{item.title}</span><span>{formatCurrency(item.total_price)}</span>
                </label>
              ))}
            </div>
            <label className="block text-sm font-semibold">반품·취소 사유
              <select className="input-base mt-1" value={reasonCode} onChange={event => {
                const value = event.target.value; setReasonCode(value);
                setReason(value === "buyer_remorse" ? "단순변심으로 반품 요청"
                  : value === "seller_fault" ? "상품 하자·오배송으로 반품 요청"
                    : value === "not_delivered" ? "미발송·배송 누락으로 회수 없이 환불" : "");
                setRestock(value === "not_delivered");
                setDirectConfirmed(false);
              }}>{RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            </label>
            <label className="block text-sm font-semibold">상세 사유
              <textarea className="input-base mt-1" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} />
            </label>
            <p className="text-sm text-slate-600">{preview.automatic
              ? `예상 환불액 ${formatCurrency(Math.max(0, preview.amount))} · 배송비 차감 ${formatCurrency(preview.deduction)}`
              : "일부 품목·기타 사유는 검수 후 할인과 배송비를 확인하여 최종 금액을 입력합니다."}</p>
            {noReturnSelected ? (
              <div className="space-y-3 rounded-lg bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">실제 미발송 또는 배송 누락이 확인된 경우에만 사용해주세요. CJ 반품 수거와 도착 확인을 생성하지 않습니다.</p>
                {!preview.automatic ? <>
                  <p className="text-sm text-slate-700">일부 품목 또는 기존 환불이 있는 주문은 실제 결제·할인 내역을 확인해 금액을 입력해주세요.</p>
                  <label className="block text-sm">최종 환불액 (원)<input className="input-base mt-1" type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
                  <label className="block text-sm">계산·조정 근거<textarea className="input-base mt-1" value={amountNote} onChange={e => setAmountNote(e.target.value)} maxLength={1000} /></label>
                </> : null}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)} />상품이 창고에 있어 환불 완료 후 재판매 가능 (미체크 시 재고 보류)</label>
                <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={directConfirmed} onChange={event => setDirectConfirmed(event.target.checked)} />선택 상품이 구매자에게 전달되지 않아 회수가 불필요함을 확인했습니다.</label>
                <button type="button" className="btn-danger" disabled={!ids.length || reason.trim().length < 5 || !directConfirmed || !noReturnManualValid || noReturnRefundAmount <= 0}
                  onClick={submitNoReturn}>
                  {isBank ? "회수 없이 환불 승인" : `${formatCurrency(noReturnRefundAmount)} 카드 환불 실행 (회수 없음)`}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary" disabled={!ids.length || reason.trim().length < 5}
                onClick={() => run(() => mutate("admin_start_order_return", { p_order_id: order.id, p_item_ids: ids, p_reason_code: reasonCode, p_reason: reason }))}>
                반품·취소 접수
              </button>
            )}
          </fieldset>
        ) : null}
        {!loading && active ? (
          <>
            <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
              <strong>{active.status === "requested" && !active.requires_return ? "취소 확인 대기" : RETURN_STATUS_LABELS[active.status]}</strong>
              <p>{active.reason}</p>
              <p className="text-slate-500">{active.requires_return
                ? "접수 → 도착 확인 → 검수 승인 → 환불 실행"
                : requiresPhysicalReturn(order) ? "미발송·배송 누락 확인 · 실물 회수 불필요" : "발송 전 취소 · 실물 회수 불필요"}</p>
              {active.received_at ? <p>첫 반품 도착 {formatDate(active.received_at)} · 반환받은 날부터 3영업일 이내 환급 처리</p> : null}
            </div>
            <fieldset disabled={busy || loadFailed} className="space-y-2">
              {active.items.map(item => (
                <label key={item.id} className="flex items-start gap-2 text-sm rounded-lg border border-slate-200 p-3">
                  {draft && active.requires_return && !item.received_at ? <input type="checkbox" checked={receivedIds.includes(item.id)}
                    onChange={() => setReceivedIds(toggle(receivedIds, item.id))} /> : null}
                  <span className="flex-1">{item.title}</span>
                  <span className="text-slate-500">{item.received_at ? "도착 확인됨" : active.requires_return ? "도착 대기" : "발송 전"}</span>
                </label>
              ))}
              {draft && active.requires_return && !allReceived ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" type="button" disabled={!receivedIds.length} onClick={() => run(() => mutate("admin_receive_order_return", { p_return_id: active.id, p_item_ids: receivedIds }))}>선택 교재 도착 확인</button>
                  <button className="btn-ghost" type="button" onClick={() => run(async () => { await onRegisterPickup(order.id); await load(); })}>CJ 반품 수거 접수</button>
                </div>
              ) : null}
            </fieldset>
            {draft ? (
              <fieldset disabled={busy || loadFailed} className="space-y-4">
                <label className="block text-sm font-semibold">{active.requires_return ? "검수 기록" : "취소 확인 기록"}
                  <textarea className="input-base mt-1" value={note} onChange={event => setNote(event.target.value)} maxLength={2000}
                    placeholder="교재·수량·구성품·추가 필기와 훼손 여부를 기록해주세요." />
                </label>
                {active.inspection_note ? <p className="text-sm text-amber-700">이전 확인 기록: {active.inspection_note}</p> : null}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={inspected} onChange={event => setInspected(event.target.checked)} />{active.requires_return ? "도착한 교재와 구성품·필기·훼손 상태를 확인했습니다." : "출고 전이며 취소 가능한 주문임을 확인했습니다."}</label>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)} />환불 완료 후 선택 교재 모두 재판매 가능 (미체크 시 재고 보류)</label>
                {preview.automatic ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={manual} onChange={event => setManual(event.target.checked)} />기존 합의·별도 사유로 금액 직접 조정</label> : null}
                {manualRequired ? (
                  <div className="space-y-3 rounded-lg bg-amber-50 p-3">
                    <p className="text-sm">쿠폰·포인트 할인, 이전 환불과 배송비 차감 내역을 확인해주세요. 현금 환불액에 포인트를 더하지 않습니다.</p>
                    <label className="block text-sm">최종 환불액 (원)<input className="input-base mt-1" type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
                    <label className="block text-sm">이번 배송비 차감액 (0~6,000원)<input className="input-base mt-1" type="number" min="0" max="6000" step="1" value={deduction} onChange={e => setDeduction(e.target.value)} /></label>
                    <label className="block text-sm">계산·조정 근거<textarea className="input-base mt-1" value={amountNote} onChange={e => setAmountNote(e.target.value)} maxLength={1000} /></label>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
                    <p>배송비 포함 결제잔액 <strong>{formatCurrency(preview.remaining)}</strong></p>
                    <p>배송비 차감 −{formatCurrency(preview.deduction)}</p>
                    <p>예상 환불액 <strong>{formatCurrency(Math.max(0, preview.amount))}</strong></p>
                    {preview.amount <= 0 ? <p className="text-rose-700">환불액이 0원 이하입니다. 별도 수납·종결 방법을 확인해주세요.</p> : null}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" type="button" disabled={!allReceived || !inspected || note.trim().length < 5 || !manualValid || (!manualRequired && preview.amount <= 0)}
                    onClick={() => run(() => mutate("admin_review_order_return", { p_return_id: active.id, p_approve: true, p_note: note, p_restock: restock,
                      p_manual_amount: manualRequired ? amountNum : null, p_shipping_deduction: manualRequired ? deductionNum : null, p_amount_note: manualRequired ? amountNote : null }))}>검수·환불액 승인 (환불은 다음 단계)</button>
                  <button className="btn-ghost" type="button" disabled={note.trim().length < 5} onClick={() => run(() => mutate("admin_review_order_return", { p_return_id: active.id, p_approve: false, p_note: note }))}>검수 보류</button>
                </div>
              </fieldset>
            ) : null}
            {active.status === "approved" ? (
              <fieldset disabled={busy || loadFailed} className="space-y-4">
                <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-2">
                  <p>환불 기준액 {formatCurrency(active.refund_base)}</p><p>배송비 차감 −{formatCurrency(active.shipping_deduction)}</p>
                  <p className="text-lg font-bold">최종 환불액 {formatCurrency(active.refund_amount)}</p>
                  <p>{active.restock ? "환불 후 재판매 복원" : "환불 후 재고 보류 · 별도 재검수/폐기 처리"}</p>
                  <p>검수 기록: {active.inspection_note}</p>
                  {active.amount_note ? <p>금액 근거: {active.amount_note}</p> : null}
                </div>
                {isBank ? <>
                  {refundAccount}
                  <p className="text-sm font-semibold text-amber-700">자동 송금되지 않습니다. 위 환불액을 직접 송금한 뒤 완료를 기록해주세요.</p>
                  <label className="block text-sm">송금일시·확인번호<input className="input-base mt-1" value={transfer} onChange={e => setTransfer(e.target.value)} maxLength={150} /></label>
                </> : <p className="text-sm text-slate-600">아래 버튼을 누르면 카드 결제 취소가 실제로 요청됩니다. 카드사 반영까지 시간이 걸릴 수 있습니다.</p>}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{isBank ? "환불계좌와 금액을 확인하고 실제 송금을 완료했습니다." : "검수 결과와 최종 환불액을 확인했습니다."}</label>
                {recoveryNeeded ? <label className="block text-sm text-rose-700">이미 송금된 셀러 정산금은 회사 손실로 남습니다. 동의하면 ‘손실 감수’를 입력해주세요.<input className="input-base mt-1" value={recoveryPhrase} onChange={e => setRecoveryPhrase(e.target.value)} /></label> : null}
                <button className="btn-danger" type="button" disabled={!confirmed || (isBank && transfer.trim().length < 5) || (recoveryNeeded && recoveryPhrase !== "손실 감수")}
                  onClick={() => submit()}>{busy ? <BusyText>처리 중...</BusyText> : `${formatCurrency(active.refund_amount)} ${isBank ? "송금 완료 기록" : "카드 환불 실행"}`}</button>
              </fieldset>
            ) : null}
            {["processing", "attention"].includes(active.status) ? <div className="space-y-3 text-sm">
              <p className="text-amber-700">{active.failure_note || "환불 요청 결과를 확인하고 있습니다."}</p>
              <p>{isBank ? "다시 송금하지 마세요. 기존 송금 확인 기록으로 장부 반영을 재확인합니다." : "결제 취소를 다시 요청하지 않고, PG 거래내역을 조회해 승인된 환불액과 일치하는지 확인합니다."}</p>
              <button className="btn-secondary" type="button" disabled={busy} onClick={() => submit("reconcile")}>기존 환불 결과 확인</button>
              {canRetryRemaining ? <fieldset disabled={busy} className="space-y-3 border-t border-slate-200 pt-3">
                <p>기존 부분 환불을 제외한 잔액 {formatCurrency(active.refund_amount)}을 환불할 수 있습니다. 결제사에서 잔액을 확인한 뒤 진행하며, 이미 환불됐다면 완료 결과만 반영합니다.</p>
                <label className="flex gap-2"><input type="checkbox" checked={retryConfirmed} onChange={event => setRetryConfirmed(event.target.checked)} />남은 {formatCurrency(active.refund_amount)} 전액을 환불하겠습니다.</label>
                <button className="btn-danger" type="button" disabled={!retryConfirmed || busy} onClick={() => submit("retry_remaining")}>{busy ? <BusyText>처리 중...</BusyText> : `잔액 ${formatCurrency(active.refund_amount)} 환불 재시도`}</button>
              </fieldset> : null}
            </div> : null}
            {["requested", "received", "review_hold", "approved"].includes(active.status) ? <div className="border-t border-slate-200 pt-3 space-y-2">
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => setClosing(!closing)}>반품 반려·접수 종결</button>
              {closing ? <>
                <p className="text-sm text-amber-700">환불 없이 종결하며 자동 구매확정·정산 보류가 해제됩니다. 구매자 안내와 CJ 수거 취소 여부를 확인해주세요.</p>
                <label className="block text-sm">종결 사유<textarea className="input-base mt-1" value={closeNote} onChange={e => setCloseNote(e.target.value)} /></label>
                <button className="btn-danger" type="button" disabled={busy || closeNote.trim().length < 5} onClick={() => run(() => mutate("admin_cancel_order_return", { p_return_id: active.id, p_note: closeNote }))}>환불 없이 종결</button>
              </> : null}
            </div> : null}
          </>
        ) : null}
        {cases.filter(row => ["refunded", "cancelled"].includes(row.status)).map(row => (
          <p key={row.id} className="text-xs text-slate-500">{formatDate(row.completed_at)} · {RETURN_STATUS_LABELS[row.status]} · {row.items.map(i => i.title).join(", ")}{row.status === "refunded" ? ` · ${formatCurrency(row.refund_amount)}` : ""}</p>
        ))}
        <button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>닫기</button>
      </div>
    </AdminDialog>
  );
}
