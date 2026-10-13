import { useCallback, useEffect, useRef, useState } from 'react';
import { canReshipOrder, RESHIPMENT_STATE_LABELS, toReshipmentItem } from '@shared-domain/orderReshipments';
import { formatDate } from '@shared-domain/format';
import { requestOrderReshipment } from '@shared-supabase/adminOrderReshipments';
import AdminDialog from './AdminDialog';
import { BusyText } from './Loading';
import ReshipmentBookPicker from './ReshipmentBookPicker';

export default function AdminOrderReshipments({ order, onLabel, onTrace, request = requestOrderReshipment, searchProducts }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setHistoryError('');
    try { setHistory(await request(order.id, 'list')); }
    catch (err) { setHistoryError(err.message); }
    finally { setLoading(false); }
  }, [order.id, request]);
  useEffect(() => { load(); }, [load]);

  const eligible = canReshipOrder(order);
  const active = history.some((row) => ['claimed', 'booking'].includes(row.state));
  const latestId = history[0]?.id ?? null;
  const selected = form?.items.filter((item) => item.selected) ?? [];
  const valid = selected.length > 0 && selected.every((item) => item.title.trim() && item.title.trim().length <= 200
    && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 && Number(item.quantity) <= item.max)
    && form.reason.trim().length >= 5;

  function openForm(existing) {
    setError('');
    const sourceItems = (order.items ?? []).filter((item) => !item.refunded_at);
    setForm({
      requestKey: existing?.request_key ?? crypto.randomUUID(), expectedLatestId: latestId,
      reason: existing?.reason ?? '', locked: Boolean(existing), confirmed: false,
      items: existing
        ? existing.items.map((item) => ({ ...item, selected: true, max: item.quantity }))
        : sourceItems.map((item) => ({
          orderItemId: item.id, title: '', replacementProductId: null, replacementOption: null,
          quantity: Number(item.quantity) || 1, max: Number(item.quantity) || 1, selected: sourceItems.length === 1,
        })),
    });
  }
  function updateItem(id, patch) {
    setForm((current) => ({ ...current, confirmed: false,
      items: current.items.map((item) => item.orderItemId === id ? { ...item, ...patch } : item),
    }));
  }
  function sourceLabel(item) {
    const source = (order.items ?? []).find((row) => row.id === item.orderItemId);
    return source ? [source.title, source.option_label].filter(Boolean).join(' · ') : item.title;
  }
  async function issue() {
    if (!valid || !form.confirmed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    setForm((current) => ({ ...current, locked: true }));
    try {
      const result = await request(order.id, 'register', {
        requestKey: form.requestKey, expectedLatestId: form.expectedLatestId, reason: form.reason.trim(),
        items: selected.map(toReshipmentItem),
      });
      setForm(null);
      await load();
      onLabel(result);
    } catch (err) { setError(err.message); await load(); }
    finally { setBusy(false); inFlight.current = false; }
  }
  async function reprint(row) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { onLabel(await request(order.id, 'reprint', { reshipmentId: row.id })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); inFlight.current = false; }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">무상 재발송</h4>
          <p className="mt-1 text-xs text-slate-500">오배송·누락 교재를 환불 없이 다시 보내고 새 송장을 발급합니다.</p>
        </div>
        {eligible && <button type="button" className="btn-secondary text-xs" disabled={busy || loading || Boolean(historyError) || active}
          onClick={() => openForm()}>재발송 송장 발급</button>}
      </div>
      {loading && <p className="text-xs text-slate-500">재발송 이력 확인 중...</p>}
      {historyError && <p role="alert" className="text-xs text-red-600">{historyError}</p>}
      {!form && error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {!loading && !historyError && !history.length && <p className="text-xs text-slate-400">재발송 이력이 없습니다.</p>}
      {history.map((row) => (
        <div key={row.id} className="border-t border-slate-100 pt-3 space-y-2 text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold text-slate-800">재발송 #{row.id} · {formatDate(row.created_at)}</span>
            <span className={row.state === 'registered' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
              {RESHIPMENT_STATE_LABELS[row.state]}
            </span>
          </div>
          <ul className="space-y-1 text-slate-700">{row.items.map((item) => <li key={item.orderItemId}>{item.title} · {item.quantity}권</li>)}</ul>
          <p className="text-slate-500 whitespace-pre-wrap break-words">{row.reason}</p>
          {row.tracking_number && <p className="font-mono text-slate-700">CJ대한통운 · {row.tracking_number}</p>}
          {row.state === 'booking' && <p className="text-amber-700">접수 결과 확인이 필요합니다. 중복 발송을 막기 위해 새 발급을 중단했습니다.</p>}
          <div className="flex flex-wrap gap-2">
            {row.state === 'registered' && <>
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => reprint(row)}>재발송 송장 재출력</button>
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => onTrace({
                ...order, tracking_number: row.tracking_number, tracking_carrier: 'CJ대한통운',
              })}>재발송 배송조회</button>
            </>}
            {eligible && row.id === latestId && (row.state === 'failed' ||
              (row.state === 'claimed' && Date.now() - new Date(row.updated_at).getTime() >= 600_000)) &&
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => openForm(row)}>같은 재발송 다시 시도</button>}
          </div>
        </div>
      ))}
      <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" disabled={busy || loading} onClick={load}>이력 새로고침</button>

      <AdminDialog open={Boolean(form)} onClose={() => setForm(null)} busy={busy} title={`무상 재발송 · ${order.order_number}`} size="xl"
        footer={<div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setForm(null)}>닫기</button>
          <button type="button" className="btn-primary sm:!w-auto" disabled={busy || !valid || !form?.confirmed} onClick={issue}>
            {busy ? <BusyText>송장 발급 중...</BusyText> : '재발송 송장 발급하고 인쇄'}
          </button>
        </div>}>
        {form && <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">다시 보낼 교재</h3>
              <p className="mt-1 mb-3 text-xs text-slate-500">등록된 교재를 검색하고 실제로 보낼 옵션을 선택해 주세요. 원 주문과 다른 교재도 선택할 수 있습니다.</p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {form.items.map((item) => <div key={item.orderItemId} className="p-3 space-y-2">
                  <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                    {form.items.length > 1 && <input type="checkbox" className="mt-0.5" checked={item.selected} disabled={busy || form.locked}
                      onChange={(event) => updateItem(item.orderItemId, { selected: event.target.checked })} />
                    }
                    <span><span className="mb-1 block font-normal text-slate-400">원 주문 교재</span>{sourceLabel(item)}</span>
                  </label>
                  {item.selected && <div className="space-y-3 border-t border-slate-100 pt-3">
                    <ReshipmentBookPicker source={(order.items ?? []).find((row) => row.id === item.orderItemId)}
                      value={item} onChange={(patch) => updateItem(item.orderItemId, patch)} disabled={busy || form.locked} search={searchProducts} />
                    <label className="block w-24 text-xs text-slate-500">재발송 수량
                      <input type="number" className="input-base mt-1 w-full" min={1} max={item.max} step={1} value={item.quantity} disabled={busy || form.locked}
                        onChange={(event) => updateItem(item.orderItemId, { quantity: event.target.value })} />
                    </label>
                  </div>}
                </div>)}
              </div>
            </div>
            <label className="block text-sm font-bold text-slate-900">재발송 사유
              <textarea className="input-base mt-2 w-full font-normal text-sm" rows={3} maxLength={1000} value={form.reason}
                placeholder="예: 오배송으로 고객과 협의하여 고체편 1권 무상 재발송" disabled={busy || form.locked}
                onChange={(event) => setForm({ ...form, reason: event.target.value, confirmed: false })} />
              <span className="text-xs font-normal text-slate-400">고객과 합의한 내용을 5자 이상 남겨 주세요.</span>
            </label>
          </div>
          <aside className="min-w-0 space-y-4 rounded-lg bg-slate-50 p-4 text-xs self-start">
            <h3 className="text-sm font-bold text-slate-900">재발송 확인</h3>
            {selected.some((item) => item.title) && <ul className="space-y-2 border-b border-slate-200 pb-3 text-slate-700">
              {selected.filter((item) => item.title).map((item) => <li key={item.orderItemId} className="break-words">{item.title} · {item.quantity}권</li>)}
            </ul>}
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-slate-500">발송 수량</dt><dd className="font-bold">{selected.filter((item) => item.title).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}권 · 1박스</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">고객 추가 결제</dt><dd className="font-bold">없음</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">환불</dt><dd className="font-bold">없음</dd></div>
            </dl>
            <div className="border-t border-slate-200 pt-3 space-y-1 text-slate-600">
              <p className="font-semibold text-slate-900">{order.shipping_recipient_name}</p>
              <p>{order.shipping_recipient_phone}</p>
              <p className="break-words">[{order.shipping_postal_code}] {order.shipping_address_line1} {order.shipping_address_line2}</p>
            </div>
            <p className="text-slate-500 leading-relaxed">기존 송장·결제·정산은 유지됩니다. 재고 차감과 반품 수거는 별도 처리해 주세요. 고객 알림은 자동 발송되지 않습니다.</p>
            {order.refund_requested_at && !order.refund_request_resolved_at &&
              <p className="rounded-md bg-amber-50 p-2 text-amber-800 leading-relaxed">접수된 환불 신청은 유지됩니다. 재발송 후 고객 확인을 마치면 주문 상세의 환불 신청에서 별도로 종결해 주세요.</p>}
            <label className="flex items-start gap-2 font-semibold text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={form.confirmed} disabled={busy}
                onChange={(event) => setForm({ ...form, confirmed: event.target.checked })} />
              교재명·수량·배송지를 확인했습니다.
            </label>
          </aside>
          {error && <p role="alert" className="md:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>}
      </AdminDialog>
    </section>
  );
}
