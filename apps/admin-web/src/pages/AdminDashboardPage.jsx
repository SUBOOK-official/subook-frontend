import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate } from "@shared-domain/format";
import StatusBadge from "@shared-domain/StatusBadge";
import { useAdminBadgeCounts } from "../lib/useAdminBadgeCounts";

// R2 IA 개편: 이 페이지는 '오늘 할 일' 허브 전용이다.
// 예전에는 view prop(overview/inspection/catalog/pickups/settlements)으로 5개 화면을
// 다중화한 ~1,800줄 레거시였으나, R1에서 검수·수거는 /admin/pickups 탭으로,
// 재고 엑셀은 상품 재고 페이지(lib/inventoryAuditExport)로 이관되어 여기선 제거했다.
// KPI도 전체 shipments를 페이지네이션으로 전부 걷던 방식 대신 head count 4개로 경량화.

const PRIORITY_SHIPMENT_LIMIT = 3;

async function fetchHeadCount(table, applyQuery) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (applyQuery) {
    query = applyQuery(query);
  }

  const { count, error } = await query;
  if (error) {
    return 0;
  }
  return count ?? 0;
}

function AdminDashboardPage() {
  const badgeCounts = useAdminBadgeCounts();
  const requestSeqRef = useRef(0);

  const [shipmentKpi, setShipmentKpi] = useState({
    total: 0,
    scheduled: 0,
    inspecting: 0,
    inspected: 0,
  });
  const [priorityShipments, setPriorityShipments] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    let cancelled = false;
    const seq = ++requestSeqRef.current;

    (async () => {
      const [total, scheduled, inspecting, inspected, priorityResult] = await Promise.all([
        fetchHeadCount("shipments"),
        fetchHeadCount("shipments", (q) => q.eq("status", "scheduled")),
        fetchHeadCount("shipments", (q) => q.eq("status", "inspecting")),
        fetchHeadCount("shipments", (q) => q.eq("status", "inspected")),
        supabase.rpc("list_admin_shipments", {
          p_search: null,
          p_statuses: ["scheduled", "inspecting"],
          p_from_date: null,
          p_to_date: null,
          p_limit: PRIORITY_SHIPMENT_LIMIT,
          p_offset: 0,
        }),
      ]);

      if (cancelled || seq !== requestSeqRef.current) return;

      setShipmentKpi({ total, scheduled, inspecting, inspected });

      if (priorityResult.error) {
        setError("처리할 수거 건 목록을 불러오지 못했습니다.");
        setPriorityShipments([]);
      } else {
        setPriorityShipments(Array.isArray(priorityResult.data) ? priorityResult.data : []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCards = [
    { label: "전체 수거건", value: `${shipmentKpi.total}건`, hint: "누적 검수 단위" },
    { label: "검수 대기", value: `${shipmentKpi.scheduled}건`, hint: "수거예정 상태의 작업" },
    { label: "검수 진행", value: `${shipmentKpi.inspecting}건`, hint: "책 등록·검수 진행 중" },
    { label: "검수 완료", value: `${shipmentKpi.inspected}건`, hint: "공개 준비가 끝난 수거 건" },
  ];

  const todoCards = [
    {
      key: "orders-pending",
      label: "입금확인",
      hint: "무통장 입금 대조",
      to: "/admin/orders?status=pending",
      count: badgeCounts.ordersPending,
    },
    {
      key: "orders-preparing",
      label: "발송 처리",
      hint: "송장 입력·출고",
      to: "/admin/orders?status=preparing",
      count: badgeCounts.ordersPreparing,
    },
    {
      key: "pickups",
      label: "수거 신청",
      hint: "신규 신청 접수",
      to: "/admin/pickups",
      count: badgeCounts.pickups,
    },
    {
      key: "inspection",
      label: "검수·등록",
      hint: "입고된 책 등록",
      to: "/admin/pickups?tab=inspection",
      count: badgeCounts.inspection,
    },
    {
      key: "settlements",
      label: "정산 지급",
      hint: "승인·이체 대기",
      to: "/admin/settlements",
      count: badgeCounts.settlements,
    },
  ];

  return (
    <AdminShell
      activeModule="overview"
      description="처리 대기 업무를 한눈에 — 카드를 누르면 해당 작업 화면으로 이동합니다"
      summaryCards={summaryCards}
      title="오늘 할 일"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">
          Supabase 환경 변수가 설정되지 않아 대시보드를 불러올 수 없습니다.
        </p>
      ) : null}

      {error ? <p className="notice-error">{error}</p> : null}

      {/* 처리 대기 업무 5종 — 업무 순서대로, 클릭 시 해당 필터가 걸린 채로 이동 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {todoCards.map((card) => {
          const numeric = Number.isFinite(card.count) ? card.count : 0;
          const accent = numeric > 0;
          return (
            <Link
              className={`card flex items-center justify-between transition hover:shadow-md ${
                accent ? "ring-2 ring-rose-500/40" : ""
              }`}
              key={card.key}
              to={card.to}
            >
              <div>
                <p className="text-sm font-bold text-slate-900">{card.label}</p>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    accent ? "text-rose-600" : "text-slate-400"
                  }`}
                >
                  {accent ? `${numeric.toLocaleString("ko-KR")}건 대기` : "완료"}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">{card.hint}</p>
              </div>
              <span
                aria-hidden="true"
                className={`text-lg font-black ${accent ? "text-rose-500" : "text-slate-300"}`}
              >
                →
              </span>
            </Link>
          );
        })}
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">지금 처리할 수거 건</h2>
          <Link className="text-sm font-semibold text-brand" to="/admin/pickups?tab=inspection">
            전체 보기
          </Link>
        </div>
        {priorityShipments.length > 0 ? (
          <div className="mt-4 space-y-3">
            {priorityShipments.map((shipment) => (
              <Link
                className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                key={shipment.id}
                to={`/admin/shipments/${shipment.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{shipment.seller_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {shipment.seller_phone} · {formatDate(shipment.pickup_date)}
                  </p>
                </div>
                <StatusBadge status={shipment.status} type="shipment" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">표시할 수거 건이 없습니다.</p>
        )}
      </section>
    </AdminShell>
  );
}

export default AdminDashboardPage;
