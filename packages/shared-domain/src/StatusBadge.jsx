import {
  bookStatusLabel,
  pickupRequestStatusLabel,
  productStatusLabel,
  shipmentStatusLabel,
} from "./status";

const shipmentColorMap = {
  scheduled: "bg-amber-100 text-amber-800",
  inspecting: "bg-orange-100 text-orange-800",
  inspected: "bg-sky-100 text-sky-800",
};

const pickupRequestColorMap = {
  pending: "bg-slate-100 text-slate-700",
  pickup_scheduled: "bg-sky-100 text-sky-800",
  picking_up: "bg-indigo-100 text-indigo-800",
  arrived: "bg-emerald-100 text-emerald-800",
  inspecting: "bg-orange-100 text-orange-800",
  inspected: "bg-cyan-100 text-cyan-800",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-700",
};

const bookColorMap = {
  on_sale: "bg-emerald-100 text-emerald-800",
  settled: "bg-indigo-100 text-indigo-800",
};

const productColorMap = {
  selling: "bg-emerald-100 text-emerald-800",
  sold_out: "bg-amber-100 text-amber-800",
  hidden: "bg-slate-100 text-slate-700",
  on_sale: "bg-emerald-100 text-emerald-800",
  settled: "bg-indigo-100 text-indigo-800",
};

function StatusBadge({ type = "book", status }) {
  const isShipment = type === "shipment";
  const isPickupRequest = type === "pickupRequest";
  const isProduct = type === "product";
  const label = isShipment
    ? shipmentStatusLabel[status] ?? status
    : isPickupRequest
      ? pickupRequestStatusLabel[status] ?? status
      : isProduct
        ? productStatusLabel[status] ?? bookStatusLabel[status] ?? status
        : bookStatusLabel[status] ?? status;

  const colorClass = isShipment
    ? shipmentColorMap[status] ?? "bg-slate-100 text-slate-700"
    : isPickupRequest
      ? pickupRequestColorMap[status] ?? "bg-slate-100 text-slate-700"
      : isProduct
        ? productColorMap[status] ?? bookColorMap[status] ?? "bg-slate-100 text-slate-700"
        : bookColorMap[status] ?? "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold leading-none tracking-wide ${colorClass}`}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
