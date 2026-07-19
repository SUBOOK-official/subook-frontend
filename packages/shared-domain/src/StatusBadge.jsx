import {
  bookStatusLabel,
  couponStatusLabel,
  memberStatusLabel,
  orderStatusLabel,
  pickupRequestStatusLabel,
  productStatusLabel,
  settlementStatusLabel,
  shipmentStatusLabel,
} from "./status";

const COLOR_MAP_BY_TYPE = {
  shipment: {
    scheduled: "bg-amber-100 text-amber-800",
    inspecting: "bg-orange-100 text-orange-800",
    inspected: "bg-sky-100 text-sky-800",
  },
  pickupRequest: {
    pending: "bg-slate-100 text-slate-700",
    pickup_scheduled: "bg-sky-100 text-sky-800",
    picking_up: "bg-indigo-100 text-indigo-800",
    arrived: "bg-emerald-100 text-emerald-800",
    inspecting: "bg-orange-100 text-orange-800",
    inspected: "bg-cyan-100 text-cyan-800",
    completed: "bg-slate-200 text-slate-700",
    cancelled: "bg-rose-100 text-rose-700",
  },
  book: {
    on_sale: "bg-emerald-100 text-emerald-800",
    reserved: "bg-amber-100 text-amber-800",
    settled: "bg-indigo-100 text-indigo-800",
    discarded: "bg-rose-100 text-rose-700",
  },
  product: {
    selling: "bg-emerald-100 text-emerald-800",
    sold_out: "bg-amber-100 text-amber-800",
    hidden: "bg-slate-100 text-slate-700",
    on_sale: "bg-emerald-100 text-emerald-800",
    settled: "bg-indigo-100 text-indigo-800",
  },
  order: {
    pending: "bg-amber-100 text-amber-800",
    paid: "bg-sky-100 text-sky-800",
    preparing: "bg-indigo-100 text-indigo-800",
    shipping: "bg-blue-100 text-blue-800",
    delivered: "bg-emerald-100 text-emerald-800",
    confirmed: "bg-emerald-200 text-emerald-900",
    cancelled: "bg-rose-100 text-rose-700",
    refunded: "bg-slate-200 text-slate-700",
  },
  settlement: {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-sky-100 text-sky-800",
    completed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-100 text-rose-700",
    recovery_required: "bg-rose-200 text-rose-900",
  },
  member: {
    active: "bg-emerald-100 text-emerald-800",
    blocked: "bg-rose-100 text-rose-700",
    dormant: "bg-slate-100 text-slate-700",
    withdrawn: "bg-slate-200 text-slate-500",
  },
  coupon: {
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-slate-100 text-slate-700",
  },
};

const LABEL_MAP_BY_TYPE = {
  shipment: shipmentStatusLabel,
  pickupRequest: pickupRequestStatusLabel,
  book: bookStatusLabel,
  product: productStatusLabel,
  order: orderStatusLabel,
  settlement: settlementStatusLabel,
  member: memberStatusLabel,
  coupon: couponStatusLabel,
};

// 위험·주의 상태에 색상 외 redundant signal (icon) 추가 — 색약 8% 운영자도 안전하게 구분.
// 같은 톤(rose/amber) 안에서 의미가 다른 상태들을 구분하기 위한 보조 시각 신호.
const DANGER_STATUSES = new Set([
  "cancelled",
  "refunded",
  "recovery_required",
  "blocked",
  "withdrawn",
  "rejected",
  "discarded",
]);
const WARN_STATUSES = new Set([
  "pending",
  "scheduled",
  "inspecting",
  "sold_out",
  "reserved",
]);
const SUCCESS_STATUSES = new Set([
  "completed",
  "confirmed",
  "delivered",
  "settled",
  "active",
  "selling",
  "on_sale",
  "arrived",
]);

function getStatusIcon(status) {
  if (DANGER_STATUSES.has(status)) return "⚠";
  if (WARN_STATUSES.has(status)) return "●";
  if (SUCCESS_STATUSES.has(status)) return "✓";
  return null;
}

function StatusBadge({ type = "book", status }) {
  const labelMap = LABEL_MAP_BY_TYPE[type] || bookStatusLabel;
  const colorMap = COLOR_MAP_BY_TYPE[type] || COLOR_MAP_BY_TYPE.book;

  // product 타입은 book status도 fallback으로 지원 (스토어 갱신 트리거 시 일시적 매핑).
  const label =
    type === "product"
      ? labelMap[status] ?? bookStatusLabel[status] ?? status
      : labelMap[status] ?? status;
  const colorClass =
    type === "product"
      ? colorMap[status] ?? COLOR_MAP_BY_TYPE.book[status] ?? "bg-slate-100 text-slate-700"
      : colorMap[status] ?? "bg-slate-100 text-slate-700";

  const icon = getStatusIcon(status);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold leading-none tracking-wide ${colorClass}`}
    >
      {icon ? <span aria-hidden="true" className="text-[10px] leading-none">{icon}</span> : null}
      {label}
    </span>
  );
}

export default StatusBadge;
