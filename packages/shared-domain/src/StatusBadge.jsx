import { bookStatusLabel, shipmentStatusLabel } from "./status";

const shipmentColorMap = {
  scheduled: "bg-amber-100 text-amber-800",
  inspecting: "bg-orange-100 text-orange-800",
  inspected: "bg-sky-100 text-sky-800",
};

const bookColorMap = {
  on_sale: "bg-emerald-100 text-emerald-800",
  settled: "bg-indigo-100 text-indigo-800",
};

function StatusBadge({ type = "book", status }) {
  const isShipment = type === "shipment";
  const label = isShipment
    ? shipmentStatusLabel[status] ?? status
    : bookStatusLabel[status] ?? status;

  const colorClass = isShipment
    ? shipmentColorMap[status] ?? "bg-slate-100 text-slate-700"
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
