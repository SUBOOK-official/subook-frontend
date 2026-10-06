import { useEffect, useMemo, useState } from "react";
import { loadFulfillmentChecks, saveFulfillmentCheck } from "@shared-supabase/adminOperationsClient";

export default function AdminFulfillmentWorkbench({ orders, selectedIds }) {
  const targets = useMemo(() => orders.filter((o) => selectedIds.size ? selectedIds.has(o.id) : true), [orders, selectedIds]);
  const ids = targets.map((o) => o.id).join(",");
  const [checks, setChecks] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    loadFulfillmentChecks(ids ? ids.split(",").map(Number) : []).then((rows) => { if (active) setChecks(Object.fromEntries(rows.map((r) => [r.order_id,r]))); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ids, retry]);
  const items = useMemo(() => targets.flatMap((order) => (order.items || []).filter((item) => !item.refunded_at).map((item) => ({ ...item, order }))).sort((a,b) => String(a.book_location || "~").localeCompare(String(b.book_location || "~"), "ko", { numeric: true }) || Number(a.book_serial_number || 0) - Number(b.book_serial_number || 0)), [targets]);
  const update = async (orderId, values) => {
    setBusy(orderId); setError("");
    try { const row = await saveFulfillmentCheck(orderId, values); setChecks((old) => ({ ...old, [orderId]: row })); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };
  return <section className="rounded-xl border border-indigo-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">위치순 피킹 · 포장 확인</h2><span className="text-xs text-slate-500">{selectedIds.size ? "선택한" : "현재 페이지"} {targets.length}주문 · {items.length}개 품목</span></div>
    {error ? <div role="alert" className="notice-error mt-3">{error} <button className="underline" onClick={() => setRetry((v) => v+1)}>다시 조회</button></div> : null}
    {loading ? <p className="py-5 text-sm text-slate-400">작업 확인 상태를 불러오는 중…</p> : <>
      <div className="mt-4 max-h-96 space-y-1 overflow-y-auto">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 px-3 py-3 hover:bg-slate-50"><input type="checkbox" className="mt-1 h-4 w-4" disabled={busy != null || Boolean(error)} checked={(checks[item.order.id]?.picked_item_ids || []).includes(item.id)} onChange={(e) => update(item.order.id,{ itemId: item.id, picked: e.target.checked })} /><span className="min-w-14 text-xs font-bold text-indigo-700">{item.is_direct_sale ? "자체 판매" : item.book_location || "위치 없음"}<small className="mt-1 block text-slate-400">{item.is_direct_sale ? "옵션 확인" : `No.${item.book_serial_number ?? "—"}`}</small></span><span className="min-w-0 flex-1 text-sm"><strong className="line-clamp-2">{item.title}</strong><span className="mt-1 block text-xs text-slate-500">{item.option_label || item.condition_grade} · {item.quantity}권 · {item.order.order_number}</span></span></label>)}</div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{targets.map((order) => { const checked=checks[order.id]; const allPicked=(order.items || []).filter((i) => !i.refunded_at).every((i) => checked?.picked_item_ids?.includes(i.id)); return <label className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-xs" key={order.id}><input type="checkbox" checked={Boolean(checked?.packed_at)} disabled={busy != null || Boolean(error) || (!allPicked && !checked?.packed_at)} onChange={(e) => update(order.id,{ packed: e.target.checked })} /><span><strong>{order.order_number} 포장 확인</strong><span className="mt-1 block text-slate-500">{order.shipping_recipient_name} · {order.tracking_number || "송장 미발급"}{!allPicked ? " · 피킹 확인 후 포장 가능" : ""}</span></span></label>; })}</div>
      <p className="mt-3 text-xs text-slate-400">체크 상태는 운영팀과 공유됩니다. 아래 주문 선택 후 기존 송장 출력에서 합배송 묶음을 확인하고 발급·재출력하세요.</p>
    </>}
  </section>;
}
