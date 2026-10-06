import { useEffect, useState } from "react";
import { loadEntityNotifications } from "@shared-supabase/adminOperationsClient";
import { useAdminOperations } from "../lib/useAdminOperations";
import { toKstInput } from "../lib/adminDateTime";
import AdminQueryState from "./AdminQueryState";

const LABELS = { insert: "등록", update: "변경", status: "상태 변경", delete: "삭제" };
export default function AdminEntityTimeline({ entity, id, milestones = [] }) {
  const result = useAdminOperations("history", { entity, id: String(id || "") });
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState("");
  useEffect(() => {
    let active = true;
    setNotifications([]); setNotificationError("");
    const type = { orders: "order", pickup_requests: "pickup_request", shipments: "shipment" }[entity];
    if (type && id) loadEntityNotifications(type, id).then((rows) => { if (active) setNotifications(rows); }).catch(() => { if (active) setNotificationError("알림 이력 조회 실패 — 알림 이력 메뉴에서 다시 확인해 주세요."); });
    return () => { active = false; };
  }, [entity, id]);
  const entries = [
    ...milestones.filter((m) => m.at).map((m) => ({ id: `milestone-${m.label}`, at: m.at, label: m.label })),
    ...(result.data?.items || []).map((e) => ({ id: e.id, at: e.created_at, label: LABELS[e.action] || e.action, detail: e.detail })),
    ...notifications.map((n) => ({ id: `notification-${n.id}`, at: n.created_at, label: `${n.notification_type} · ${n.status}`, detail: n.error_message })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  return <section className="mt-5 border-t border-slate-200 pt-4"><h3 className="mb-3 text-sm font-bold">처리 이력</h3>
    {notificationError ? <p className="mb-2 text-xs text-amber-700">{notificationError}</p> : null}
    <AdminQueryState loading={result.loading} error={result.error} onRetry={result.refresh} empty={!entries.length}>
      <ol className="max-h-80 space-y-3 overflow-y-auto border-l border-slate-200 pl-4">{entries.map((entry) => <li key={entry.id} className="text-xs"><p className="font-semibold text-slate-800">{entry.label}</p><time className="text-slate-400">{toKstInput(entry.at).replace("T", " ")} KST</time>{entry.detail ? <p className="mt-0.5 break-words text-slate-500">{entry.detail}</p> : null}</li>)}</ol>
      {result.data?.total_count > 50 ? <p className="mt-2 text-xs text-slate-500">변경 이력은 최근 50건입니다. 전체는 작업·변경 이력에서 조회할 수 있습니다.</p> : null}
    </AdminQueryState>
  </section>;
}
