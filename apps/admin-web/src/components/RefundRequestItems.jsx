export default function RefundRequestItems({ order }) {
  if (!order.refund_requested_at) return null;
  if (order.refund_request_items_error) return <p role="alert" className="mt-2 text-sm text-rose-700">신청 교재를 불러오지 못했습니다. 새로고침 후 확인해주세요.</p>;
  const ids = new Set((order.refund_requested_item_ids ?? []).map(String));
  const items = (order.items ?? []).filter(item => ids.has(String(item.id)));
  if (!ids.size) return <p className="mt-2 text-xs text-amber-800">대상 교재 미기록 · 교재 선택 기능 도입 전 신청입니다. 구매자에게 교재명·옵션을 확인해주세요.</p>;
  return <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
    <p className="font-bold text-slate-800">구매자 신청 교재 · {ids.size}개 품목</p>
    <ul className="mt-2 space-y-2">
      {items.map(item => <li key={item.id} className="break-words text-slate-700">
        <span className="block">{item.title}</span>
        <span className="text-xs font-semibold text-indigo-700">옵션: {item.option_label || "옵션 없음"} · {item.quantity ?? 1}권</span>
      </li>)}
    </ul>
    {items.length !== ids.size ? <p className="mt-2 text-xs text-rose-700">일부 신청 교재 정보가 없습니다. 주문 품목을 다시 확인해주세요.</p> : null}
  </div>;
}
