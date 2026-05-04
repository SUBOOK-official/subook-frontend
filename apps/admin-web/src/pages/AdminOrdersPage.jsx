import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { notifyOrderConfirmed, notifyShippingStarted, notifyDeliveryDone } from "../lib/adminNotification";

const PAGE_SIZE = 30;

const ORDER_STATUS_OPTIONS = [
  { value: "pending", label: "입금대기" },
  { value: "paid", label: "결제완료" },
  { value: "preparing", label: "상품 준비 중" },
  { value: "shipping", label: "배송중" },
  { value: "delivered", label: "배송완료" },
  { value: "confirmed", label: "구매확정" },
  { value: "cancelled", label: "주문취소" },
  { value: "refunded", label: "환불" },
];

const STATUS_BADGE_STYLE = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  preparing: "bg-purple-100 text-purple-800",
  shipping: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  confirmed: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-red-100 text-red-700",
};

const CARRIER_OPTIONS = [
  "CJ대한통운",
  "한진택배",
  "롯데택배",
  "우체국택배",
  "로젠택배",
];

// 워크플로우: pending → paid → preparing → shipping → delivered → confirmed
// preparing은 어드민이 결제 확인 후 명시적으로 전환하는 단계.
// 운송장 입력은 preparing에서만 가능하도록 UI를 강제(백엔드는 paid→shipping 직행도 호환).
const NEXT_STATUS_ACTIONS = {
  pending: [
    { status: "paid", label: "입금확인", style: "btn-primary" },
    { status: "cancelled", label: "주문취소", style: "btn-danger" },
  ],
  paid: [
    { status: "preparing", label: "상품 준비 중", style: "btn-primary" },
    { status: "cancelled", label: "주문취소", style: "btn-danger" },
  ],
  preparing: [
    { status: "shipping", label: "송장입력", style: "btn-primary", requiresTracking: true },
    { status: "cancelled", label: "주문취소", style: "btn-danger" },
  ],
  shipping: [
    { status: "delivered", label: "배송완료", style: "btn-primary" },
  ],
  delivered: [],
  confirmed: [],
  cancelled: [],
  refunded: [],
};

function getStatusLabel(status) {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function parseCsvText(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    if (parts.length < 2) continue;
    // 형식: 주문번호, 택배사, 송장번호 또는 주문번호, 송장번호
    if (parts.length >= 3) {
      rows.push({ orderNumber: parts[0], carrier: parts[1], trackingNumber: parts[2] });
    } else {
      rows.push({ orderNumber: parts[0], carrier: "CJ대한통운", trackingNumber: parts[1] });
    }
  }
  return rows;
}

function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [toast, setToast] = useState(null);
  const requestIdRef = useRef(0);

  // 송장 입력 모달
  const [trackingModal, setTrackingModal] = useState(null);
  const [trackingCarrier, setTrackingCarrier] = useState("CJ대한통운");
  const [trackingInput, setTrackingInput] = useState("");

  // CSV 일괄 송장 입력 모달
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvRows, setCsvRows] = useState([]);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvResults, setCsvResults] = useState(null);
  const csvFileRef = useRef(null);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;

    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = {
      p_limit: PAGE_SIZE,
      p_offset: 0,
    };
    if (search.trim()) params.p_search = search.trim();
    if (statusFilters.length > 0) params.p_statuses = statusFilters;
    if (fromDate) params.p_from_date = fromDate;
    if (toDate) params.p_to_date = toDate;

    const [ordersResult, summaryResult] = await Promise.all([
      supabase.rpc("list_admin_orders", params),
      supabase.rpc("get_admin_order_summary"),
    ]);

    if (currentRequestId !== requestIdRef.current) return;

    if (!ordersResult.error) {
      setOrders(Array.isArray(ordersResult.data) ? ordersResult.data : []);
    }
    if (!summaryResult.error && summaryResult.data) {
      setSummary(summaryResult.data);
    }

    setIsLoading(false);
  }, [search, statusFilters, fromDate, toDate]);

  useEffect(() => {
    const timerId = setTimeout(() => {
      void loadOrders();
    }, 200);
    return () => clearTimeout(timerId);
  }, [loadOrders]);

  const handleStatusFilterToggle = (value) => {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleUpdateStatus = async (orderId, newStatus, trackingNumber = null, carrier = "CJ대한통운") => {
    setBusyOrderId(orderId);

    const params = { p_order_id: orderId, p_status: newStatus };
    if (trackingNumber) {
      params.p_tracking_number = trackingNumber;
      params.p_tracking_carrier = carrier;
    }

    const { error } = await supabase.rpc("admin_update_order_status", params);
    setBusyOrderId(null);

    if (error) {
      showToast(error.message || "상태 변경에 실패했습니다.", "error");
      return false;
    }

    showToast(`주문 상태가 "${getStatusLabel(newStatus)}"(으)로 변경되었습니다.`, "success");

    // 알림톡 발송 (백그라운드 — 실패해도 상태 변경은 유지)
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      try {
        if (newStatus === "paid") {
          await notifyOrderConfirmed({ order });
        } else if (newStatus === "shipping" && trackingNumber) {
          await notifyShippingStarted({ order, trackingNumber });
        } else if (newStatus === "delivered") {
          await notifyDeliveryDone({ order });
        }
      } catch {
        console.warn("알림톡 발송 실패 (주문 상태 변경은 정상 처리됨)");
      }
    }

    setSelectedOrderId(null);
    setTrackingModal(null);
    setTrackingInput("");
    setTrackingCarrier("CJ대한통운");
    await loadOrders();
    return true;
  };

  // 송장 입력 모달 열기
  const openTrackingModal = (order) => {
    setTrackingModal(order);
    setTrackingCarrier(order.tracking_carrier || "CJ대한통운");
    setTrackingInput(order.tracking_number || "");
  };

  const closeTrackingModal = () => {
    setTrackingModal(null);
    setTrackingInput("");
    setTrackingCarrier("CJ대한통운");
  };

  const handleTrackingSubmit = async () => {
    if (!trackingModal || !trackingInput.trim()) return;
    await handleUpdateStatus(trackingModal.id, "shipping", trackingInput.trim(), trackingCarrier);
  };

  // CSV 일괄 송장 입력
  const handleCsvFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = parseCsvText(text);
      setCsvRows(rows);
      setCsvResults(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleCsvBulkProcess = async () => {
    if (csvRows.length === 0) return;
    setCsvProcessing(true);

    const results = [];
    for (const row of csvRows) {
      const order = orders.find((o) => o.order_number === row.orderNumber);
      if (!order) {
        results.push({ ...row, success: false, message: "주문번호 없음" });
        continue;
      }
      if (order.status !== "paid") {
        results.push({ ...row, success: false, message: `상태 불일치 (${getStatusLabel(order.status)})` });
        continue;
      }

      const params = {
        p_order_id: order.id,
        p_status: "shipping",
        p_tracking_number: row.trackingNumber,
        p_tracking_carrier: row.carrier,
      };
      const { error } = await supabase.rpc("admin_update_order_status", params);

      if (error) {
        results.push({ ...row, success: false, message: error.message });
      } else {
        results.push({ ...row, success: true, message: "처리 완료" });
        // 알림톡 (백그라운드)
        try {
          await notifyShippingStarted({ order, trackingNumber: row.trackingNumber });
        } catch { /* 무시 */ }
      }
    }

    setCsvResults(results);
    setCsvProcessing(false);
    await loadOrders();
  };

  const closeCsvModal = () => {
    setCsvModalOpen(false);
    setCsvRows([]);
    setCsvResults(null);
    if (csvFileRef.current) csvFileRef.current.value = "";
  };

  const downloadCsvTemplate = () => {
    const content = "주문번호,택배사,송장번호\nORD-2604-0001,CJ대한통운,123456789012\n";
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "송장_일괄입력_템플릿.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const paidOrderCount = useMemo(
    () => orders.filter((o) => o.status === "paid").length,
    [orders],
  );

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const summaryCards = summary
    ? [
        { label: "전체 주문", value: summary.total_count ?? 0 },
        { label: "입금대기", value: summary.pending_count ?? 0, hint: "확인 필요" },
        { label: "결제완료/배송중", value: (summary.paid_count ?? 0) + (summary.shipping_count ?? 0), hint: "처리 필요" },
        { label: "구매확정", value: summary.confirmed_count ?? 0 },
      ]
    : [];

  return (
    <AdminShell
      activeModule="orders"
      description="주문 목록, 입금 확인, 송장 입력, 배송 상태 관리"
      summaryCards={summaryCards}
      title="주문 관리"
    >
      {/* 필터 영역 */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="input-base !w-auto flex-1 min-w-[200px]"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="주문번호, 구매자, 수령인 검색"
            type="search"
            value={search}
          />
          <input
            className="input-base !w-auto"
            onChange={(e) => setFromDate(e.target.value)}
            type="date"
            value={fromDate}
          />
          <span className="text-slate-400 text-sm">~</span>
          <input
            className="input-base !w-auto"
            onChange={(e) => setToDate(e.target.value)}
            type="date"
            value={toDate}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ORDER_STATUS_OPTIONS.map((opt) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                statusFilters.includes(opt.value)
                  ? "bg-slate-950 text-white border-slate-950"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
              key={opt.value}
              onClick={() => handleStatusFilterToggle(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
          {statusFilters.length > 0 && (
            <button
              className="text-xs text-slate-400 underline ml-1"
              onClick={() => setStatusFilters([])}
              type="button"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 주문 목록 */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">주문이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">주문번호</th>
                  <th className="px-4 py-3">구매자</th>
                  <th className="px-4 py-3">상품</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">결제</th>
                  <th className="px-4 py-3">주문일</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    className={`border-b border-slate-50 hover:bg-slate-50 transition ${
                      selectedOrderId === order.id ? "bg-blue-50" : ""
                    }`}
                    key={order.id}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap">
                      {order.order_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold">{order.buyer_name || "—"}</div>
                      <div className="text-xs text-slate-400">{order.buyer_email || ""}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="text-sm truncate">
                        {order.items?.[0]?.title ?? "—"}
                        {order.item_count > 1 && (
                          <span className="text-slate-400"> 외 {order.item_count - 1}건</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${STATUS_BADGE_STYLE[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {order.payment_method === "bank_transfer" ? "계좌이체" : order.payment_method}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {order.status === "paid" && (
                          <button
                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-2.5 py-1 whitespace-nowrap"
                            onClick={() => openTrackingModal(order)}
                            type="button"
                          >
                            송장입력
                          </button>
                        )}
                        {order.status === "shipping" && order.tracking_number && (
                          <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
                            {order.tracking_number}
                          </span>
                        )}
                        <button
                          className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                          onClick={() => setSelectedOrderId(selectedOrderId === order.id ? null : order.id)}
                          type="button"
                        >
                          {selectedOrderId === order.id ? "닫기" : "상세"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 결제완료 건 CSV 일괄 송장 입력 안내 */}
      {!isLoading && paidOrderCount > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            결제완료 <strong className="text-blue-600">{paidOrderCount}건</strong> 송장 입력 대기 중
          </span>
          <button
            className="btn-secondary !w-auto !px-4 !py-2 text-sm"
            onClick={() => setCsvModalOpen(true)}
            type="button"
          >
            CSV 일괄 송장 입력
          </button>
        </div>
      )}

      {/* 주문 상세 패널 */}
      {selectedOrder && (
        <div className="card p-5 space-y-4 animate-rise">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">
                주문 {selectedOrder.order_number}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {formatDate(selectedOrder.created_at)} · {selectedOrder.buyer_name} ({selectedOrder.buyer_email})
              </p>
            </div>
            <span className={`rounded-md px-3 py-1.5 text-xs font-bold ${STATUS_BADGE_STYLE[selectedOrder.status] ?? ""}`}>
              {getStatusLabel(selectedOrder.status)}
            </span>
          </div>

          {/* 주문 상품 */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">주문 상품</h4>
            <div className="space-y-2">
              {selectedOrder.items?.map((item) => (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2" key={item.id}>
                  <div>
                    <span className="text-sm font-semibold">{item.title}</span>
                    {item.condition_grade && (
                      <span className="ml-2 text-xs text-slate-400">{item.condition_grade}</span>
                    )}
                    <span className="ml-2 text-xs text-slate-400">×{item.quantity}</span>
                  </div>
                  <span className="text-sm font-bold">{formatCurrency(item.total_price)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-sm">
              <span>상품 {formatCurrency(selectedOrder.subtotal)} + 배송비 {selectedOrder.shipping_fee === 0 ? "무료" : formatCurrency(selectedOrder.shipping_fee)}</span>
              <span className="font-black text-lg">{formatCurrency(selectedOrder.total_amount)}</span>
            </div>
          </div>

          {/* 배송지 */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">배송지</h4>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm space-y-1">
              <p className="font-semibold">{selectedOrder.shipping_recipient_name} · {selectedOrder.shipping_recipient_phone}</p>
              <p className="text-slate-600">
                [{selectedOrder.shipping_postal_code}] {selectedOrder.shipping_address_line1} {selectedOrder.shipping_address_line2 ?? ""}
              </p>
              {selectedOrder.shipping_memo && (
                <p className="text-xs text-slate-400">메모: {selectedOrder.shipping_memo}</p>
              )}
            </div>
          </div>

          {/* 송장 정보 */}
          {selectedOrder.tracking_number && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">배송 추적</h4>
              <p className="text-sm">
                {selectedOrder.tracking_carrier ?? "CJ대한통운"} · {selectedOrder.tracking_number}
              </p>
            </div>
          )}

          {/* 상태 변경 액션 */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">상태 변경</h4>
            <div className="flex flex-wrap gap-2 items-end">
              {(NEXT_STATUS_ACTIONS[selectedOrder.status] ?? []).map((action) => {
                if (action.requiresTracking) {
                  return (
                    <button
                      className="btn-primary !w-auto !px-4 !py-2 text-sm"
                      key={action.status}
                      onClick={() => openTrackingModal(selectedOrder)}
                      type="button"
                    >
                      송장입력
                    </button>
                  );
                }

                return (
                  <button
                    className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                    disabled={busyOrderId === selectedOrder.id}
                    key={action.status}
                    onClick={() => handleUpdateStatus(selectedOrder.id, action.status)}
                    type="button"
                  >
                    {busyOrderId === selectedOrder.id ? "처리 중..." : action.label}
                  </button>
                );
              })}

              {(NEXT_STATUS_ACTIONS[selectedOrder.status] ?? []).length === 0 && (
                <p className="text-xs text-slate-400">현재 상태에서 가능한 작업이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 송장 입력 모달 */}
      {trackingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeTrackingModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-950">
              송장 입력 — {trackingModal.order_number}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">택배사 *</label>
                <select
                  className="input-base"
                  onChange={(e) => setTrackingCarrier(e.target.value)}
                  value={trackingCarrier}
                >
                  {CARRIER_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">송장번호 *</label>
                <input
                  autoFocus
                  className="input-base"
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="송장번호를 입력하세요"
                  type="text"
                  value={trackingInput}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                className="btn-secondary !w-auto !px-5 !py-2.5 text-sm"
                onClick={closeTrackingModal}
                type="button"
              >
                취소
              </button>
              <button
                className="btn-primary !w-auto !px-5 !py-2.5 text-sm"
                disabled={busyOrderId === trackingModal.id || !trackingInput.trim()}
                onClick={handleTrackingSubmit}
                type="button"
              >
                {busyOrderId === trackingModal.id ? "처리 중..." : "배송 처리"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV 일괄 송장 입력 모달 */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeCsvModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-950">일괄 송장 입력</h3>

            {!csvResults ? (
              <>
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">CSV 파일을 업로드해주세요.</p>
                  <p className="text-xs text-slate-400">형식: 주문번호, 택배사, 송장번호</p>

                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                    <input
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleCsvFileSelect}
                      ref={csvFileRef}
                      type="file"
                    />
                    <button
                      className="btn-secondary !w-auto !px-4 !py-2 text-sm"
                      onClick={() => csvFileRef.current?.click()}
                      type="button"
                    >
                      CSV 파일 선택
                    </button>
                    <p className="text-xs text-slate-400 mt-2">또는 드래그 앤 드롭</p>
                  </div>

                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={downloadCsvTemplate}
                    type="button"
                  >
                    CSV 템플릿 다운로드
                  </button>
                </div>

                {csvRows.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">미리보기</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-slate-500">
                            <th className="py-2 px-2">주문번호</th>
                            <th className="py-2 px-2">택배사</th>
                            <th className="py-2 px-2">송장번호</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvRows.map((row, i) => (
                            <tr className="border-b border-slate-50" key={i}>
                              <td className="py-1.5 px-2 font-mono">{row.orderNumber}</td>
                              <td className="py-1.5 px-2">{row.carrier}</td>
                              <td className="py-1.5 px-2 font-mono">{row.trackingNumber}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500">{csvRows.length}건 확인됨</p>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  <button className="btn-secondary !w-auto !px-5 !py-2.5 text-sm" onClick={closeCsvModal} type="button">
                    취소
                  </button>
                  <button
                    className="btn-primary !w-auto !px-5 !py-2.5 text-sm"
                    disabled={csvRows.length === 0 || csvProcessing}
                    onClick={handleCsvBulkProcess}
                    type="button"
                  >
                    {csvProcessing ? "처리 중..." : "일괄 처리"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-700">처리 결과</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="py-2 px-2">주문번호</th>
                          <th className="py-2 px-2">송장번호</th>
                          <th className="py-2 px-2">결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvResults.map((r, i) => (
                          <tr className="border-b border-slate-50" key={i}>
                            <td className="py-1.5 px-2 font-mono">{r.orderNumber}</td>
                            <td className="py-1.5 px-2 font-mono">{r.trackingNumber}</td>
                            <td className={`py-1.5 px-2 font-semibold ${r.success ? "text-green-600" : "text-red-500"}`}>
                              {r.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    성공 {csvResults.filter((r) => r.success).length}건 / 실패 {csvResults.filter((r) => !r.success).length}건
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="btn-primary !w-auto !px-5 !py-2.5 text-sm" onClick={closeCsvModal} type="button">
                    닫기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-sm font-semibold shadow-lg ${
            toast.tone === "error"
              ? "bg-red-500 text-white"
              : toast.tone === "success"
                ? "bg-green-600 text-white"
                : "bg-slate-800 text-white"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      )}
    </AdminShell>
  );
}

export default AdminOrdersPage;
