import { useCallback, useEffect, useRef, useState } from "react";
import AdminDialog from "./AdminDialog";
import { BusyText } from "./Loading";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { bookConditionLabel } from "@shared-domain/status";
import { RETURN_REASONS, RETURN_STATUS_LABELS, getReturnRefundPreview, requiresPhysicalReturn } from "@shared-domain/returns";
import { getUndiscountedRefundSuggestion, getReturnGuideStage, hasPreDispatchReason } from "../lib/refundGuidance";

function InventoryChoice({ value, onChange, discardOnly = false }) {
  if (discardOnly) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
    <strong>재판매 불가 · 환불 후 폐기 처리</strong>
    <p>환불해도 판매 재고로 돌아가지 않습니다. 환불 완료 후 주문 상세의 ‘보류 교재 폐기’로 마무리해주세요. 고객에게 수거를 요청하지 않습니다.</p>
  </div>;
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold mb-2">환불 후 교재를 어떻게 처리하나요?</legend>
    {[
      ["restock", "재판매 가능", "선택한 교재 전부가 창고에 있고, 상태 확인이 끝났습니다. 환불 후 바로 판매됩니다."],
      ["hold", "재판매 불가·추가 확인 필요", "판매를 막아 둡니다. 환불 후 주문 상세에서 교재를 확인하고 폐기하거나 재판매합니다."],
    ].map(([key, title, description]) => <label key={key} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${value === key ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}>
      <input className="mt-1" type="radio" name="return-inventory" value={key} checked={value === key} onChange={() => onChange(key)} />
      <span><strong className="block">{title}</strong><span className="block mt-1 text-slate-600">{description}</span></span>
    </label>)}
  </fieldset>;
}

function ReturnItemDetails({ item, orderItem }) {
  // 반품 조회는 품목 ID·제목·도착 상태만 제공하므로 주문 당시 옵션을 ID로 연결한다.
  const details = { ...orderItem, ...item };
  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words">{details.title}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-800 break-words">
          옵션: {details.option_label?.trim() || "옵션 없음"}
        </span>
        {details.condition_grade ? <span className="text-slate-600">등급 {bookConditionLabel[details.condition_grade] || details.condition_grade}</span> : null}
        {details.quantity != null ? <span className="text-slate-600">{details.quantity}권</span> : null}
        {details.book_serial_number != null ? <span className="font-mono text-slate-600">No.{details.book_serial_number}</span> : null}
        {details.book_location ? <span className="text-slate-500">위치 {details.book_location}</span> : null}
      </span>
    </span>
  );
}

export default function AdminReturnRefundDialog({ order, onClose, onCompleted, onChanged, onRegisterPickup, refundAccount }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pgProvider, setPgProvider] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentDetails, setPaymentDetails] = useState({});
  const [ids, setIds] = useState([]);
  const [deliveryRoute, setDeliveryRoute] = useState("");
  const [notSentReason, setNotSentReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [receivedIds, setReceivedIds] = useState([]);
  const [note, setNote] = useState("");
  const [inspected, setInspected] = useState(false);
  const [inventoryChoice, setInventoryChoice] = useState("");
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [manual, setManual] = useState(false);
  const [amount, setAmount] = useState("");
  const [deduction, setDeduction] = useState("");
  const [amountNote, setAmountNote] = useState("");
  const [transfer, setTransfer] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [directConfirmed, setDirectConfirmed] = useState(false);
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const running = useRef(false);
  const guideRef = useRef(null);
  const orderItemsById = new Map((order.items ?? []).map(item => [String(item.id), item]));
  const active = cases.find(row => !["refunded", "cancelled"].includes(row.status));
  const waivedSelected = !active && deliveryRoute === "sent_no_return";
  const noReturnSelected = !active && (deliveryRoute === "not_sent" || waivedSelected);
  const discardOnly = waivedSelected || Boolean(active?.return_waived) || (noReturnSelected && notSentReason === "inspection_failed");
  const restock = !discardOnly && inventoryChoice === "restock";
  const inventoryChosen = discardOnly || Boolean(inventoryChoice);
  const currentOrder = { ...order, ...paymentDetails };
  const unrefundedItems = (order.items ?? []).filter(item => !item.refunded_at);
  const selectedItems = (order.items ?? []).filter(item => ids.includes(item.id));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const guide = getReturnGuideStage(active);
  const selectionKey = ids.join(",");
  const caseKey = active ? `${active.id}:${active.status}` : "new";
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
        supabase.from("orders").select("pg_provider,total_amount,subtotal,shipping_fee,discount_amount,coupon_discount_amount,points_used,refunded_amount").eq("id", order.id).single().abortSignal(AbortSignal.timeout(15000)),
      ]);
      if (loadError) throw loadError;
      if (payment.error) throw payment.error;
      setPgProvider(payment.data.pg_provider);
      setPaymentDetails(payment.data);
      setCases(Array.isArray(data) ? data : []); setLoadFailed(false);
      return true;
    } catch (err) {
      setLoadFailed(true); setError(`반품 정보를 불러오지 못했습니다: ${err.message}`);
      return false;
    } finally { setLoading(false); }
  }, [order.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setConfirmed(false); setRetryConfirmed(false); setInspected(false); setReceiptConfirmed(false);
    setInventoryChoice(""); setAmount(""); setDeduction(""); setAmountNote(""); setManual(false); setNote("");
    setRecoveryNeeded(false); setRecoveryPhrase("");
    guideRef.current?.scrollIntoView({ block: "nearest" });
  }, [caseKey]);
  // 대상이나 입력을 바꾼 뒤에는 이전 확인 체크를 재사용하지 않는다.
  useEffect(() => { setDirectConfirmed(false); setSentConfirmed(false); }, [selectionKey, deliveryRoute, reasonCode, reason, inventoryChoice, amount, amountNote]);
  const run = async (fn) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError("");
    try { await fn(); }
    catch (err) {
      // 응답이 유실되어도 서버에서 접수/환불이 진행됐을 수 있으므로 현재 단계를 다시 조회한다.
      await load();
      setError(err.message || "처리에 실패했습니다. 다시 확인해주세요.");
    }
    finally { running.current = false; setBusy(false); }
  };
  const mutate = async (name, params) => {
    const { error: rpcError } = await supabase.rpc(name, params).abortSignal(AbortSignal.timeout(20000));
    if (rpcError) throw rpcError;
    setReceivedIds([]); setReceiptConfirmed(false); setConfirmed(false); setInspected(false); setClosing(false);
    await load();
    await onChanged?.();
  };
  const preview = getReturnRefundPreview(currentOrder, active ? active.items.map(i => i.id) : ids,
    active?.reason_code ?? reasonCode, active?.requires_return);
  const suggestedAmount = getUndiscountedRefundSuggestion(currentOrder, ids);
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
      if (!ids.length || (!waivedSelected && !notSentReason) || reason.trim().length < 5 || !directConfirmed || !inventoryChosen || !noReturnManualValid || noReturnRefundAmount <= 0) return;
      const { error: prepareError } = await supabase.rpc(waivedSelected ? "admin_prepare_delivered_no_return_refund" : "admin_prepare_no_return_refund", {
        p_order_id: order.id,
        p_item_ids: ids,
        p_reason: reason,
        ...(!waivedSelected ? { p_restock: restock } : {}),
        p_manual_amount: preview.automatic ? null : amountNum,
        p_amount_note: preview.automatic ? null : amountNote,
      }).abortSignal(AbortSignal.timeout(20000));
      if (prepareError) throw prepareError;
      setDirectConfirmed(false);
      // 회수 없는 환불도 승인 스냅샷을 보여준 뒤 별도 실행한다.
      await load();
      await onChanged?.();
    });
  };
  const toggle = (list, id) => list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  const changeSelection = (nextIds) => {
    setIds(nextIds); setAmount(""); setAmountNote(""); setInventoryChoice("");
  };
  const changeDeliveryRoute = (route) => {
    setDeliveryRoute(route); setReasonCode(route === "not_sent" ? "not_delivered" : route === "sent_no_return" ? "seller_fault" : "");
    setNotSentReason(""); setReason(""); setInventoryChoice(""); setAmount(""); setAmountNote("");
  };
  return (
    <AdminDialog open busy={busy} onClose={onClose} size="lg" title={`반품·환불 — ${order.order_number}`} dirty={Boolean((!active && ids.length) || (draft && note) || (closing && closeNote))}>
      <div className="p-6 space-y-5">
        <div ref={guideRef} className="rounded-xl bg-indigo-50 p-4 space-y-1" aria-live="polite">
          <p className="text-xs font-bold text-indigo-600">{guide.number}단계 · {active?.requires_return ? "고객 반품" : active ? "실물 회수 없음" : "안전한 환불 안내"}</p>
          <h3 className="font-bold text-slate-900">{guide.title}</h3>
          <p className="text-sm text-slate-600">{guide.help}</p>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {loadFailed ? <button className="btn-secondary" type="button" disabled={loading || busy} onClick={() => { setError(""); load(); }}>반품 정보 다시 불러오기</button> : null}
        {loading ? <BusyText>반품 정보 확인 중...</BusyText> : null}
        {!loading && !error && !active && order.status === "refunded" ? <p>이미 환불 완료된 주문입니다.</p> : null}
        {!loading && !active && order.status !== "refunded" ? (
          <fieldset disabled={busy || loadFailed} className="space-y-4">
            {order.refund_request_reason ? <p className="text-sm text-slate-600">기존 신청 사유: {order.refund_request_reason}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-sm">① 어떤 교재를 환불하나요?</h4>
              <button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => changeSelection(ids.length === unrefundedItems.length ? [] : unrefundedItems.map(item => item.id))}>
                {ids.length === unrefundedItems.length ? "선택 해제" : "미환불 교재 전체 선택"}
              </button>
            </div>
            <p className="text-xs text-slate-500">같은 교재라도 월·회차가 다를 수 있습니다. 옵션과 No.를 확인해 필요한 교재만 선택해주세요.</p>
            <div className="space-y-2">
              {unrefundedItems.map(item => (
                <label key={item.id} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${ids.includes(item.id) ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}>
                  <input className="mt-1 shrink-0" type="checkbox" checked={ids.includes(item.id)} onChange={() => changeSelection(toggle(ids, item.id))} />
                  <ReturnItemDetails item={item} />
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCurrency(item.total_price)}</span>
                </label>
              ))}
            </div>
            <p className="rounded-lg bg-slate-100 p-3 text-sm" aria-live="polite">
              선택 {selectedItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0)}권 · 선택 상품값 {formatCurrency(selectedTotal)}
              <span className="block mt-1 text-xs text-slate-500">상품값은 할인·배송비가 반영되기 전 금액입니다.</span>
            </p>
            {ids.length > 0 ? <>
              <fieldset className="space-y-2">
                <legend className="font-bold text-sm mb-2">② 선택한 교재를 고객에게 보냈나요?</legend>
                {[
                  ["not_sent", "보내지 않았어요", "출고 전 검수 탈락·재고 없음·포장 누락·발송 전 취소 → 회수 없이 환불"],
                  ["sent", "고객에게 보냈어요", "고객이 받은 교재의 하자·오배송·단순변심 → 반품 도착 후 검수·환불"],
                  ...(requiresPhysicalReturn(order) ? [["sent_no_return", "보냈지만 반품 없이 환불해요", "이미 풀린 모의고사 등 하자 확인 → 회수·반품 배송비 없이 환불, 재판매 제외"]] : []),
                ].map(([value, title, description]) => <label key={value} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${deliveryRoute === value ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}>
                  <input className="mt-1" type="radio" name="return-delivery" checked={deliveryRoute === value} onChange={() => changeDeliveryRoute(value)} />
                  <span><strong className="block">{title}</strong><span className="block mt-1 text-slate-600">{description}</span></span>
                </label>)}
                <p className="text-xs text-slate-500">주문 전체가 ‘배송완료’여도 선택한 교재가 누락됐다면 ‘보내지 않았어요’를 선택합니다. 발송한 교재와 미발송 교재는 나누어 접수해주세요.</p>
              </fieldset>
              {deliveryRoute ? <>
                <h4 className="font-bold text-sm pt-2">③ 사유와 처리 내용 확인</h4>
                {waivedSelected ? <p className="text-sm text-slate-600">상품 하자 확인 · 회수 면제. 필기·풀이 등 하자 내용과 반품을 받지 않는 사유를 기록해주세요.</p> : noReturnSelected ? <label className="block text-sm font-semibold">미발송 사유
                  <select className="input-base mt-1" value={notSentReason} onChange={event => {
                    const value = event.target.value;
                    setNotSentReason(value); setInventoryChoice(""); setDirectConfirmed(false);
                    setReason(value === "inspection_failed" ? "출고 전 재검수 탈락으로 미발송. 재판매 불가하여 환불 후 폐기 처리."
                      : value === "missing" ? "재고 없음 또는 포장 누락으로 미발송. 실물 회수 없이 환불."
                        : value === "cancel" ? "고객 요청으로 발송 전 취소. 실물 회수 없이 환불." : "");
                  }}>
                    <option value="">사유를 선택해주세요</option>
                    <option value="inspection_failed">출고 전 검수 탈락 · 폐기 대상</option>
                    <option value="missing">재고 없음 · 포장/배송 누락</option>
                    <option value="cancel">고객 요청 · 발송 전 취소</option>
                  </select>
                </label> : <label className="block text-sm font-semibold">반품 사유
                  <select className="input-base mt-1" value={reasonCode} onChange={event => {
                    const value = event.target.value; setReasonCode(value);
                    setReason(value === "buyer_remorse" ? "고객 단순변심으로 반품 요청"
                      : value === "seller_fault" ? "고객에게 전달된 상품의 하자·오배송으로 반품 요청" : "");
                  }}>
                    <option value="">사유를 선택해주세요</option>
                    {RETURN_REASONS.filter(r => r.value !== "not_delivered").map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>}
                <label className="block text-sm font-semibold">상세 사유
                  <textarea className="input-base mt-1" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} />
                </label>
              </> : null}
            </> : <p className="text-sm text-slate-600">환불할 교재를 선택하면 다음 항목이 나타납니다.</p>}
            {ids.length > 0 && noReturnSelected && (waivedSelected || notSentReason) ? (
              <div className="space-y-4">
                {waivedSelected ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
                  <strong>회수 없음 · 환불 후 재판매 제외</strong>
                  <p>반품 수거·도착 확인 없이 환불합니다. 해당 교재는 환불 완료 시 폐기 상태로 기록되며 판매 재고로 돌아가지 않습니다.</p>
                </div> : <InventoryChoice value={inventoryChoice} onChange={setInventoryChoice} discardOnly={discardOnly} />}
                <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                  <p>현재 결제잔액 <strong>{formatCurrency(preview.remaining)}</strong></p>
                  <p>할인 {formatCurrency(currentOrder.coupon_discount_amount ?? currentOrder.discount_amount ?? 0)} · 사용 포인트 {Number(currentOrder.points_used || 0).toLocaleString()}P</p>
                  <p>{waivedSelected ? "회수 면제" : "미발송"} 배송비 차감 <strong>0원</strong></p>
                </div>
                {!preview.automatic ? <>
                  <p className="text-sm text-slate-700">일부 환불은 할인·포인트·이전 환불을 확인해 실제 환불액을 입력해주세요. 사용 포인트를 현금 환불액에 더하지 않습니다.</p>
                  {suggestedAmount != null ? <button className="btn-secondary" type="button" onClick={() => {
                    setAmount(String(suggestedAmount));
                    setAmountNote(`선택 교재 상품값 ${formatCurrency(suggestedAmount)}. 할인·사용 포인트·이전 환불 없음. ${waivedSelected ? "하자 확인·회수 면제로" : "미발송으로"} 배송비 차감 0원.`);
                  }}>선택 상품값 {formatCurrency(suggestedAmount)} 입력</button> : null}
                  <label className="block text-sm">최종 환불액 (원)<input className="input-base mt-1" type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
                  <label className="block text-sm">계산·조정 근거<textarea className="input-base mt-1" value={amountNote} onChange={e => setAmountNote(e.target.value)} maxLength={1000} /></label>
                </> : <p className="text-lg font-bold">예상 환불액 {formatCurrency(preview.amount)}</p>}
                <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={directConfirmed} onChange={event => setDirectConfirmed(event.target.checked)} />{waivedSelected ? "배송된 교재의 하자를 확인했고, 반품을 받지 않고 환불하며 재판매에서 제외하겠습니다." : "선택 상품이 구매자에게 전달되지 않아 회수가 불필요함을 확인했습니다."}</label>
                <p className="text-sm text-slate-500">다음 화면에서 대상·금액을 다시 확인한 뒤 {isBank ? "실제 송금 완료를 기록" : "카드 환불을 실행"}합니다.</p>
                <button type="button" className="btn-primary" disabled={reason.trim().length < 5 || !directConfirmed || !inventoryChosen || !noReturnManualValid || noReturnRefundAmount <= 0}
                  onClick={submitNoReturn}>
                  환불 내용 확인하기 · 아직 환불되지 않아요
                </button>
              </div>
            ) : ids.length > 0 && deliveryRoute === "sent" ? <>
              {!requiresPhysicalReturn(order) ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">아직 발송 기록이 없는 주문입니다. 실제 발송 여부와 송장을 먼저 확인해주세요. 미발송이면 위에서 ‘보내지 않았어요’를 선택합니다.</p> : null}
              {hasPreDispatchReason(reason) ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">미발송·출고 전 탈락으로 보이는 사유입니다. 고객에게 보내지 않은 교재는 위에서 ‘보내지 않았어요’를 선택해주세요.</p> : null}
              <p className="text-sm text-slate-600">접수 후 고객이 반송한 교재의 도착·검수를 진행합니다. 아직 돈이 환불되거나 CJ 수거가 접수되지는 않습니다.</p>
              <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={sentConfirmed} onChange={event => setSentConfirmed(event.target.checked)} />선택 교재는 고객에게 발송했던 교재이며, 실제 반품이 필요한 건입니다.</label>
              <button type="button" className="btn-primary" disabled={!reasonCode || reason.trim().length < 5 || !requiresPhysicalReturn(order) || !sentConfirmed}
                onClick={() => run(() => mutate("admin_start_order_return", { p_order_id: order.id, p_item_ids: ids, p_reason_code: reasonCode, p_reason: reason }))}>
                고객 반품 접수하기 · 아직 환불되지 않아요
              </button>
            </> : null}
          </fieldset>
        ) : null}
        {!loading && active ? (
          <>
            <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
              <strong>{active.status === "requested" && !active.requires_return ? "취소 확인 대기" : RETURN_STATUS_LABELS[active.status]}</strong>
              <p>{active.reason}</p>
              <p className="text-slate-500">{active.requires_return
                ? "접수 → 도착 확인 → 검수 승인 → 환불 실행"
                : active.return_waived ? "배송된 하자 교재 · 반품 없이 환불" : requiresPhysicalReturn(order) ? "미발송·배송 누락 확인 · 실물 회수 불필요" : "발송 전 취소 · 실물 회수 불필요"}</p>
              {active.requires_return && active.received_at ? <p>첫 반품 도착 {formatDate(active.received_at)} · 반환받은 날부터 3영업일 이내 환급 처리</p> : null}
            </div>
            {active.requires_return && hasPreDispatchReason(active.reason) && draft ? <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
              <strong>미발송 교재를 반품으로 접수하지 않았는지 확인해주세요.</strong>
              <p>출고 전 탈락·포장 누락은 고객 반품이 아닙니다. 잘못 접수했다면 아래 ‘접수 정정·환불 없이 종결’에서 정정 사유를 남긴 뒤 ‘보내지 않았어요’로 다시 접수해주세요.</p>
            </div> : null}
            <fieldset disabled={busy || loadFailed} className="space-y-2">
              {active.items.map(item => (
                <label key={item.id} className="flex items-start gap-2 text-sm rounded-lg border border-slate-200 p-3">
                  {draft && active.requires_return && !item.received_at ? <input className="mt-1 shrink-0" type="checkbox" checked={receivedIds.includes(item.id)}
                    onChange={() => { setReceivedIds(toggle(receivedIds, item.id)); setReceiptConfirmed(false); }} /> : null}
                  <ReturnItemDetails item={item} orderItem={orderItemsById.get(String(item.id))} />
                  <span className="shrink-0 text-slate-500">{item.received_at ? "도착 확인됨" : active.requires_return ? "도착 대기" : "회수 없음"}</span>
                </label>
              ))}
              {draft && active.requires_return && !allReceived ? (
                <div className="space-y-3 rounded-lg bg-amber-50 p-3">
                  <p className="text-sm font-semibold">고객에게 발송했던 교재가 반송되어 창고에 도착했을 때만 확인합니다.</p>
                  <label className="flex gap-2 text-sm"><input type="checkbox" checked={receiptConfirmed} onChange={event => setReceiptConfirmed(event.target.checked)} disabled={!receivedIds.length} />선택한 {receivedIds.length}개 품목의 실제 반품 도착과 옵션·일련번호를 확인했습니다.</label>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" type="button" disabled={!receivedIds.length || !receiptConfirmed} onClick={() => run(() => mutate("admin_receive_order_return", { p_return_id: active.id, p_item_ids: receivedIds }))}>선택 교재 실제 도착 확인</button>
                    <button className="btn-ghost" type="button" onClick={() => run(async () => { await onRegisterPickup(order.id); await load(); })}>고객 주소로 CJ 수거 요청</button>
                  </div>
                </div>
              ) : null}
            </fieldset>
            {draft && allReceived ? (
              <fieldset disabled={busy || loadFailed} className="space-y-4">
                <label className="block text-sm font-semibold">{active.requires_return ? "검수 기록" : "취소 확인 기록"}
                  <textarea className="input-base mt-1" value={note} onChange={event => setNote(event.target.value)} maxLength={2000}
                    placeholder={active.requires_return ? "고객이 반송한 교재의 수량·구성품·필기·훼손 상태를 기록해주세요." : "미발송 사유와 교재 상태를 기록해주세요. 회수·도착 확인은 필요 없습니다."} />
                </label>
                {active.inspection_note ? <p className="text-sm text-amber-700">이전 확인 기록: {active.inspection_note}</p> : null}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={inspected} onChange={event => setInspected(event.target.checked)} />{active.requires_return ? "고객에게 발송했던 교재가 실제 반송되었고, 구성품·필기·훼손 상태를 확인했습니다." : "선택 교재가 고객에게 전달되지 않아 회수가 불필요함을 확인했습니다."}</label>
                <InventoryChoice value={inventoryChoice} onChange={setInventoryChoice} />
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
                  <button className="btn-primary" type="button" disabled={!allReceived || !inspected || !inventoryChosen || note.trim().length < 5 || !manualValid || (!manualRequired && preview.amount <= 0)}
                    onClick={() => run(() => mutate("admin_review_order_return", { p_return_id: active.id, p_approve: true, p_note: note, p_restock: restock,
                      p_manual_amount: manualRequired ? amountNum : null, p_shipping_deduction: manualRequired ? deductionNum : null, p_amount_note: manualRequired ? amountNote : null }))}>환불 내용 확인하기 · 아직 환불되지 않아요</button>
                  <button className="btn-ghost" type="button" disabled={note.trim().length < 5} onClick={() => run(() => mutate("admin_review_order_return", { p_return_id: active.id, p_approve: false, p_note: note }))}>검수 보류</button>
                </div>
              </fieldset>
            ) : null}
            {active.status === "approved" ? (
              <fieldset disabled={busy || loadFailed} className="space-y-4">
                <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-2">
                  <p className="font-semibold">환불 대상 {active.items.length}개 품목 · 위 옵션·No.를 다시 확인해주세요.</p>
                  <p>실물 회수: {active.requires_return ? "고객 반품 도착·검수 완료" : active.return_waived ? "면제 · 배송된 하자 교재" : "필요 없음 · 미발송 교재"}</p>
                  <p>환불 기준액 {formatCurrency(active.refund_base)}</p><p>배송비 차감 −{formatCurrency(active.shipping_deduction)}</p>
                  <p className="text-lg font-bold">최종 환불액 {formatCurrency(active.refund_amount)}</p>
                  <p>환불 후 결제 유지액 {formatCurrency(active.remaining_before - active.refund_amount)}</p>
                  <p>{active.return_waived ? "재고 처리: 환불 후 폐기 상태로 기록 · 재판매 제외" : active.restock ? "재고 처리: 환불 후 즉시 재판매" : "재고 처리: 판매 차단 유지 · 환불 후 주문 상세에서 폐기 또는 상태 확인"}</p>
                  {active.return_waived ? <p>정산 처리: 환불 품목은 정산 생성 제외 · 미지급 정산 취소 · 이미 지급한 정산은 손실 확인 후 회수 필요로 기록</p> : null}
                  <p>확인 기록: {active.inspection_note}</p>
                  {active.amount_note ? <p>금액 근거: {active.amount_note}</p> : null}
                </div>
                {isBank ? <>
                  {refundAccount}
                  <p className="text-sm font-semibold text-amber-700">자동 송금되지 않습니다. 위 환불액을 직접 송금한 뒤 완료를 기록해주세요.</p>
                  <label className="block text-sm">송금일시·확인번호<input className="input-base mt-1" value={transfer} onChange={e => setTransfer(e.target.value)} maxLength={150} /></label>
                </> : <p className="text-sm text-slate-600">아래 버튼을 누르면 카드 결제 취소가 실제로 요청됩니다. 카드사 반영까지 시간이 걸릴 수 있습니다.</p>}
                <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{isBank ? "환불계좌와 금액을 확인하고 실제 송금을 완료했습니다." : `선택한 ${active.items.length}개 품목·${formatCurrency(active.refund_amount)}·재고 처리 내용을 확인했습니다.`}</label>
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
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => setClosing(!closing)}>접수 정정·환불 없이 종결</button>
              {closing ? <>
                <p className="text-sm">잘못 접수한 건은 정정 사유를 남기고 종결한 뒤 다시 접수할 수 있습니다. 미발송 교재는 ‘보내지 않았어요’를 선택해주세요.</p>
                <p className="text-sm text-amber-700">환불 없이 종결하며 자동 구매확정·정산 보류가 해제됩니다. 구매자 안내와 CJ 수거 취소 여부를 확인해주세요.</p>
                <label className="block text-sm">종결 사유<textarea className="input-base mt-1" value={closeNote} onChange={e => setCloseNote(e.target.value)} /></label>
                <button className="btn-danger" type="button" disabled={busy || closeNote.trim().length < 5} onClick={() => run(() => mutate("admin_cancel_order_return", { p_return_id: active.id, p_note: closeNote }))}>환불 없이 종결</button>
              </> : null}
            </div> : null}
          </>
        ) : null}
        {cases.filter(row => ["refunded", "cancelled"].includes(row.status)).map(row => (
          <div key={row.id} className="space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <p>{formatDate(row.completed_at)} · {RETURN_STATUS_LABELS[row.status]}{row.status === "refunded" ? ` · ${formatCurrency(row.refund_amount)}` : ""}</p>
            <p>{row.requires_return ? "고객 반품" : row.return_waived ? "배송 후 회수 면제 환불" : "회수 없는 환불"} · {row.reason}</p>
            <ul className="space-y-2">
              {row.items.map(item => <li key={item.id} className="flex">
                <ReturnItemDetails item={item} orderItem={orderItemsById.get(String(item.id))} />
              </li>)}
            </ul>
          </div>
        ))}
        <button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>닫기</button>
      </div>
    </AdminDialog>
  );
}
