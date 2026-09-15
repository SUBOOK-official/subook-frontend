import { formatCurrency } from "@shared-domain/format";
import { summarizeOrderItems } from "../lib/orderItemGroups";

// 주문 상세의 '주문 상품' — 같은 교재를 한 묶음으로 보여준다 (2026-09-15).
// 묶음 머리: 교재명 · N권 · 공통 등급/단가 · 합계
// 묶음 안: 회차(옵션)마다 칩 한 개 — 피킹에 필요한 위치·일련번호를 칩에 같이 둔다.
// 환불 품목은 취소선으로 남기고 권수·합계에서는 뺀다.
function PickingLabel({ item }) {
  if (!item.book_location) {
    return (
      <span className="rounded bg-amber-100 px-1 font-bold text-amber-800">
        위치 미지정{item.book_serial_number != null ? ` · No.${item.book_serial_number}` : ""}
      </span>
    );
  }
  return (
    <span className="font-mono font-bold text-indigo-700">
      {item.book_location}
      {item.book_serial_number != null ? ` · No.${item.book_serial_number}` : ""}
    </span>
  );
}

export default function OrderItemGroupList({ items }) {
  const summary = summarizeOrderItems(items);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">주문 상품</h4>
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          총 {summary.bookCount}권 · {summary.titleCount}종
        </span>
        {summary.missingLocationCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 tabular-nums">
            위치 미지정 {summary.missingLocationCount}권
          </span>
        ) : null}
        {summary.refundedCount > 0 ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 tabular-nums">
            환불 {summary.refundedCount}건 제외
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        {summary.groups.map((group) => {
          const fullyRefunded = group.bookCount === 0;
          return (
            <div className={`rounded-lg bg-slate-50 px-3 py-2.5${fullyRefunded ? " opacity-70" : ""}`} key={group.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <span className="font-semibold text-slate-900">{group.title}</span>
                  <span className="ml-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-800 ring-1 ring-slate-200 tabular-nums">
                    {group.bookCount}권
                  </span>
                  {group.sharedGrade ? (
                    <span className="ml-2 text-xs text-slate-400">{group.sharedGrade}</span>
                  ) : null}
                  {group.sharedUnitPrice != null && group.bookCount > 1 ? (
                    <span className="ml-2 text-xs text-slate-400">권당 {formatCurrency(group.sharedUnitPrice)}</span>
                  ) : null}
                </div>
                <span className={`shrink-0 text-sm font-bold tabular-nums${fullyRefunded ? " text-slate-400 line-through" : ""}`}>
                  {formatCurrency(fullyRefunded ? group.items.reduce((sum, item) => sum + Number(item.total_price ?? 0), 0) : group.amount)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.items.map((item) => {
                  const refunded = Boolean(item.refunded_at);
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                        refunded
                          ? "border-rose-200 bg-white text-slate-400"
                          : item.book_location
                            ? "border-slate-200 bg-white text-slate-700"
                            : "border-amber-300 bg-amber-50 text-slate-700"
                      }`}
                      key={item.id}
                      title={refunded && item.refund_reason ? `환불 사유: ${item.refund_reason}` : undefined}
                    >
                      <span className={`font-bold text-slate-900${refunded ? " line-through" : ""}`}>
                        {item.option_label || "옵션 없음"}
                      </span>
                      {Number(item.quantity) > 1 ? <span className="text-slate-500">×{item.quantity}</span> : null}
                      {!group.sharedGrade && item.condition_grade ? (
                        <span className="text-slate-400">{item.condition_grade}</span>
                      ) : null}
                      {group.sharedUnitPrice == null && !refunded ? (
                        <span className="text-slate-500 tabular-nums">{formatCurrency(item.total_price)}</span>
                      ) : null}
                      <PickingLabel item={item} />
                      {refunded ? (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          환불됨{item.refund_amount != null ? ` ${formatCurrency(item.refund_amount)}` : ""}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
