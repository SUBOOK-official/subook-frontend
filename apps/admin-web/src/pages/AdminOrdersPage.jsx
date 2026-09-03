import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import StatusBadge from "@shared-domain/StatusBadge";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { orderStatusLabel } from "@shared-domain/status";
import {
  notifyDeliveryDone,
  notifyOrderConfirmed,
  notifyRefundCompleted,
  notifyShippingStarted,
} from "../lib/adminNotification";
import { CjWaybillFormPrintModal } from "../components/CjWaybillFormLabel";
import { AlertTriangleIcon, CheckIcon } from "../components/icons";
import { downloadSalesSheetXlsx } from "../lib/salesSheetExport";
import { BusyText, InlineLoading, LoadingOverlay } from "../components/Loading";

const PAGE_SIZE = 30;

// '결제완료(paid)' 단계 폐지 — 결제 확인 즉시 preparing으로 간다. 필터 칩에서 제외.
// (레거시 paid 주문의 라벨은 shared-domain orderStatusLabel로 fallback 렌더된다.)
const ORDER_STATUS_OPTIONS = [
  { value: "pending", label: "입금대기" },
  { value: "preparing", label: "상품 준비 중" },
  { value: "shipping", label: "배송중" },
  { value: "delivered", label: "배송완료" },
  { value: "confirmed", label: "구매확정" },
  { value: "cancelled", label: "주문취소" },
  { value: "refunded", label: "환불" },
];

const CARRIER_OPTIONS = [
  "CJ대한통운",
  "한진택배",
  "롯데택배",
  "우체국택배",
  "로젠택배",
];

// 결제 확인 시각(입금확인·PG 승인)은 분 단위까지 보여준다 (shared formatDate는 날짜만).
function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// 목록 표 전용 압축 날짜 — "2026년 8월 9일"은 열 폭을 많이 먹어 표가 가로로 넘친다.
function formatCompactDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

// 워크플로우: pending → (무통장 입금확인 / PG 결제승인) → preparing → shipping → delivered → confirmed
// '결제완료(paid)' 대기 단계는 2026-07 폐지 — 결제가 확인되면 곧바로 '상품 준비 중'으로 간다.
//   · 무통장(bank_transfer): 입금확인 버튼(admin_confirm_payment)이 pending→preparing 전이
//   · PG(카드 등): 토스 승인 서버리스(confirm_pg_payment)가 자동으로 pending→preparing 전이
// paid 항목은 폐지 이전에 생성된 레거시 주문의 후속 처리용으로만 남겨둔다.
// action: "refund"는 admin_refund_order RPC를 호출 (status 변경이 아닌 별도 흐름).
// '주문취소'(상태변경)는 미결제(pending) 전용 — 결제된 주문은 환불처리로 단일화 (2026-08-03).
//   PG 실취소 없이 상태만 바꾸던 함정 제거. DB단 가드(admin_update_order_status)도 동일 정책.
const NEXT_STATUS_ACTIONS = {
  pending: [
    // 입금확인은 무통장 주문에만 노출 — PG 주문은 결제 성공 시 자동 전이되므로 수동 확인 없음.
    { action: "confirm_payment", label: "입금확인", style: "btn-primary", bankTransferOnly: true },
    { status: "cancelled", label: "주문취소", style: "btn-danger" },
  ],
  // 레거시(폐지 전 paid에 남은 주문 전용) — 신규 주문은 이 상태를 거치지 않는다.
  paid: [
    { status: "preparing", label: "상품 준비 중", style: "btn-primary" },
    { action: "refund", label: "환불처리", style: "btn-danger" },
  ],
  preparing: [
    // CJ 송장 출력: 채번+예약접수(cj-delivery) 자동 처리 후 표준 라벨 인쇄, 배송중 전환.
    { action: "cj_delivery", label: "CJ 송장 출력", style: "btn-primary" },
    // 수동 송장입력(다른 택배/직접 발번 대비 fallback).
    { status: "shipping", label: "송장 직접입력", style: "btn-secondary", requiresTracking: true },
    { action: "refund", label: "환불처리", style: "btn-danger" },
  ],
  shipping: [
    // 이미 발급된 운송장 라벨을 다시 열어 재인쇄 (채번/접수 없이 라우팅 재조회만).
    { action: "cj_reprint", label: "송장 재출력", style: "btn-secondary" },
    { status: "delivered", label: "배송완료", style: "btn-primary" },
    { action: "refund", label: "환불처리", style: "btn-danger" },
  ],
  delivered: [
    { action: "cj_reprint", label: "송장 재출력", style: "btn-secondary" },
    { action: "refund", label: "환불처리", style: "btn-danger" },
  ],
  confirmed: [
    { action: "refund", label: "환불처리", style: "btn-danger" },
  ],
  // 취소 주문 복원 (2026-08-31) — 입금 확인이 늦어 24시간 자동취소된 무통장 주문을 되살린다.
  //   결제·환불 이력이 남은 취소 주문(레거시)은 제외(unpaidOnly) — 되살리면 PG·입금 정합이 깨진다.
  cancelled: [
    { action: "restore", label: "주문 복원", style: "btn-secondary", unpaidOnly: true },
  ],
  refunded: [],
};

// 복원 가능 후보 — 결제/환불 스탬프가 하나도 없는 취소 주문만. (최종 판정은 RPC가 한다)
function isRestoreCandidate(order) {
  return (
    !order.paid_at &&
    !order.pg_approved_at &&
    !order.refunded_at &&
    !(Number(order.refunded_amount) > 0)
  );
}

function getStatusLabel(status) {
  return (
    ORDER_STATUS_OPTIONS.find((o) => o.value === status)?.label
    // 필터 칩에서 뺀 레거시 상태(paid 등)는 shared-domain 라벨로 fallback
    ?? orderStatusLabel[status]
    ?? status
  );
}

// 주문별 가능한 액션 — bankTransferOnly 액션(입금확인)은 무통장 주문에만,
// unpaidOnly 액션(주문 복원)은 결제 이력이 없는 주문에만 노출
function getOrderActions(order) {
  return (NEXT_STATUS_ACTIONS[order.status] ?? []).filter(
    (action) =>
      (!action.bankTransferOnly || order.payment_method === "bank_transfer") &&
      (!action.unpaidOnly || isRestoreCandidate(order)),
  );
}

const PAYMENT_METHOD_LABEL = {
  bank_transfer: "계좌이체",
  card: "카드",
  kakao_pay: "카카오페이",
  toss_pay: "토스페이",
  naver_pay: "네이버페이",
};

// 택배사별 송장번호 패턴 검증.
// CJ대한통운: 10~12자리 숫자 (12자리가 신규 표준이지만 10자리 구건도 호환)
// 한진택배: 10~12자리 숫자
// 롯데/우체국/로젠: 10~13자리 숫자 (택배사별 자릿수 변형 허용)
const TRACKING_PATTERNS = {
  CJ대한통운: /^\d{10,12}$/,
  한진택배: /^\d{10,12}$/,
  롯데택배: /^\d{10,13}$/,
  우체국택배: /^\d{10,13}$/,
  로젠택배: /^\d{10,13}$/,
};

function validateTrackingNumber(carrier, trackingNumber) {
  const cleaned = String(trackingNumber ?? "").replace(/[\s-]/g, "");
  const pattern = TRACKING_PATTERNS[carrier] ?? /^\d{8,16}$/;
  return pattern.test(cleaned);
}

function parseCsvText(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    if (parts.length < 2) continue;
    // 형식: 주문번호, 택배사, 송장번호 또는 주문번호, 송장번호
    let row;
    if (parts.length >= 3) {
      row = { orderNumber: parts[0], carrier: parts[1], trackingNumber: parts[2] };
    } else {
      row = { orderNumber: parts[0], carrier: "CJ대한통운", trackingNumber: parts[1] };
    }
    row.isValid = validateTrackingNumber(row.carrier, row.trackingNumber);
    row.validationError = row.isValid
      ? ""
      : `송장번호 형식 오류 (${row.carrier}: ${TRACKING_PATTERNS[row.carrier]?.source ?? "10~12자리 숫자"})`;
    rows.push(row);
  }
  return rows;
}

function AdminOrdersPage() {
  // '오늘 할 일' 카드·크로스 링크가 필터를 걸어 진입할 수 있게 URL 파라미터로 초기화
  // (?status=pending → 입금확인 대기만, ?q=이름 → 해당 회원 주문 검색)
  const [searchParams] = useSearchParams();
  const initialStatusParam = searchParams.get("status");
  const initialSearchParam = searchParams.get("q") ?? "";

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(initialSearchParam);
  const [statusFilters, setStatusFilters] = useState(
    initialStatusParam ? [initialStatusParam] : [],
  );
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
  // CJ 실시간 배송조회 모달 — {invcNo, orderNumber}
  const [deliveryTrace, setDeliveryTrace] = useState(null);
  const [deliveryTraceData, setDeliveryTraceData] = useState(null);
  const [deliveryTraceError, setDeliveryTraceError] = useState("");
  const [isDeliveryTraceLoading, setIsDeliveryTraceLoading] = useState(false);

  // 입금확인 모달 (금액 검증)
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentDepositorInput, setPaymentDepositorInput] = useState("");
  const [paymentInput, setPaymentInput] = useState("");

  // 주문 복원 모달 (자동취소 되돌리기 — 2026-08-31)
  //   열자마자 p_validate_only로 사전 검증해 "복원 못 하는 사유"를 먼저 보여준다.
  const [restoreModal, setRestoreModal] = useState(null);
  const [restoreCheck, setRestoreCheck] = useState(null); // { loading, blocked: [], error }

  // CSV 일괄 송장 입력 모달
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvRows, setCsvRows] = useState([]);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvResults, setCsvResults] = useState(null);
  const csvFileRef = useRef(null);

  // 일괄 선택
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // 일괄 입금확인 확인 모달 (입력 없는 확인 단계만 거침)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 비가역 작업 확인 모달 (손실 감수 등)
  const [destructiveModal, setDestructiveModal] = useState(null);

  // 환불 모달 (품목 선택 부분환불 — 2026-08-01)
  const [refundModal, setRefundModal] = useState(null);
  const [refundCheckedIds, setRefundCheckedIds] = useState(() => new Set());
  const [refundAmountInput, setRefundAmountInput] = useState("");
  const [refundAmountTouched, setRefundAmountTouched] = useState(false);
  const [refundReasonInput, setRefundReasonInput] = useState("");
  // 반품 회수 옵션 (2026-08-24 반품 수거 자동화)
  const [refundHoldRestock, setRefundHoldRestock] = useState(false);
  const [refundRegisterReturn, setRefundRegisterReturn] = useState(false);
  // 반품 수거 접수/취소/회수확인 진행 상태 (상세 패널 버튼 공용)
  const [returnBusy, setReturnBusy] = useState(false);

  // 판매내역 엑셀 (운영 구글시트 판매내역 탭과 동일 양식) 생성 중 여부
  const [isSalesExporting, setIsSalesExporting] = useState(false);

  // CJ 송장 출력 라벨 모달 데이터 (cj-delivery 응답의 단건 result)
  const [labelData, setLabelData] = useState(null);
  // CJ 송장 일괄 출력 — 선택 주문을 묶어 발급하고 한 번의 인쇄 작업으로 N장 출력
  const [bulkCjConfirmOpen, setBulkCjConfirmOpen] = useState(false);
  const [bulkCjProgress, setBulkCjProgress] = useState(null); // { done, total }
  const [bulkCjResult, setBulkCjResult] = useState(null); // 실패가 섞였을 때만 결과 요약 모달
  const [labelBatch, setLabelBatch] = useState(null); // 다건 라벨 배열

  // 일괄 입금확인 대상 — 선택된 주문 중 무통장(bank_transfer) + 입금대기(pending)만.
  // (2026-07-06 운영 피드백: 건별 금액 검증 모달이 번거로움 → 선택 후 입력 없이 일괄 처리.
  //  기존 '일괄 주문취소' 버튼은 이 버튼으로 대체 — 취소는 상세 패널에서 건별로 가능.)
  const selectedBulkConfirmTargets = useMemo(
    () =>
      orders.filter(
        (o) =>
          selectedIds.has(o.id)
          && o.payment_method === "bank_transfer"
          && o.status === "pending",
      ),
    [orders, selectedIds],
  );

  // 일괄 입금확인 실행 — admin_bulk_confirm_payment RPC (금액 검증 없이 pending→preparing)
  const handleBulkConfirmPayment = async () => {
    const targets = selectedBulkConfirmTargets;
    if (targets.length === 0) return;

    setBulkProcessing(true);
    const { data, error } = await supabase.rpc("admin_bulk_confirm_payment", {
      p_ids: targets.map((o) => o.id),
    });
    setBulkProcessing(false);
    setBulkConfirmOpen(false);

    if (error) {
      showToast(error.message || "일괄 입금확인에 실패했습니다.", "error");
      return;
    }

    const successCount = data?.success_count ?? 0;
    const failCount = data?.fail_count ?? 0;
    const failures = Array.isArray(data?.failures) ? data.failures : [];
    const failureDetail = failures.length > 0
      ? ` — ${failures
          .slice(0, 2)
          .map((f) => `${f.order_number ?? `#${f.order_id}`}: ${f.error}`)
          .join(" / ")}${failures.length > 2 ? " 외" : ""}`
      : "";
    showToast(
      `일괄 입금확인 완료 — 성공 ${successCount}건${failCount > 0 ? ` / 실패 ${failCount}건${failureDetail}` : ""}`,
      failCount > 0 ? "info" : "success",
    );

    // 입금확인 알림톡 (백그라운드, 실패해도 처리 자체는 유지) — 단건 흐름과 동일
    const successIds = new Set((data?.success_ids ?? []).map((id) => Number(id)));
    const confirmedOrders = targets.filter((o) => successIds.has(Number(o.id)));
    await Promise.allSettled(confirmedOrders.map((order) => notifyOrderConfirmed({ order })));

    setSelectedIds(new Set());
    await loadOrders();
    await loadSummary();
  };

  // CJ 송장 일괄 출력 대상 — 선택된 주문 중 발급 가능한 상태(상품 준비 중 + 레거시 paid)만.
  // 서버(cj-delivery)의 canRegisterDelivery와 같은 기준.
  const selectedCjTargets = useMemo(
    () =>
      orders.filter(
        (o) => selectedIds.has(o.id) && (o.status === "preparing" || o.status === "paid"),
      ),
    [orders, selectedIds],
  );

  // 일괄 재출력 대상 — 이미 운송장이 있는 주문. 채번·접수·상태변경·알림톡 전부 없음.
  const selectedCjReprintTargets = useMemo(
    () =>
      orders.filter(
        (o) =>
          selectedIds.has(o.id)
          && o.tracking_number
          && ["shipping", "delivered", "confirmed"].includes(o.status),
      ),
    [orders, selectedIds],
  );

  const toggleSelectId = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (current.size === orders.length && orders.length > 0) return new Set();
      return new Set(orders.map((o) => o.id));
    });
  };

  // 필터/페이지 변경 시 선택 초기화. orders 배열 자체에 의존하면 단순 데이터 재로딩
  // (다른 운영자의 변경, 폴링 등)에도 선택이 사라져 일괄 작업 도중 재선택을 반복하게 된다.
  // 대신 orders 갱신 시에는 살아남은 id만 유지하고, 입력 변경에서는 명시적으로 초기화한다.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const surviving = new Set();
      orders.forEach((o) => {
        if (prev.has(o.id)) surviving.add(o.id);
      });
      return surviving.size === prev.size ? prev : surviving;
    });
  }, [orders]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilters, fromDate, toDate, currentPage]);

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
      p_offset: (currentPage - 1) * PAGE_SIZE,
    };
    if (search.trim()) params.p_search = search.trim();
    if (statusFilters.length > 0) params.p_statuses = statusFilters;
    if (fromDate) params.p_from_date = fromDate;
    if (toDate) params.p_to_date = toDate;

    const ordersResult = await supabase.rpc("list_admin_orders", params);

    if (currentRequestId !== requestIdRef.current) return;

    if (!ordersResult.error) {
      // RPC 응답이 배열(레거시) 또는 { items, total_count }(신규) 모두 호환
      const raw = ordersResult.data;
      if (Array.isArray(raw)) {
        setOrders(raw);
        // 페이지가 가득 차면 정확한 총량을 알 수 없음 — 0을 넣으면 totalPages=1이 되어
        // 다음 페이지로 못 가므로, "최소 한 페이지 더 있음"으로 표현한다.
        setTotalCount(
          raw.length < PAGE_SIZE ? (currentPage - 1) * PAGE_SIZE + raw.length : currentPage * PAGE_SIZE + 1,
        );
      } else if (raw && typeof raw === "object") {
        setOrders(Array.isArray(raw.items) ? raw.items : []);
        setTotalCount(Number(raw.total_count) || 0);
      } else {
        setOrders([]);
        setTotalCount(0);
      }
    }

    setIsLoading(false);
  }, [search, statusFilters, fromDate, toDate, currentPage]);

  // summary는 filter/page와 무관하게 별도 fetch — 검색 키 입력마다 호출되지 않도록 분리.
  // 일괄 처리/상태 변경 후 명시적으로 호출하지 않고, orders 로드 직후에만 동기화.
  const loadSummary = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data, error } = await supabase.rpc("get_admin_order_summary");
    if (!error && data) {
      setSummary(data);
    }
  }, []);

  // 판매내역 엑셀 — 운영 구글시트(식스샵 양식)와 같은 열 구조, 현재 필터 그대로 반영
  const handleSalesExport = async () => {
    if (isSalesExporting) return;
    setIsSalesExporting(true);
    try {
      const { rowCount } = await downloadSalesSheetXlsx({
        search: search.trim() || undefined,
        statuses: statusFilters.length > 0 ? statusFilters : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      showToast(`판매내역 ${rowCount.toLocaleString("ko-KR")}행 엑셀을 다운로드했습니다.`, "success");
    } catch (exportError) {
      showToast(
        exportError instanceof Error ? exportError.message : "판매내역 엑셀 생성에 실패했습니다.",
        "error",
      );
    } finally {
      setIsSalesExporting(false);
    }
  };

  useEffect(() => {
    const timerId = setTimeout(() => {
      void loadOrders();
    }, 200);
    return () => clearTimeout(timerId);
  }, [loadOrders]);

  // summary는 최초 마운트와 일정 간격(30초)으로만 갱신 — 검색 키 입력 때마다 호출 X.
  useEffect(() => {
    void loadSummary();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSummary();
      }
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadSummary]);

  const handleStatusFilterToggle = (value) => {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
    setCurrentPage(1);
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
    // 결제 확인 알림은 handleConfirmPayment(입금확인)에서 발송 — 여기선 배송 계열만.
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      try {
        if (newStatus === "shipping" && trackingNumber) {
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

  // CJ 운영 서버는 콜드 컨테이너 첫 연결에서 자주 fetch failed/timeout이 난다(방화벽 워밍업).
  // 네트워크성 실패만 자동 재시도해 관통시킨다. 비즈니스 실패(주소없음 등)는 즉시 중단.
  const requestCjDelivery = async (orderId, { reprint }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showToast("인증이 만료되었습니다. 다시 로그인해 주세요.", "error");
      return null;
    }
    const MAX = 6;
    const transientRe = /fetch failed|timeout|ECONN|EAI_AGAIN|socket|reset|network|Failed to fetch|Load failed/i;
    const failLabel = reprint ? "송장 재출력에 실패했습니다." : "CJ 송장 발급에 실패했습니다.";
    for (let attempt = 1; attempt <= MAX; attempt += 1) {
      let resp = null;
      let result = {};
      let threw = false;
      try {
        resp = await fetch("/api/admin/cj-delivery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(reprint ? { orderId, reprint: true } : { orderId }),
        });
        result = await resp.json().catch(() => ({}));
      } catch {
        threw = true; // fetch 자체 실패(네트워크)
      }
      const row = result?.results?.[0];
      if (!threw && resp?.ok && row?.success) {
        return row;
      }
      const errMsg = String(row?.error || result?.error || (threw ? "fetch failed" : "요청 실패"));
      const isTransient = threw || transientRe.test(errMsg);
      if (attempt < MAX && isTransient) {
        showToast(`CJ 서버 연결 재시도 중… (${attempt}/${MAX - 1})`, "info");
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      showToast(errMsg && !isTransient ? errMsg : `${failLabel} (CJ 서버 응답 지연 — 잠시 후 다시 시도해 주세요.)`, "error");
      return null;
    }
    return null;
  };

  // CJ 송장 출력: cj-delivery(채번+주소정제+예약접수) 호출 → 성공 시 배송중 전환 + 표준 라벨 모달.
  const handleCjDelivery = async (orderId) => {
    setBusyOrderId(orderId);
    try {
      const row = await requestCjDelivery(orderId, { reprint: false });
      if (!row) return;

      showToast(`운송장번호 ${row.trackingNumber} 발급 완료 — 배송중으로 전환되었습니다.`, "success");

      // 배송 시작 알림톡 (백그라운드)
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        try {
          await notifyShippingStarted({ order, trackingNumber: row.trackingNumber });
        } catch {
          console.warn("배송 알림톡 발송 실패 (송장 발급은 정상)");
        }
      }

      setLabelData(row); // 라벨 모달 오픈
      setSelectedOrderId(null);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  };

  // 송장 재출력 — 이미 발급된 운송장(배송중/배송완료)의 라벨을 다시 연다.
  // 채번·예약접수는 하지 않고(중복 접수 방지) 기존 운송장번호 + 주소정제 재조회로 라벨만 렌더.
  const handleCjReprint = async (orderId) => {
    setBusyOrderId(orderId);
    try {
      const row = await requestCjDelivery(orderId, { reprint: true });
      if (!row) return;
      setLabelData(row); // 라벨 모달 오픈 (상태 전환·알림톡 없음)
      setSelectedOrderId(null);
    } finally {
      setBusyOrderId(null);
    }
  };

  // ── CJ 송장 일괄 출력 ────────────────────────────────────────────────
  // 서버(cj-delivery)는 orderIds 배열을 받아 1Day 토큰 하나로 순차 처리한다(최대 30건).
  // 프론트는 함수 실행시간·진행률 노출을 위해 CJ_BULK_CHUNK 단위로 끊어 호출한다.
  const CJ_BULK_CHUNK = 5;

  // 청크 1개 요청. 네트워크성 실패만 재시도 — 이미 채번된 주문은 서버가 skipped로 흘려보내므로
  // 재시도로 이중 접수되지 않는다.
  const requestCjDeliveryChunk = async (accessToken, ids, reprint) => {
    const MAX = 4;
    const transientRe = /fetch failed|timeout|ECONN|EAI_AGAIN|socket|reset|network|Failed to fetch|Load failed/i;
    for (let attempt = 1; attempt <= MAX; attempt += 1) {
      let errMsg = "";
      try {
        const resp = await fetch("/api/admin/cj-delivery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(reprint ? { orderIds: ids, reprint: true } : { orderIds: ids }),
        });
        const result = await resp.json().catch(() => ({}));
        if (resp.ok && Array.isArray(result.results)) {
          return result.results;
        }
        errMsg = String(result?.error || "요청 실패");
      } catch {
        errMsg = "fetch failed";
      }
      if (attempt < MAX && transientRe.test(errMsg)) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      // 청크 전체 실패 — 개별 주문 실패로 펼쳐 결과 요약에 그대로 노출
      return ids.map((orderId) => ({ orderId, success: false, error: errMsg }));
    }
    return ids.map((orderId) => ({ orderId, success: false, error: "CJ 서버 응답 없음" }));
  };

  const runCjDeliveryInChunks = async (accessToken, ids, { reprint = false, onProgress } = {}) => {
    const collected = [];
    for (let i = 0; i < ids.length; i += CJ_BULK_CHUNK) {
      const chunk = ids.slice(i, i + CJ_BULK_CHUNK);
      collected.push(...(await requestCjDeliveryChunk(accessToken, chunk, reprint)));
      onProgress?.(Math.min(i + CJ_BULK_CHUNK, ids.length));
    }
    return collected;
  };

  // 발급(reprint=false) / 재출력(reprint=true) 공용.
  // 재출력은 채번·예약접수·상태변경·알림톡이 전부 없어서 순수하게 라벨만 다시 뽑는다.
  const handleBulkCj = async ({ reprint }) => {
    const targets = reprint ? selectedCjReprintTargets : selectedCjTargets;
    if (targets.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showToast("인증이 만료되었습니다. 다시 로그인해 주세요.", "error");
      return;
    }

    setBulkCjConfirmOpen(false);
    setBulkProcessing(true);
    setBulkCjProgress({ done: 0, total: targets.length });

    const ids = targets.map((o) => o.id);
    const results = await runCjDeliveryInChunks(session.access_token, ids, {
      reprint,
      onProgress: (done) => setBulkCjProgress({ done, total: ids.length }),
    });

    // 이미 운송장이 있어 발급을 건너뛴 건(status: "skipped")은 라벨 라우팅 데이터가 없다.
    // 재출력 경로(채번·접수 없음)로 한 번 더 받아 라벨을 채운다. (재출력 모드는 애초에 불필요)
    const staleIds = reprint
      ? []
      : results.filter((r) => r.success && !r.addr).map((r) => r.orderId);
    if (staleIds.length > 0) {
      const hydrated = await runCjDeliveryInChunks(session.access_token, staleIds, { reprint: true });
      const byId = new Map(hydrated.map((r) => [r.orderId, r]));
      for (let i = 0; i < results.length; i += 1) {
        const patch = byId.get(results[i].orderId);
        if (patch?.success && patch.addr) {
          results[i] = { ...results[i], addr: patch.addr, sender: patch.sender, order: patch.order };
        }
      }
    }

    // 재출력은 주소정제가 실패해도(addr=null) 운송장번호·수취인 기준으로 라벨이 뜬다 —
    // 단건 '송장 재출력' 버튼과 같은 기준으로 맞춘다. 신규 발급은 분류코드가 필수라 addr 요구.
    const labels = results.filter((r) => r.success && r.order && (reprint || r.addr));
    const describe = (r) => ({
      orderId: r.orderId,
      orderNumber:
        r.orderNumber ?? targets.find((o) => o.id === r.orderId)?.order_number ?? `#${r.orderId}`,
      error: r.error || (reprint ? "재출력 실패" : "발급 실패"),
    });
    const failures = [
      ...results.filter((r) => !r.success).map(describe),
      // 발급은 됐는데 라벨 라우팅 데이터를 못 받은 건 — 조용히 빠지면 송장 없이 발송된다.
      ...(reprint
        ? []
        : results
            .filter((r) => r.success && !(r.addr && r.order))
            .map((r) => ({
              ...describe(r),
              error: `발급됨(${r.trackingNumber ?? "번호 확인 필요"}) — 라벨 데이터를 못 받았습니다. '송장 재출력'으로 개별 출력해 주세요.`,
            }))),
    ];

    if (!reprint) {
      // 배송 시작 알림톡 — 이번 호출로 운송장이 확정된 건.
      // skipped(응답 유실 후 재시도로 기존 채번을 되받은 경우)도 포함해야 알림이 누락되지 않는다.
      const notifiable = results.filter(
        (r) => r.success && r.trackingNumber && (r.status === "registered" || r.status === "skipped"),
      );
      await Promise.allSettled(
        notifiable.map((r) => {
          const order = targets.find((o) => o.id === r.orderId);
          return order
            ? notifyShippingStarted({ order, trackingNumber: r.trackingNumber })
            : Promise.resolve();
        }),
      );
    }

    setBulkProcessing(false);
    setBulkCjProgress(null);
    // 재출력은 주문에 아무 변화도 없다 → 선택·목록 그대로 두어 다시 뽑기 쉽게 한다.
    if (!reprint) {
      setSelectedIds(new Set());
      await loadOrders();
      await loadSummary();
    }

    if (failures.length === 0 && labels.length > 0) {
      setLabelBatch(labels);
      showToast(
        reprint
          ? `송장 ${labels.length}장을 다시 불러왔습니다 — 인쇄 창에서 한 번에 출력하세요.`
          : `송장 ${labels.length}건 발급 완료 — 인쇄 창에서 ${labels.length}장을 한 번에 출력하세요.`,
        "success",
      );
      return;
    }
    // 실패가 섞였으면 결과 요약을 먼저 보여주고, 거기서 인쇄로 넘어간다.
    setBulkCjResult({ labels, failures, total: targets.length, reprint });
  };

  // 자동 정산 생성(주문 확정 트리거)이 누락된 경우 운영자가 수동으로 재실행.
  // admin_run_order_settlement → create_settlements_for_order 래퍼. 멱등(중복 생성 안 됨).
  const handleRunSettlement = async (orderId) => {
    setBusyOrderId(orderId);
    const { error } = await supabase.rpc("admin_run_order_settlement", { p_order_id: orderId });
    setBusyOrderId(null);
    if (error) {
      showToast(error.message || "정산 생성에 실패했습니다.", "error");
      return;
    }
    showToast("정산 생성을 실행했습니다. (정산 관리 탭에서 확인)", "success");
    await loadOrders();
  };

  // 입금확인 모달 열기 — 빈 값으로 시작 (운영자가 통장 보고 직접 입력).
  // 과거에는 total_amount가 value로 미리 채워져 검증이 무력화되는 P0 사고 위험이 있었음.
  const openPaymentModal = (order) => {
    setPaymentModal(order);
    setPaymentInput("");
    setPaymentDepositorInput("");
  };

  const closePaymentModal = () => {
    setPaymentModal(null);
    setPaymentInput("");
    setPaymentDepositorInput("");
  };

  // 입금확인 처리: admin_confirm_payment RPC (금액 일치 + 동일 책 paid 재검증)
  const handleConfirmPayment = async () => {
    if (!paymentModal) return;
    const amountNum = Number(paymentInput.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast("입금 금액을 숫자로 입력해주세요.", "error");
      return;
    }

    setBusyOrderId(paymentModal.id);
    const { error } = await supabase.rpc("admin_confirm_payment", {
      p_order_id: paymentModal.id,
      p_paid_amount: amountNum,
    });
    setBusyOrderId(null);

    if (error) {
      showToast(error.message || "입금확인에 실패했습니다.", "error");
      return;
    }

    showToast(`주문 #${paymentModal.order_number} 입금이 확인되었습니다.`, "success");

    // 알림톡 발송 (실패해도 paid는 유지)
    try {
      await notifyOrderConfirmed({ order: paymentModal });
    } catch {
      console.warn("알림톡 발송 실패 (입금확인은 정상)");
    }

    closePaymentModal();
    setSelectedOrderId(null);
    await loadOrders();
  };

  // ── 주문 복원 (자동취소 되돌리기 — 2026-08-31) ─────────────────────────────
  // 입금이 실제로 들어왔는데 24시간 안에 입금확인을 못 눌러 자동취소된 무통장 주문용.
  // 복원은 '입금대기'까지만 되돌린다 — 결제 확정은 기존 입금확인 버튼(금액 검증 + 알림톡)이 맡는다.
  const openRestoreModal = async (order) => {
    setRestoreModal(order);
    setRestoreCheck({ loading: true, blocked: [], error: "" });

    const { data, error } = await supabase.rpc("admin_restore_cancelled_order", {
      p_order_id: order.id,
      p_validate_only: true,
    });

    if (error) {
      setRestoreCheck({ loading: false, blocked: [], error: error.message || "복원 가능 여부를 확인하지 못했습니다." });
      return;
    }

    setRestoreCheck({
      loading: false,
      blocked: data?.success ? [] : (data?.blocked ?? []),
      error: "",
    });
  };

  const closeRestoreModal = () => {
    setRestoreModal(null);
    setRestoreCheck(null);
  };

  const handleRestoreOrder = async () => {
    if (!restoreModal) return;

    setBusyOrderId(restoreModal.id);
    const { data, error } = await supabase.rpc("admin_restore_cancelled_order", {
      p_order_id: restoreModal.id,
    });
    setBusyOrderId(null);

    if (error) {
      showToast(error.message || "주문 복원에 실패했습니다.", "error");
      return;
    }

    // 검증 통과 후에도 그 사이 책이 팔릴 수 있어 실행 시점 blocked를 다시 반영한다.
    if (!data?.success) {
      setRestoreCheck({ loading: false, blocked: data?.blocked ?? [], error: "" });
      showToast("복원할 수 없는 주문입니다. 사유를 확인해 주세요.", "error");
      return;
    }

    showToast(
      `주문 ${restoreModal.order_number}을(를) 입금대기로 복원했습니다. 입금확인을 눌러 마무리하세요.`,
      "success",
    );
    closeRestoreModal();
    await loadOrders();
  };

  // ── 환불 (품목 선택 부분환불 — 2026-08-01) ────────────────────────────────
  // 서버리스가 [DB 검증 → PG (부분)취소 → DB 확정] 순서로 처리한다.
  // itemIds/refundAmount를 함께 넘기면 품목 단위 환불, 모든 품목 선택 시 전액 환불과 동일.
  // 반환 형태 { data, error }는 기존과 동일 — RECOVERY_REQUIRED_ACK 메시지도 그대로 전달돼
  // 호출부가 손실확인 모달로 분기한다.
  const submitRefund = async (orderId, { itemIds, refundAmount, reason, acknowledgeRecovery, restock }) => {
    setBusyOrderId(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { data: null, error: { message: "인증이 만료되었습니다. 다시 로그인해 주세요." } };
      }
      const resp = await fetch("/api/admin/payment-cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId, reason, acknowledgeRecovery, itemIds, refundAmount, restock }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || result.error) {
        return { data: null, error: { message: result.error || "환불 처리에 실패했습니다." } };
      }
      return { data: result.data ?? null, error: null };
    } catch (err) {
      return { data: null, error: { message: err?.message || "환불 처리 중 오류가 발생했습니다." } };
    } finally {
      setBusyOrderId(null);
    }
  };

  // 환불 성공 후 처리 (알림톡 + 토스트 + 목록 갱신)
  const finishRefund = async (data, order, reason) => {
    const cancelled = data?.cancelled_settlements ?? 0;
    const recovery = data?.recovery_required_settlements ?? 0;
    const held = Number(data?.held_books ?? 0);
    const amount = Number(data?.refund_amount ?? order.total_amount ?? 0);
    // 레거시 admin_refund_order 응답에는 order_fully_refunded가 없음 → 전액으로 간주
    const isFull = data?.order_fully_refunded !== false;
    // 환불 완료 알림톡 발송 — 이전엔 토스트만 떠서 사용자가 "왜 환불 안 됐냐" 문의 폭주.
    try {
      await notifyRefundCompleted({ order, reason, amount });
    } catch (notifyErr) {
      console.warn("환불 알림톡 발송 실패", notifyErr);
    }
    showToast(
      `${isFull ? "전액" : "부분"} 환불 완료 (${formatCurrency(amount)}). 정산 자동 처리: 취소 ${cancelled}건${
        recovery > 0 ? ` / 회사 손실 ${recovery}건 (정산 완료분 — 회사 부담)` : ""
      }.${held > 0 ? ` 재고 ${held}권 회수 대기(재입고 보류).` : ""}${
        isFull ? "" : " 주문은 기존 상태로 유지됩니다."
      } 구매자에게 환불 안내 알림톡 발송.`,
      "success",
    );
    closeRefundModal();
    setSelectedOrderId(null);
    await loadOrders();
  };

  // ── CJ 반품 수거 (2026-08-24) — 환불 주문 실물 회수: 구매자 배송지 → 수북 입고센터 ──
  const requestCjReturn = async (orderId, payload = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { result: null, error: "인증이 만료되었습니다. 다시 로그인해 주세요." };
    }
    try {
      const resp = await fetch("/api/admin/cj-return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId, ...payload }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || result.error) {
        return { result: null, error: result.error || "반품 수거 요청에 실패했습니다." };
      }
      return { result: result.result ?? null, error: null };
    } catch (err) {
      return { result: null, error: err?.message || "반품 수거 요청 중 오류가 발생했습니다." };
    }
  };

  // 반품 수거 접수 — 환불 모달 체크박스와 상세 패널 버튼 공용. 접수는 멱등(-RT 키)이라 재시도 안전.
  const registerReturnPickup = async (orderId) => {
    setReturnBusy(true);
    const { result, error } = await requestCjReturn(orderId, {});
    setReturnBusy(false);
    if (error || !result) {
      showToast(
        `CJ 반품 수거 접수 실패: ${error || "알 수 없는 오류"} — 주문 상세의 '반품 회수'에서 다시 시도할 수 있습니다.`,
        "error",
      );
      return false;
    }
    showToast(
      result.status === "skipped"
        ? `이미 접수된 반품 수거가 있습니다 (운송장 ${result.trackingNumber}).`
        : `CJ 반품 수거 접수 완료 — 운송장 ${result.trackingNumber}. 기사가 구매자 주소로 방문해 회수합니다.`,
      "success",
    );
    await loadOrders();
    return true;
  };

  // 반품 수거 접수 취소 — CJ 예약 취소가 거부되면(기사 스캔 등) 기록만 삭제 폴백을 확인받는다.
  const handleCancelReturnPickup = async (order) => {
    setReturnBusy(true);
    const { result, error } = await requestCjReturn(order.id, { action: "cancel" });
    setReturnBusy(false);
    if (error || !result) {
      setDestructiveModal({
        title: (
          <>
            <AlertTriangleIcon size={16} /> CJ 반품 예약 취소 거부
          </>
        ),
        description:
          `CJ측 예약 취소가 거부되었습니다.\n\n${error || "사유 미상"}\n\n` +
          "기사 배정/스캔이 이미 진행됐을 수 있습니다. CJ 지점에 확인한 뒤, " +
          "우리 DB의 반품 수거 기록만 삭제하려면 진행하세요. (CJ측 예약은 남습니다)",
        confirmLabel: "기록만 삭제",
        run: async () => {
          const forced = await requestCjReturn(order.id, { action: "cancel", force: true });
          if (forced.error || !forced.result) {
            showToast(forced.error || "반품 수거 기록 삭제에 실패했습니다.", "error");
            return;
          }
          showToast("반품 수거 기록을 삭제했습니다. (CJ측 예약은 별도 확인 필요)", "success");
          await loadOrders();
        },
      });
      return;
    }
    showToast(
      result.dbOnly
        ? "반품 수거 기록을 삭제했습니다. (CJ측 예약은 별도 확인 필요)"
        : "CJ 반품 수거 예약이 취소되었습니다.",
      "success",
    );
    await loadOrders();
  };

  // 회수 확인 — 보류 품목의 책을 재판매 복원(restock) 또는 폐기(discard)
  const handleReturnRecovery = async (order, outcome) => {
    setReturnBusy(true);
    const { data, error } = await supabase.rpc("admin_confirm_return_recovery", {
      p_order_id: order.id,
      p_outcome: outcome,
    });
    setReturnBusy(false);
    if (error) {
      showToast(error.message || "회수 확인 처리에 실패했습니다.", "error");
      return;
    }
    const updated = data?.updated_books ?? 0;
    // 이미 on_sale로 풀려 있던 책(과거 트리거 버그)은 복원 no-op이지만 결과는 재판매 상태와 동일
    const alreadyOnSale = data?.already_on_sale ?? 0;
    const skipped = Array.isArray(data?.skipped_book_ids) ? data.skipped_book_ids : [];
    showToast(
      outcome === "restock"
        ? `회수 완료 — ${updated + alreadyOnSale}권 재판매 복원(공개 전환).`
        : `회수 완료 — ${updated}권 폐기 처리.`,
      "success",
    );
    if (skipped.length > 0) {
      showToast(
        `책 #${skipped.join(", #")}은(는) 다른 주문에 잡혀 있거나 이미 판매/폐기 상태라 건드리지 않았습니다. 재고를 직접 확인해 주세요.`,
        "error",
      );
    }
    await loadOrders();
  };

  // 폐기는 비가역 — 확인 모달을 거친다 (재판매 복원은 숨김 버튼으로 되돌릴 수 있어 즉시 실행)
  const confirmReturnDiscard = (order) => {
    setDestructiveModal({
      title: (
        <>
          <AlertTriangleIcon size={16} /> 회수 도서 폐기
        </>
      ),
      description:
        "회수한 책을 폐기 처리합니다.\n\n" +
        "필기·훼손 등으로 재판매가 불가한 경우에만 진행하세요.\n" +
        "폐기 후에는 재판매로 되돌릴 수 없습니다.",
      confirmLabel: "폐기 처리",
      run: () => handleReturnRecovery(order, "discard"),
    });
  };

  // 환불 신청 반려(종결) — 보류 중이던 자동 구매확정·정산 송금이 재개된다 (2026-08-24)
  const confirmResolveRefundRequest = (order) => {
    setDestructiveModal({
      title: (
        <>
          <AlertTriangleIcon size={16} /> 환불 신청 반려
        </>
      ),
      description:
        "환불 신청을 반려(종결) 처리합니다.\n\n" +
        "보류 중이던 자동 구매확정과 셀러 정산 송금이 재개됩니다.\n" +
        "구매자와 협의가 끝난 경우에만 진행하세요.\n" +
        "(반려 알림은 자동 발송되지 않습니다 — 구매자에게 직접 안내해 주세요.)",
      confirmLabel: "반려 — 확정 재개",
      run: async () => {
        setReturnBusy(true);
        const { error } = await supabase.rpc("admin_resolve_refund_request", {
          p_order_id: order.id,
        });
        setReturnBusy(false);
        if (error) {
          showToast(error.message || "반려 처리에 실패했습니다.", "error");
          return;
        }
        showToast("환불 신청을 반려했습니다 — 자동 구매확정·정산 송금이 재개됩니다.", "success");
        await loadOrders();
        await loadSummary();
      },
    });
  };

  // 정산완료(송금됨) 품목을 환불하면 그 정산금은 회사 손실. 셀러 정산은 회수하지 않음.
  const confirmRecoveryLoss = (order, params, { registerReturn = false } = {}) => {
    setDestructiveModal({
      title: (
        <>
          <AlertTriangleIcon size={16} /> 회사 손실 확인
        </>
      ),
      description:
        "선택한 품목 중 셀러에게 정산금이 이미 송금 완료된 건이 있습니다.\n\n" +
        "환불을 진행하면 이미 지급된 정산금은 회사가 손실로 부담합니다.\n" +
        "(셀러 정산은 회수하지 않습니다.)\n\n" +
        "정말로 손실을 감수하고 환불하시겠습니까?",
      confirmPhrase: "손실 감수",
      confirmLabel: "손실 감수하고 환불",
      run: async () => {
        const { data, error } = await submitRefund(order.id, { ...params, acknowledgeRecovery: true });
        if (error) {
          showToast(error.message || "환불 처리에 실패했습니다.", "error");
          return;
        }
        await finishRefund(data, order, params.reason);
        if (registerReturn) {
          await registerReturnPickup(order.id);
        }
      },
    });
  };

  // 기본 환불액: 선택 품목 합 (미환불 품목을 전부 선택하면 잔액 전액 = 배송비 포함), 잔액 캡
  const computeRefundDefault = (order, checkedSet) => {
    const unrefunded = (order.items ?? []).filter((i) => !i.refunded_at);
    const remaining = Math.max(0, Number(order.total_amount ?? 0) - Number(order.refunded_amount ?? 0));
    const checkedItems = unrefunded.filter((i) => checkedSet.has(i.id));
    const itemsTotal = checkedItems.reduce((sum, i) => sum + Number(i.total_price ?? 0), 0);
    const isFinal = checkedItems.length === unrefunded.length && checkedItems.length > 0;
    return isFinal ? remaining : Math.min(itemsTotal, remaining);
  };

  // 환불 모달 열기 — 미환불 품목 전체 선택 + 기본 금액(잔액 전액)으로 시작
  const openRefundModal = (order) => {
    const unrefunded = (order.items ?? []).filter((i) => !i.refunded_at);
    if (unrefunded.length === 0) {
      showToast("환불 가능한 품목이 없습니다.", "error");
      return;
    }
    const allChecked = new Set(unrefunded.map((i) => i.id));
    setRefundModal(order);
    setRefundCheckedIds(allChecked);
    setRefundAmountTouched(false);
    setRefundReasonInput("");
    setRefundAmountInput(String(computeRefundDefault(order, allChecked)));
    // 실물이 이미 구매자에게 나간 주문은 회수 전 재판매 노출을 막는 게 기본값 (2026-08-24)
    setRefundHoldRestock(["shipping", "delivered", "confirmed"].includes(order.status));
    setRefundRegisterReturn(false);
  };

  const closeRefundModal = () => {
    setRefundModal(null);
    setRefundCheckedIds(new Set());
    setRefundAmountInput("");
    setRefundAmountTouched(false);
    setRefundReasonInput("");
    setRefundHoldRestock(false);
    setRefundRegisterReturn(false);
  };

  // 품목 체크 토글 — 금액을 직접 수정하기 전까지는 선택 변경에 맞춰 기본값을 따라간다
  const toggleRefundItem = (order, itemId) => {
    const next = new Set(refundCheckedIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setRefundCheckedIds(next);
    if (!refundAmountTouched) {
      setRefundAmountInput(String(computeRefundDefault(order, next)));
    }
  };

  // 환불 제출 — 클라이언트 검증 후 서버리스 호출 (서버가 RPC로 재검증)
  const handleRefundSubmit = async () => {
    const order = refundModal;
    if (!order) return;
    const itemIds = [...refundCheckedIds];
    const amount = Number(String(refundAmountInput).replace(/[^0-9]/g, ""));
    const reason = refundReasonInput.trim();
    const remaining = Math.max(0, Number(order.total_amount ?? 0) - Number(order.refunded_amount ?? 0));
    if (itemIds.length === 0) {
      showToast("환불할 품목을 선택해주세요.", "error");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      showToast("환불 금액을 확인해주세요.", "error");
      return;
    }
    if (amount > remaining) {
      showToast(`환불 금액이 남은 환불 가능 금액(${formatCurrency(remaining)})을 초과합니다.`, "error");
      return;
    }
    if (reason.length < 5) {
      showToast("환불 사유를 5자 이상 입력해주세요.", "error");
      return;
    }
    const params = {
      itemIds,
      refundAmount: amount,
      reason,
      acknowledgeRecovery: false,
      // 재입고 보류 체크 시 복원하지 않는다 — 회수 확인 후 '회수 완료' 버튼으로 복원/폐기
      restock: !refundHoldRestock,
    };
    const registerReturn = refundRegisterReturn;
    const { data, error } = await submitRefund(order.id, params);
    if (error) {
      if ((error.message || "").includes("RECOVERY_REQUIRED_ACK")) {
        // 이미 송금된 정산이 있음 — 손실 확인 모달로 전환 (환불 모달은 뒤에 유지)
        confirmRecoveryLoss(order, params, { registerReturn });
        return;
      }
      showToast(error.message || "환불 처리에 실패했습니다.", "error");
      return;
    }
    await finishRefund(data, order, reason);
    if (registerReturn) {
      await registerReturnPickup(order.id);
    }
  };

  // 환불 처리 진입 — 품목 선택 모달 (전액/부분 공용)
  const handleRefund = (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    openRefundModal(order);
  };

  // 송장 입력 모달 열기
  const openTrackingModal = (order) => {
    setTrackingModal(order);
    setTrackingCarrier(order.tracking_carrier || "CJ대한통운");
    setTrackingInput(order.tracking_number || "");
  };

  // ── CJ 실시간 배송조회 모달 ────────────────────────────────
  // 운송장 전체 스캔 이력을 /api/admin/cj-track-waybill(어드민 JWT 인증)로 조회.
  const fetchDeliveryTrace = useCallback(async (invcNo) => {
    setIsDeliveryTraceLoading(true);
    setDeliveryTraceError("");
    setDeliveryTraceData(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("로그인 세션이 만료되었습니다. 새로고침 후 다시 시도해 주세요.");
      }
      const resp = await fetch(
        `/api/admin/cj-track-waybill?invcNo=${encodeURIComponent(invcNo)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await resp.json().catch(() => null);
      if (!resp.ok || !body?.success) {
        throw new Error(body?.error || "배송 조회에 실패했습니다.");
      }
      setDeliveryTraceData(body);
    } catch (err) {
      setDeliveryTraceError(err?.message || "배송 조회에 실패했습니다.");
    } finally {
      setIsDeliveryTraceLoading(false);
    }
  }, []);

  const openDeliveryTrace = (order) => {
    const invcNo = String(order.tracking_number || "").trim();
    if (!invcNo) return;
    setDeliveryTrace({ invcNo, orderNumber: order.order_number });
    void fetchDeliveryTrace(invcNo);
  };

  // 반품 수거 운송장 추적 — 배송조회 모달 재사용 (2026-08-24)
  const openReturnTrace = (order) => {
    const invcNo = String(order.return_tracking_number || "").trim();
    if (!invcNo) return;
    setDeliveryTrace({ invcNo, orderNumber: `${order.order_number} (반품 수거)` });
    void fetchDeliveryTrace(invcNo);
  };

  const closeDeliveryTrace = () => {
    setDeliveryTrace(null);
    setDeliveryTraceData(null);
    setDeliveryTraceError("");
  };

  const closeTrackingModal = () => {
    setTrackingModal(null);
    setTrackingInput("");
    setTrackingCarrier("CJ대한통운");
  };

  const handleTrackingSubmit = async () => {
    if (!trackingModal || !trackingInput.trim()) return;
    // 단일 입력에도 형식 검증 — 이전엔 CSV 일괄에만 있었고 모달은 무검증 통과해
    // 잘못된 운송장이 배송 시작 알림톡과 함께 발송되는 P0 사고 위험이 있었음.
    if (!validateTrackingNumber(trackingCarrier, trackingInput.trim())) {
      showToast(`운송장 형식이 맞지 않습니다 (${trackingCarrier}). 다시 확인해주세요.`, "error");
      return;
    }
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

  // 검증 통과 행만 처리. 알림톡 발송 전 모달로 한 번 더 확인.
  const handleCsvBulkProcess = () => {
    if (csvRows.length === 0) return;
    const validRows = csvRows.filter((r) => r.isValid !== false);
    if (validRows.length === 0) {
      showToast("검증 통과한 송장이 없습니다. 형식을 확인해주세요.", "error");
      return;
    }

    setDestructiveModal({
      title: `송장 일괄 발송 — ${validRows.length}건`,
      description:
        `검증 통과한 ${validRows.length}건의 송장을 일괄 처리합니다.\n` +
        `각 주문 구매자에게 배송 시작 알림톡이 발송됩니다.\n\n` +
        (csvRows.length - validRows.length > 0
          ? `검증 실패 ${csvRows.length - validRows.length}건은 자동 skip됩니다.\n`
          : "") +
        `진행하시겠습니까?`,
      confirmPhrase: "발송",
      reasonRequired: false,
      confirmLabel: `${validRows.length}건 처리`,
      run: async () => {
        await performCsvBulkProcess(validRows);
      },
    });
  };

  const performCsvBulkProcess = async (validRows) => {
    setCsvProcessing(true);

    const results = [];
    // 검증 실패 행도 결과에 미리 포함 (스킵 사유)
    for (const row of csvRows) {
      if (row.isValid === false) {
        results.push({ ...row, success: false, message: row.validationError || "검증 실패" });
      }
    }

    for (const row of validRows) {
      // 현재 페이지 메모리에 없는 주문도 처리 가능하도록 supabase에서 직접 조회
      let order = orders.find((o) => o.order_number === row.orderNumber);
      if (!order) {
        const { data: fetched } = await supabase
          .from("orders")
          .select("id, order_number, status, shipping_recipient_name, shipping_recipient_phone, user_id, total_amount")
          .eq("order_number", row.orderNumber)
          .maybeSingle();
        order = fetched ?? null;
      }
      if (!order) {
        results.push({ ...row, success: false, message: "주문번호 없음 (전체 검색에서도 못 찾음)" });
        continue;
      }
      if (order.status !== "paid" && order.status !== "preparing") {
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

  // 송장 입력 대기 = 상품 준비 중 (+ 폐지 전 레거시 paid)
  const awaitingTrackingCount = useMemo(
    () => orders.filter((o) => o.status === "preparing" || o.status === "paid").length,
    [orders],
  );

  // 주문 상세 — 클릭한 주문 행 바로 아래에서 펼쳐진다.
  // (예전엔 표 아래 별도 카드로 떠서 상세를 볼 때마다 페이지 맨 밑까지 스크롤해야 했다.)
  const renderOrderDetail = (selectedOrder) => (
    <div className="space-y-4 border-l-4 border-blue-500 bg-white px-5 py-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-950">
            주문 {selectedOrder.order_number}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {selectedOrder.is_guest ? (
              <>
                {formatDate(selectedOrder.created_at)} · {selectedOrder.shipping_recipient_name}{" "}
                <span className="inline-flex items-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 align-middle">
                  비회원
                </span>
              </>
            ) : (
              <>
                {formatDate(selectedOrder.created_at)} · {selectedOrder.buyer_name} ({selectedOrder.buyer_email})
                {" "}
                <Link
                  className="font-bold text-brand underline underline-offset-2"
                  to={`/admin/members?q=${encodeURIComponent(selectedOrder.buyer_email || selectedOrder.buyer_name || "")}`}
                >
                  회원 조회
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={selectedOrder.status} type="order" />
      </div>

      {/* 주문 상품 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">주문 상품</h4>
        <div className="space-y-2">
          {selectedOrder.items?.map((item) => (
            <div
              className={`flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2${item.refunded_at ? " opacity-70" : ""}`}
              key={item.id}
            >
              <div>
                <span className="text-sm font-semibold">{item.title}</span>
                {item.option_label && (
                  <span className="ml-2 text-xs text-slate-400">{item.option_label}</span>
                )}
                {item.condition_grade && (
                  <span className="ml-2 text-xs text-slate-400">{item.condition_grade}</span>
                )}
                <span className="ml-2 text-xs text-slate-400">×{item.quantity}</span>
                {/* 품목별 환불 상태 (2026-08-01 부분환불) */}
                {item.refunded_at && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    환불됨{item.refund_amount != null ? ` ${formatCurrency(item.refund_amount)}` : ""}
                  </span>
                )}
                {/* 피킹 정보 — 위치로 가서 일련번호로 실물 확인 (2026-07-18) */}
                {item.book_location || item.book_serial_number != null ? (
                  <span className="ml-2 inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                    {item.book_location ?? "위치 미지정"}
                    {item.book_serial_number != null ? ` · No.${item.book_serial_number}` : ""}
                  </span>
                ) : (
                  <span className="ml-2 inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                    위치 미지정
                  </span>
                )}
              </div>
              <span className={`text-sm font-bold${item.refunded_at ? " text-slate-400 line-through" : ""}`}>
                {formatCurrency(item.total_price)}
              </span>
            </div>
          ))}
        </div>
        {(() => {
          // 쿠폰 할인액 — coupon_discount_amount가 쿠폰 전용 필드, discount_amount는 총 할인(현재 동일 값)
          const couponDiscount = Number(
            selectedOrder.coupon_discount_amount ?? selectedOrder.discount_amount ?? 0,
          );
          // 포인트 사용액 (2026-09-02) — total_amount에 이미 차감 반영
          const pointsUsed = Number(selectedOrder.points_used ?? 0);
          const hasDiscount = couponDiscount > 0 || pointsUsed > 0;
          return (
            <div className="mt-2 pt-2 border-t border-slate-100 text-sm space-y-1">
              <div className="flex justify-between">
                <span>상품 {formatCurrency(selectedOrder.subtotal)} + 배송비 {selectedOrder.shipping_fee === 0 ? "무료" : formatCurrency(selectedOrder.shipping_fee)}</span>
                {hasDiscount ? (
                  <span className="font-semibold text-rose-600">
                    {couponDiscount > 0 ? `쿠폰 −${formatCurrency(couponDiscount)}` : ""}
                    {couponDiscount > 0 && pointsUsed > 0 ? " · " : ""}
                    {pointsUsed > 0 ? `포인트 −${formatCurrency(pointsUsed)}` : ""}
                  </span>
                ) : (
                  <span className="font-black text-lg">{formatCurrency(selectedOrder.total_amount)}</span>
                )}
              </div>
              {hasDiscount && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">할인 적용 후 결제 금액</span>
                  <span className="font-black text-lg">{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
              )}
              {/* 환불 누계 (2026-08-01 부분환불) — 부분환불 진행 중이면 잔액도 표시 */}
              {Number(selectedOrder.refunded_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-rose-600">
                    환불 완료 {selectedOrder.status === "refunded" ? "(전액)" : "(부분)"}
                  </span>
                  <span className="font-bold text-rose-600">
                    −{formatCurrency(selectedOrder.refunded_amount)}
                  </span>
                </div>
              )}
              {Number(selectedOrder.refunded_amount ?? 0) > 0 && selectedOrder.status !== "refunded" && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">환불 후 결제 유지액</span>
                  <span className="font-bold">
                    {formatCurrency(
                      Number(selectedOrder.total_amount ?? 0) - Number(selectedOrder.refunded_amount ?? 0),
                    )}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* 결제 정보 — paid_at은 2026-07-13부터 트리거 기록(무통장 입금확인·PG 승인 공통).
          그 이전 무통장 주문은 시각이 없어 결제수단만 표시된다. */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">결제 정보</h4>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm space-y-1">
          <p className="font-semibold">
            {PAYMENT_METHOD_LABEL[selectedOrder.payment_method] ?? selectedOrder.payment_method ?? "-"}
          </p>
          {(() => {
            const paidAt = selectedOrder.paid_at ?? selectedOrder.pg_approved_at ?? null;
            if (!paidAt) {
              return selectedOrder.status === "pending" ? (
                <p className="text-xs text-slate-400">입금 확인 전</p>
              ) : null;
            }
            return (
              <p className="text-slate-600">
                {selectedOrder.payment_method === "bank_transfer" ? "입금확인" : "결제승인"} ·{" "}
                {formatDateTime(paidAt)}
              </p>
            );
          })()}
          {/* 복원 이력 — 자동취소 후 되살린 주문임을 알려 "왜 옛날 주문이 입금대기지?" 혼선을 막는다 */}
          {selectedOrder.restored_at && (
            <p className="text-xs text-amber-700">
              자동취소 후 복원됨 · {formatDateTime(selectedOrder.restored_at)}
            </p>
          )}
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
          <p className="text-sm flex items-center gap-2">
            <span>
              {selectedOrder.tracking_carrier ?? "CJ대한통운"} · {selectedOrder.tracking_number}
            </span>
            <button
              className="text-xs font-semibold text-emerald-700 hover:underline"
              onClick={() => openDeliveryTrace(selectedOrder)}
              type="button"
            >
              배송조회
            </button>
          </p>
        </div>
      )}

      {/* 환불 신청 사유 — 미해소 신청은 강조(자동확정·송금 보류), 해소(처리/반려)되면 이력만 */}
      {selectedOrder.refund_requested_at && selectedOrder.status !== "refunded" && (
        selectedOrder.refund_request_resolved_at ? (
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                환불 신청 이력 — {Number(selectedOrder.refunded_amount ?? 0) > 0 ? "부분환불 처리됨" : "반려됨"}
              </h4>
              <span className="text-xs text-slate-500">
                {formatDate(selectedOrder.refund_requested_at)} 신청 · {formatDate(selectedOrder.refund_request_resolved_at)} 해소
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {selectedOrder.refund_request_reason || "사유 미기재"}
            </p>
            <p className="mt-2 text-xs text-slate-500">자동 구매확정·정산 송금이 재개된 상태입니다.</p>
          </div>
        ) : (
        <div className="rounded-lg border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider">
              환불 신청 접수
            </h4>
            <span className="text-xs text-rose-600">
              {formatDate(selectedOrder.refund_requested_at)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
            {selectedOrder.refund_request_reason || "사유 미기재"}
          </p>
          {/* 무통장입금 환불계좌 — 주문 시 구매자가 입력 (2026-07-12부터 필수 수집) */}
          {selectedOrder.refund_bank_name ? (
            <p className="mt-2 text-sm font-semibold text-slate-800">
              환불 계좌: {selectedOrder.refund_bank_name} {selectedOrder.refund_account_number}{" "}
              (예금주 {selectedOrder.refund_account_holder})
            </p>
          ) : (
            selectedOrder.payment_method === "bank_transfer" && (
              <p className="mt-2 text-xs text-rose-600">
                환불 계좌 미입력 주문 — 구매자에게 입금자 본인 명의 계좌를 확인해 주세요.
              </p>
            )
          )}
          <p className="mt-2 text-xs text-rose-600">
            처리 전까지 자동 구매확정·정산 송금이 보류됩니다 — 아래 "환불처리"로 진행하거나, 협의 종결 시 신청 반려로 재개하세요.
          </p>
          <button
            className="btn-ghost !w-auto !px-3 !py-1.5 mt-2 text-xs"
            disabled={returnBusy}
            onClick={() => confirmResolveRefundRequest(selectedOrder)}
            type="button"
          >
            신청 반려 — 자동확정 재개
          </button>
        </div>
        )
      )}

      {/* 환불 완료 내역 — 이미 처리된 주문이면 결과 표시 */}
      {selectedOrder.status === "refunded" && (
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              환불 완료
            </h4>
            <span className="text-xs text-slate-500">
              {selectedOrder.refunded_at ? formatDate(selectedOrder.refunded_at) : ""}
              {Number(selectedOrder.refunded_amount ?? 0) > 0
                ? ` · ${formatCurrency(selectedOrder.refunded_amount)}`
                : ""}
            </span>
          </div>
          {selectedOrder.refund_request_reason && (
            <p className="mt-2 text-sm text-slate-700">
              <span className="text-xs font-semibold text-slate-500">구매자 사유: </span>
              {selectedOrder.refund_request_reason}
            </p>
          )}
          {selectedOrder.refund_reason && (
            <p className="mt-1 text-sm text-slate-700">
              <span className="text-xs font-semibold text-slate-500">처리 메모: </span>
              {selectedOrder.refund_reason}
            </p>
          )}
        </div>
      )}

      {/* 반품 회수 (2026-08-24) — 회수 대기 재고·CJ 반품 수거 접수 현황. 실물이 구매자에게
          있(었)을 상태에서만 노출. 회수 대기 = 환불했지만 재입고 보류된 품목. */}
      {(() => {
        const heldItems = (selectedOrder.items ?? []).filter((i) => i.restock_held_at);
        const hasReturnReg = Boolean(selectedOrder.return_tracking_number);
        const canRegister =
          ["shipping", "delivered", "confirmed", "refunded"].includes(selectedOrder.status)
          || Number(selectedOrder.refunded_amount ?? 0) > 0;
        if (heldItems.length === 0 && !hasReturnReg && !selectedOrder.return_recovered_at && !canRegister) {
          return null;
        }
        return (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">반품 회수</h4>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm space-y-2">
              {heldItems.length > 0 && (
                <p className="font-semibold text-amber-700">
                  회수 대기 {heldItems.length}권 — 재입고 보류 중 (실물 확인 후 아래 버튼으로 처리)
                </p>
              )}
              {hasReturnReg ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span>CJ 반품 수거 · {selectedOrder.return_tracking_number}</span>
                  <button
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                    onClick={() => openReturnTrace(selectedOrder)}
                    type="button"
                  >
                    배송조회
                  </button>
                  {selectedOrder.return_registered_at && (
                    <span className="text-xs text-slate-400">
                      {formatDate(selectedOrder.return_registered_at)} 접수
                    </span>
                  )}
                </p>
              ) : selectedOrder.return_recovered_at && heldItems.length === 0 ? (
                <p className="text-xs text-slate-500">
                  회수 완료 · {formatDate(selectedOrder.return_recovered_at)}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  CJ 반품 수거 접수 시 기사가 구매자 주소로 방문해 회수합니다. (구매자가 직접 발송하는 경우 접수 불필요)
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!hasReturnReg && canRegister && (
                  <button
                    className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                    disabled={returnBusy}
                    onClick={() => registerReturnPickup(selectedOrder.id)}
                    type="button"
                  >
                    {returnBusy ? <BusyText>처리 중...</BusyText> : "CJ 반품 수거 접수"}
                  </button>
                )}
                {hasReturnReg && (
                  <button
                    className="btn-ghost !w-auto !px-3 !py-1.5 text-xs"
                    disabled={returnBusy}
                    onClick={() => handleCancelReturnPickup(selectedOrder)}
                    type="button"
                  >
                    수거 접수 취소
                  </button>
                )}
                {heldItems.length > 0 && (
                  <>
                    <button
                      className="btn-primary !w-auto !px-3 !py-1.5 text-xs"
                      disabled={returnBusy}
                      onClick={() => handleReturnRecovery(selectedOrder, "restock")}
                      type="button"
                    >
                      회수 완료 — 재판매 복원
                    </button>
                    <button
                      className="btn-danger !w-auto !px-3 !py-1.5 text-xs"
                      disabled={returnBusy}
                      onClick={() => confirmReturnDiscard(selectedOrder)}
                      type="button"
                    >
                      회수 완료 — 폐기
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 상태 변경 액션 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">상태 변경</h4>
        <div className="flex flex-wrap gap-2 items-end">
          {getOrderActions(selectedOrder).map((action) => {
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

            if (action.action === "refund") {
              return (
                <button
                  className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                  disabled={busyOrderId === selectedOrder.id}
                  key="refund"
                  onClick={() => handleRefund(selectedOrder.id)}
                  type="button"
                >
                  {busyOrderId === selectedOrder.id ? <BusyText>처리 중...</BusyText> : action.label}
                </button>
              );
            }

            if (action.action === "confirm_payment") {
              return (
                <button
                  className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                  disabled={busyOrderId === selectedOrder.id}
                  key="confirm_payment"
                  onClick={() => openPaymentModal(selectedOrder)}
                  type="button"
                >
                  {action.label}
                </button>
              );
            }

            if (action.action === "restore") {
              return (
                <button
                  className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                  disabled={busyOrderId === selectedOrder.id}
                  key="restore"
                  onClick={() => openRestoreModal(selectedOrder)}
                  type="button"
                >
                  {action.label}
                </button>
              );
            }

            if (action.action === "cj_delivery") {
              return (
                <button
                  className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                  disabled={busyOrderId === selectedOrder.id}
                  key="cj_delivery"
                  onClick={() => handleCjDelivery(selectedOrder.id)}
                  type="button"
                >
                  {busyOrderId === selectedOrder.id ? <BusyText>발급 중...</BusyText> : action.label}
                </button>
              );
            }

            if (action.action === "cj_reprint") {
              return (
                <button
                  className={`${action.style} !w-auto !px-4 !py-2 text-sm`}
                  disabled={busyOrderId === selectedOrder.id}
                  key="cj_reprint"
                  onClick={() => handleCjReprint(selectedOrder.id)}
                  type="button"
                >
                  {busyOrderId === selectedOrder.id ? <BusyText>불러오는 중...</BusyText> : action.label}
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
                {busyOrderId === selectedOrder.id ? <BusyText>처리 중...</BusyText> : action.label}
              </button>
            );
          })}

          {selectedOrder.status === "confirmed" ? (
            <button
              className="btn-secondary !w-auto !px-4 !py-2 text-sm"
              disabled={busyOrderId === selectedOrder.id}
              onClick={() => handleRunSettlement(selectedOrder.id)}
              type="button"
            >
              {busyOrderId === selectedOrder.id ? <BusyText>처리 중...</BusyText> : "정산 생성(수동)"}
            </button>
          ) : null}

          {getOrderActions(selectedOrder).length === 0 &&
            selectedOrder.status !== "confirmed" && (
              <p className="text-xs text-slate-400">현재 상태에서 가능한 작업이 없습니다.</p>
            )}
        </div>
      </div>
    </div>
  );

  const summaryCards = summary
    ? [
        { label: "전체 주문", value: summary.total_count ?? 0 },
        { label: "입금대기", value: summary.pending_count ?? 0, hint: "확인 필요" },
        // paid 단계 폐지 — 결제 확인 주문은 preparing으로 직행. (paid_count는 레거시 잔여분)
        { label: "준비 중/배송중", value: (summary.preparing_count ?? 0) + (summary.paid_count ?? 0) + (summary.shipping_count ?? 0), hint: "처리 필요" },
        { label: "구매확정", value: summary.confirmed_count ?? 0 },
        // 구매자가 환불 신청한 주문 — refunded 처리 전까지 큐에 남음. 0이면 표시 생략.
        ...((summary.refund_pending_count ?? 0) > 0
          ? [{ label: "환불 신청", value: summary.refund_pending_count, hint: "처리 필요", tone: "danger" }]
          : []),
      ]
    : [];

  return (
    <AdminShell
      activeModule="orders"
      description="주문 목록, 입금 확인, 송장 입력, 배송 상태 관리"
      summaryCards={summaryCards}
      title="주문 관리"
    >
      {/* 필터 영역 — 운영툴이라 label·preset 명시 */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[220px]">
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">검색어</span>
            <input
              className="input-base !w-full"
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="주문번호, 구매자, 수령인"
              type="search"
              value={search}
            />
          </label>
          <label>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">시작일</span>
            <input
              className="input-base !w-auto"
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={fromDate}
            />
          </label>
          <span className="pb-3 text-slate-400 text-sm">~</span>
          <label>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">종료일</span>
            <input
              className="input-base !w-auto"
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={toDate}
            />
          </label>
          {/* 빠른 기간 preset — 운영자 반복 작업 줄이기 위해 */}
          <div className="flex flex-wrap gap-1 pb-1">
            {[
              { label: "오늘", days: 0 },
              { label: "7일", days: 7 },
              { label: "30일", days: 30 },
              { label: "전체", days: null },
            ].map((preset) => (
              <button
                className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:border-slate-400"
                key={preset.label}
                onClick={() => {
                  if (preset.days === null) {
                    setFromDate("");
                    setToDate("");
                  } else {
                    const today = new Date();
                    const from = new Date(today.getTime() - preset.days * 86400000);
                    setFromDate(from.toISOString().slice(0, 10));
                    setToDate(today.toISOString().slice(0, 10));
                  }
                  setCurrentPage(1);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* 판매내역 엑셀 — 운영 구글시트 "판매내역" 탭과 동일 열 구조 (현재 필터 반영) */}
          <div className="ml-auto pb-1">
            <button
              className="btn-secondary !w-auto !px-4 !py-2 text-sm"
              disabled={isSalesExporting}
              onClick={handleSalesExport}
              title="현재 검색·상태·기간 필터 그대로, 운영 구글시트(판매내역 탭) 양식으로 다운로드"
              type="button"
            >
              {isSalesExporting ? <BusyText>생성 중...</BusyText> : "판매내역 엑셀"}
            </button>
          </div>
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
              onClick={() => {
                setStatusFilters([]);
                setCurrentPage(1);
              }}
              type="button"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 일괄 액션 바 — 선택 시에만 표시 */}
      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-30 -mx-1 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-sm flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-amber-900">
            {selectedIds.size}건 선택됨
          </span>
          <button
            className="text-xs text-amber-700 underline hover:text-amber-900"
            onClick={() => setSelectedIds(new Set())}
            type="button"
          >
            선택 해제
          </button>
          <div className="flex-1" />
          {selectedIds.size
            > Math.max(
              selectedBulkConfirmTargets.length,
              selectedCjTargets.length,
              selectedCjReprintTargets.length,
            ) && (
            <span className="text-xs text-amber-700">
              입금확인=무통장·입금대기 / 송장출력=상품 준비 중 / 재출력=운송장 있는 주문만 대상입니다
            </span>
          )}
          {selectedBulkConfirmTargets.length > 0 && (
            <button
              className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={bulkProcessing}
              onClick={() => setBulkConfirmOpen(true)}
              type="button"
            >
              {bulkProcessing ? <BusyText>처리 중...</BusyText> : `일괄 입금확인 (${selectedBulkConfirmTargets.length}건)`}
            </button>
          )}
          {/* CJ 송장 일괄 출력 — 발급 후 한 번의 인쇄 작업으로 N장 (배송 건수 늘어난 뒤 핵심 동선) */}
          {selectedCjTargets.length > 0 && (
            <button
              className="text-xs font-semibold text-white bg-slate-900 hover:bg-slate-700 rounded-md px-3 py-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={bulkProcessing}
              onClick={() => setBulkCjConfirmOpen(true)}
              type="button"
            >
              {bulkCjProgress
                ? <BusyText>{`송장 발급 중... (${bulkCjProgress.done}/${bulkCjProgress.total})`}</BusyText>
                : `CJ 송장 일괄 출력 (${selectedCjTargets.length}건)`}
            </button>
          )}
          {/* 재출력 — 채번·접수·상태변경·알림톡 없이 라벨만 다시 뽑으므로 확인 단계 없이 바로 실행 */}
          {selectedCjReprintTargets.length > 0 && (
            <button
              className="text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:border-slate-500 rounded-md px-3 py-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={bulkProcessing}
              onClick={() => handleBulkCj({ reprint: true })}
              type="button"
            >
              {bulkCjProgress
                ? <BusyText>{`불러오는 중... (${bulkCjProgress.done}/${bulkCjProgress.total})`}</BusyText>
                : `송장 일괄 재출력 (${selectedCjReprintTargets.length}건)`}
            </button>
          )}
          {selectedBulkConfirmTargets.length === 0
            && selectedCjTargets.length === 0
            && selectedCjReprintTargets.length === 0 && (
            <span className="text-xs text-amber-700">
              선택한 주문에 가능한 일괄 작업이 없습니다
            </span>
          )}
        </div>
      ) : null}

      {/* 주문 목록 */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400"><InlineLoading /></div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            주문이 없습니다.
            <p className="mt-1 text-xs text-slate-400">
              권한 문제가 의심되면 시스템 관리자에게 문의해 주세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-2 py-3 w-10">
                    <input
                      aria-label="현재 페이지 전체 선택"
                      checked={orders.length > 0 && selectedIds.size === orders.length}
                      onChange={toggleSelectAll}
                      type="checkbox"
                    />
                  </th>
                  <th className="px-3 py-3">주문번호</th>
                  <th className="px-3 py-3">구매자</th>
                  <th className="px-3 py-3">상품</th>
                  <th className="px-3 py-3 text-right">금액</th>
                  {/* 결제수단은 상태 아래 줄로 합쳤다 — 열을 하나 줄여야 관리(상세)가 안 밀린다 */}
                  <th className="px-3 py-3">상태/결제</th>
                  <th className="px-3 py-3">주문일</th>
                  <th className="px-3 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  // 구매자가 환불 신청해 둔 상태(아직 미처리·미반려). 행 자체를 빨갛게 강조.
                  const hasPendingRefundRequest =
                    Boolean(order.refund_requested_at)
                    && !order.refund_request_resolved_at
                    && order.status !== "refunded";
                  return (
                  <Fragment key={order.id}>
                  <tr
                    className={`border-b border-slate-50 transition ${
                      selectedOrderId === order.id
                        ? "bg-blue-50"
                        : hasPendingRefundRequest
                          ? "bg-rose-50"
                          : selectedIds.has(order.id)
                            ? "bg-amber-50"
                            : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-2 py-3">
                      <input
                        aria-label={`${order.order_number} 선택`}
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelectId(order.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {order.order_number}
                        {hasPendingRefundRequest && (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            환불신청
                          </span>
                        )}
                        {/* 일부 품목만 환불된 주문 — 주문 상태는 유지되므로 별도 칩으로 표시 */}
                        {Number(order.refunded_amount ?? 0) > 0 && order.status !== "refunded" && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            부분환불
                          </span>
                        )}
                        {/* 환불 후 실물 미회수(재입고 보류) 품목이 남은 주문 (2026-08-24 반품 수거) */}
                        {(order.items ?? []).some((i) => i.restock_held_at) && (
                          <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                            회수 대기
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-[170px]">
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        {/* 비회원 주문: profiles가 없어 수령인 이름으로 표시 (2026-08-03) */}
                        <span className="truncate">
                          {order.is_guest ? order.shipping_recipient_name || "—" : order.buyer_name || "—"}
                        </span>
                        {order.is_guest && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            비회원
                          </span>
                        )}
                      </div>
                      {/* 긴 이메일이 열 폭을 밀어내지 않게 잘라 보여준다 (전체 값은 상세에서 확인) */}
                      <div className="truncate text-xs text-slate-400">
                        {order.is_guest ? order.shipping_recipient_phone || "" : order.buyer_email || ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <div className="text-sm truncate">
                        {order.items?.[0]?.title ?? "—"}
                        {order.item_count > 1 && (
                          <span className="text-slate-400"> 외 {order.item_count - 1}건</span>
                        )}
                      </div>
                      {(() => {
                        // 피킹 힌트 — 아이템들의 창고 위치를 중복 제거해 표시
                        const locs = [
                          ...new Set((order.items ?? []).map((i) => i.book_location).filter(Boolean)),
                        ];
                        return locs.length > 0 ? (
                          <div className="mt-0.5 truncate font-mono text-[11px] font-bold text-indigo-600">
                            위치 {locs.join(" · ")}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right font-bold whitespace-nowrap">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <StatusBadge status={order.status} type="order" />
                      <div className="mt-1 text-[11px] text-slate-400">
                        {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatCompactDate(order.created_at)}
                    </td>
                    {/* 액션은 한 줄, 운송장번호는 그 아래 줄 — 한 줄에 다 넣으면 표가 가로로 넘쳐
                        '상세'가 화면 밖으로 밀린다 */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {(order.status === "preparing" || order.status === "paid") && (
                          <button
                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-2.5 py-1"
                            onClick={() => openTrackingModal(order)}
                            type="button"
                          >
                            송장입력
                          </button>
                        )}
                        {order.tracking_number &&
                          ["shipping", "delivered", "confirmed"].includes(order.status) && (
                          <button
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                            onClick={() => openDeliveryTrace(order)}
                            title="CJ 실시간 배송 추적"
                            type="button"
                          >
                            배송조회
                          </button>
                        )}
                        <button
                          className="text-xs font-semibold text-blue-600 hover:underline"
                          onClick={() => setSelectedOrderId(selectedOrderId === order.id ? null : order.id)}
                          type="button"
                        >
                          {selectedOrderId === order.id ? "닫기" : "상세"}
                        </button>
                      </div>
                      {order.tracking_number &&
                        ["shipping", "delivered", "confirmed"].includes(order.status) && (
                        <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {order.tracking_number}
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* 상세 — 행 바로 아래에 붙여서 펼친다 */}
                  {selectedOrderId === order.id && (
                    <tr className="border-b-2 border-blue-100 bg-blue-50/40">
                      <td className="p-0" colSpan={8}>
                        {renderOrderDetail(order)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
        />
      </div>

      {/* 상품 준비 중 건 CSV 일괄 송장 입력 안내 */}
      {!isLoading && awaitingTrackingCount > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            상품 준비 중 <strong className="text-blue-600">{awaitingTrackingCount}건</strong> 송장 입력 대기 중
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

      {/* 주문 복원 모달 — 자동취소된 미결제 주문을 입금대기로 되돌린다 (2026-08-31) */}
      <AdminDialog
        busy={busyOrderId === restoreModal?.id}
        onClose={closeRestoreModal}
        open={Boolean(restoreModal)}
        size="md"
        title={restoreModal ? `주문 복원 — ${restoreModal.order_number}` : ""}
      >
        {restoreModal && (
          <div className="p-6 space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm space-y-1">
              <p className="font-semibold">
                {restoreModal.shipping_recipient_name} · {formatCurrency(restoreModal.total_amount)} ·{" "}
                {restoreModal.item_count}권
              </p>
              <p className="text-xs text-slate-500">주문일 {formatDateTime(restoreModal.created_at)}</p>
            </div>

            {restoreCheck?.loading && <InlineLoading label="복원 가능 여부 확인 중..." />}

            {restoreCheck?.error && (
              <p className="text-sm text-rose-600">{restoreCheck.error}</p>
            )}

            {!restoreCheck?.loading && restoreCheck?.blocked?.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 space-y-1">
                <p className="text-sm font-bold text-rose-700 flex items-center gap-1">
                  <AlertTriangleIcon size={16} /> 복원할 수 없습니다
                </p>
                {restoreCheck.blocked.map((item, index) => (
                  <p className="text-xs text-rose-700" key={item.order_item_id ?? `blocked-${index}`}>
                    {item.title ? `${item.title} — ` : ""}
                    {item.reason}
                  </p>
                ))}
                <p className="text-xs text-rose-600 pt-1">
                  구매자에게 재고 상황을 안내하고 새 주문으로 진행해 주세요.
                </p>
              </div>
            )}

            {!restoreCheck?.loading && !restoreCheck?.error && restoreCheck?.blocked?.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-1">
                <p className="text-sm text-slate-700">
                  주문을 <strong>입금대기</strong>로 되돌리고 교재 {restoreModal.item_count}권을 다시
                  선점합니다. 판매 페이지에서는 즉시 내려갑니다.
                </p>
                <p className="text-xs text-slate-500">
                  결제 확정은 아직입니다 — 복원 후 <strong>입금확인</strong> 버튼으로 금액을 확인해야
                  &lsquo;상품 준비 중&rsquo;으로 넘어가고 구매자 알림도 발송됩니다.
                </p>
                <p className="text-xs text-slate-500">
                  자동취소 시계는 복원 시점부터 다시 24시간입니다.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={closeRestoreModal} type="button">
                닫기
              </button>
              <button
                className="btn-primary flex-1"
                disabled={
                  busyOrderId === restoreModal.id ||
                  restoreCheck?.loading ||
                  Boolean(restoreCheck?.error) ||
                  (restoreCheck?.blocked?.length ?? 0) > 0
                }
                onClick={handleRestoreOrder}
                type="button"
              >
                {busyOrderId === restoreModal.id ? <BusyText>복원 중...</BusyText> : "입금대기로 복원"}
              </button>
            </div>
          </div>
        )}
      </AdminDialog>

      {/* 일괄 입금확인 확인 모달 — 별도 입력 없이 대상 목록 확인 후 즉시 처리 */}
      <AdminDialog
        busy={bulkProcessing}
        onClose={() => setBulkConfirmOpen(false)}
        open={bulkConfirmOpen}
        size="md"
        title={`일괄 입금확인 — ${selectedBulkConfirmTargets.length}건`}
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            선택한 무통장·입금대기 주문 <strong>{selectedBulkConfirmTargets.length}건</strong>을
            금액 입력 없이 바로 입금확인 처리합니다.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
            {selectedBulkConfirmTargets.map((order) => (
              <div className="flex items-center justify-between px-3 py-2 text-sm" key={order.id}>
                <span className="font-mono text-xs font-bold">{order.order_number}</span>
                <span className="text-xs text-slate-500">
                  {order.shipping_recipient_name}
                  {String(order.order_number ?? "").replace(/\D/g, "").slice(-4)}
                </span>
                <span className="font-bold">{formatCurrency(order.total_amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-700">
            통장 입금 내역과 위 금액(예상 입금자명)이 맞는지 확인한 뒤 처리하세요.
            처리 즉시 &lsquo;상품 준비 중&rsquo;으로 전환되고 구매자에게 결제 확인 알림이 발송됩니다.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={() => setBulkConfirmOpen(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="btn-primary flex-1"
              disabled={bulkProcessing || selectedBulkConfirmTargets.length === 0}
              onClick={handleBulkConfirmPayment}
              type="button"
            >
              {bulkProcessing ? <BusyText>처리 중...</BusyText> : `${selectedBulkConfirmTargets.length}건 입금확인 처리`}
            </button>
          </div>
        </div>
      </AdminDialog>

      {/* CJ 송장 일괄 출력 확인 모달 — 발급은 되돌릴 수 없으므로 대상·부작용을 한 번 보여준다 */}
      <AdminDialog
        busy={bulkProcessing}
        onClose={() => setBulkCjConfirmOpen(false)}
        open={bulkCjConfirmOpen}
        size="md"
        title={`CJ 송장 일괄 출력 — ${selectedCjTargets.length}건`}
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            선택한 <strong>{selectedCjTargets.length}건</strong>의 운송장을 한 번에 발급하고,
            인쇄 창에서 <strong>{selectedCjTargets.length}장</strong>을 한 번의 인쇄 작업으로 출력합니다.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
            {selectedCjTargets.map((order, index) => {
              const locs = [
                ...new Set((order.items ?? []).map((i) => i.book_location).filter(Boolean)),
              ];
              return (
                <div className="flex items-center gap-2 px-3 py-2 text-sm" key={order.id}>
                  <span className="w-5 shrink-0 text-xs font-bold text-slate-400">{index + 1}</span>
                  <span className="font-mono text-xs font-bold">{order.order_number}</span>
                  <span className="truncate text-xs text-slate-500">
                    {order.shipping_recipient_name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] font-bold text-indigo-600">
                    {locs.length > 0 ? `위치 ${locs.join(" · ")}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-amber-700">
            발급 즉시 각 주문이 &lsquo;배송중&rsquo;으로 전환되고 구매자에게 배송 시작 알림톡이 발송됩니다.
            라벨은 위 순서(목록과 동일)대로 출력됩니다.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={() => setBulkCjConfirmOpen(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="btn-primary flex-1"
              disabled={bulkProcessing || selectedCjTargets.length === 0}
              onClick={() => handleBulkCj({ reprint: false })}
              type="button"
            >
              {bulkProcessing ? <BusyText>발급 중...</BusyText> : `${selectedCjTargets.length}건 발급하고 인쇄`}
            </button>
          </div>
        </div>
      </AdminDialog>

      {/* CJ 송장 일괄 출력 결과 — 실패가 섞였을 때만. 성공분은 여기서 인쇄로 넘어간다. */}
      <AdminDialog
        onClose={() => setBulkCjResult(null)}
        open={Boolean(bulkCjResult)}
        size="md"
        title={
          bulkCjResult
            ? `송장 ${bulkCjResult.reprint ? "재출력" : "발급"} 결과 — 인쇄 ${bulkCjResult.labels.length}장 / 확인 필요 ${bulkCjResult.failures.length}건`
            : ""
        }
      >
        {bulkCjResult ? (
          <div className="p-6 space-y-4">
            {bulkCjResult.failures.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-xs font-bold text-rose-700 mb-1.5">
                  <AlertTriangleIcon size={13} /> 아래 주문은 이번 인쇄에 포함되지 않았습니다. 사유 확인 후 개별 처리해 주세요.
                </p>
                <div className="max-h-48 overflow-y-auto divide-y divide-rose-100">
                  {bulkCjResult.failures.map((f) => (
                    <div className="py-1.5 text-xs" key={f.orderId}>
                      <span className="font-mono font-bold text-slate-700">{f.orderNumber}</span>
                      <span className="ml-2 text-rose-700">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bulkCjResult.labels.length > 0 ? (
              <p className="text-sm text-slate-700">
                <strong>{bulkCjResult.labels.length}건</strong>은 라벨이 준비됐습니다. 지금 출력하세요.
              </p>
            ) : (
              <p className="text-sm text-slate-500">출력할 라벨이 없습니다.</p>
            )}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setBulkCjResult(null)} type="button">
                닫기
              </button>
              <button
                className="btn-primary flex-1"
                disabled={bulkCjResult.labels.length === 0}
                onClick={() => {
                  setLabelBatch(bulkCjResult.labels);
                  setBulkCjResult(null);
                }}
                type="button"
              >
                {`${bulkCjResult.labels.length}장 인쇄`}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      {/* 입금확인 모달 (금액 검증) */}
      <AdminDialog
        busy={paymentModal ? busyOrderId === paymentModal.id : false}
        dirty={Boolean(paymentInput.trim())}
        onClose={closePaymentModal}
        open={Boolean(paymentModal)}
        size="md"
        title={paymentModal ? `입금확인 — ${paymentModal.order_number}` : ""}
      >
        {paymentModal ? (
          <div className="p-6 space-y-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">주문 금액</span>
                <span className="font-bold">{formatCurrency(paymentModal.total_amount)}</span>
              </div>
              {(Number(paymentModal.coupon_discount_amount ?? 0) > 0 || Number(paymentModal.points_used ?? 0) > 0) && (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>구성</span>
                  <span>
                    상품 {formatCurrency(paymentModal.subtotal)} + 배송비 {formatCurrency(paymentModal.shipping_fee)}
                    {Number(paymentModal.coupon_discount_amount ?? 0) > 0 ? ` − 쿠폰 ${formatCurrency(paymentModal.coupon_discount_amount)}` : ""}
                    {Number(paymentModal.points_used ?? 0) > 0 ? ` − 포인트 ${formatCurrency(paymentModal.points_used)}` : ""}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">수령인</span>
                <span>{paymentModal.shipping_recipient_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">예상 입금자명</span>
                <span className="font-mono">
                  {paymentModal.shipping_recipient_name}
                  {String(paymentModal.order_number ?? "").replace(/\D/g, "").slice(-4)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                실제 입금된 금액 * (주문 금액과 일치해야 처리됩니다)
              </label>
              <input
                className="input-base font-mono"
                inputMode="numeric"
                onChange={(e) => setPaymentInput(e.target.value)}
                placeholder={`예: ${Number(paymentModal.total_amount ?? 0).toLocaleString("ko-KR")}`}
                type="text"
                value={paymentInput}
              />
              <p className="text-xs text-slate-400 mt-1">
                통장 내역을 보고 직접 입력하세요. 금액이 다르면 입금확인이 거부됩니다.
              </p>
              <button
                className="text-xs font-semibold text-blue-600 hover:underline mt-1"
                onClick={() => setPaymentInput(String(paymentModal.total_amount ?? ""))}
                type="button"
              >
                주문 금액과 동일하게 채우기
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                통장에 찍힌 입금자명 * (예상값과 다르면 경고 표시)
              </label>
              <input
                autoComplete="off"
                className="input-base"
                onChange={(e) => setPaymentDepositorInput(e.target.value)}
                placeholder="통장 내역의 입금자명 그대로"
                type="text"
                value={paymentDepositorInput}
              />
              {(() => {
                const expected = `${paymentModal.shipping_recipient_name ?? ""}${String(paymentModal.order_number ?? "").replace(/\D/g, "").slice(-4)}`;
                const input = paymentDepositorInput.trim();
                if (input.length === 0) return null;
                const matches = input === expected;
                return (
                  <p className={`text-xs mt-1 ${matches ? "text-emerald-700" : "text-amber-700 font-semibold"}`}>
                    {matches
                      ? <><CheckIcon size={13} /> 예상 입금자명과 일치합니다.</>
                      : <><AlertTriangleIcon size={13} /> 예상값 "{expected}"과 다릅니다. 본인 입금이 확실한지 한 번 더 확인해주세요.</>}
                  </p>
                );
              })()}
            </div>

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={closePaymentModal} type="button">
                취소
              </button>
              <button
                className="btn-primary flex-1"
                disabled={
                  busyOrderId === paymentModal.id
                  || !paymentInput.trim()
                  || !paymentDepositorInput.trim()
                }
                onClick={handleConfirmPayment}
                type="button"
              >
                {busyOrderId === paymentModal.id ? <BusyText>확인 중...</BusyText> : "입금확인 처리"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      {/* 송장 입력 모달 — form 으로 감싸 Enter 키로도 제출 가능 */}
      <AdminDialog
        busy={trackingModal ? busyOrderId === trackingModal.id : false}
        dirty={Boolean(trackingInput.trim())}
        onClose={closeTrackingModal}
        open={Boolean(trackingModal)}
        size="md"
        title={trackingModal ? `송장 입력 — ${trackingModal.order_number}` : ""}
      >
        {trackingModal ? (
          <form
            className="p-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleTrackingSubmit();
            }}
          >
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
                  placeholder="송장번호를 입력하세요 (Enter로 제출)"
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
                type="submit"
              >
                {busyOrderId === trackingModal.id ? <BusyText>처리 중...</BusyText> : "배송 처리"}
              </button>
            </div>
          </form>
        ) : null}
      </AdminDialog>

      {/* CSV 일괄 송장 입력 모달 */}
      <AdminDialog
        busy={csvProcessing}
        dirty={csvRows.length > 0 && !csvResults}
        onClose={closeCsvModal}
        open={csvModalOpen}
        size="md"
        title="일괄 송장 입력"
      >
        {csvModalOpen ? (
          <div className="p-6 space-y-5">
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
                          <tr className="whitespace-nowrap border-b text-left text-slate-500">
                            <th className="py-2 px-2">주문번호</th>
                            <th className="py-2 px-2">택배사</th>
                            <th className="py-2 px-2">송장번호</th>
                            <th className="py-2 px-2">검증</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvRows.map((row, i) => {
                            const invalid = row.isValid === false;
                            return (
                              <tr
                                className={`border-b border-slate-50 ${invalid ? "bg-rose-50" : ""}`}
                                key={i}
                              >
                                <td className="whitespace-nowrap py-1.5 px-2 font-mono">{row.orderNumber}</td>
                                <td className="whitespace-nowrap py-1.5 px-2">{row.carrier}</td>
                                <td className={`whitespace-nowrap py-1.5 px-2 font-mono ${invalid ? "text-rose-700 font-bold" : ""}`}>
                                  {row.trackingNumber}
                                </td>
                                <td className={`whitespace-nowrap py-1.5 px-2 font-semibold ${invalid ? "text-rose-600" : "text-emerald-600"}`}>
                                  {invalid ? "형식 오류" : "OK"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500">
                      총 {csvRows.length}건 · 검증 통과{" "}
                      <strong className="text-emerald-700">
                        {csvRows.filter((r) => r.isValid !== false).length}건
                      </strong>{" "}
                      · 검증 실패{" "}
                      <strong className="text-rose-700">
                        {csvRows.filter((r) => r.isValid === false).length}건
                      </strong>
                    </p>
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
                    {csvProcessing ? <BusyText>처리 중...</BusyText> : "일괄 처리"}
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
                        <tr className="whitespace-nowrap border-b text-left text-slate-500">
                          <th className="py-2 px-2">주문번호</th>
                          <th className="py-2 px-2">송장번호</th>
                          <th className="py-2 px-2">결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvResults.map((r, i) => (
                          <tr className="border-b border-slate-50" key={i}>
                            <td className="whitespace-nowrap py-1.5 px-2 font-mono">{r.orderNumber}</td>
                            <td className="whitespace-nowrap py-1.5 px-2 font-mono">{r.trackingNumber}</td>
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
        ) : null}
      </AdminDialog>

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

      {/* 환불 모달 — 품목 선택 부분환불 (2026-08-01). 전액/부분 공용 진입점. */}
      <AdminDialog
        busy={refundModal ? busyOrderId === refundModal.id : false}
        dirty={Boolean(refundReasonInput.trim())}
        onClose={closeRefundModal}
        open={Boolean(refundModal)}
        size="md"
        title={refundModal ? `환불 처리 — ${refundModal.order_number}` : ""}
      >
        {refundModal ? (() => {
          const items = refundModal.items ?? [];
          const unrefunded = items.filter((i) => !i.refunded_at);
          const refundedItems = items.filter((i) => i.refunded_at);
          const remaining = Math.max(
            0,
            Number(refundModal.total_amount ?? 0) - Number(refundModal.refunded_amount ?? 0),
          );
          const checkedItems = unrefunded.filter((i) => refundCheckedIds.has(i.id));
          const itemsTotal = checkedItems.reduce((sum, i) => sum + Number(i.total_price ?? 0), 0);
          const isFinal = checkedItems.length === unrefunded.length && checkedItems.length > 0;
          const amountNum = Number(String(refundAmountInput).replace(/[^0-9]/g, ""));
          const amountValid = Number.isInteger(amountNum) && amountNum > 0 && amountNum <= remaining;
          const busy = busyOrderId === refundModal.id;
          return (
            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">
                  환불할 품목 선택 * ({checkedItems.length}/{unrefunded.length})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
                  {unrefunded.map((item) => (
                    <label
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50"
                      key={item.id}
                    >
                      <input
                        checked={refundCheckedIds.has(item.id)}
                        disabled={busy}
                        onChange={() => toggleRefundItem(refundModal, item.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{item.title}</span>
                        {(item.option_label || item.condition_grade) && (
                          <span className="block text-xs text-slate-400">
                            {[item.option_label, item.condition_grade].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap font-bold">{formatCurrency(item.total_price)}</span>
                    </label>
                  ))}
                  {/* 이미 환불된 품목 — 선택 불가, 이력만 표시 */}
                  {refundedItems.map((item) => (
                    <div className="flex items-center gap-2.5 px-3 py-2 text-sm opacity-60" key={item.id}>
                      <input checked disabled readOnly type="checkbox" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold line-through">{item.title}</span>
                        <span className="block text-xs font-bold text-rose-600">
                          환불됨 · {formatDate(item.refunded_at)}
                          {item.refund_amount != null ? ` · ${formatCurrency(item.refund_amount)}` : ""}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-bold line-through">
                        {formatCurrency(item.total_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">남은 환불 가능 금액</span>
                  <span className="font-bold">{formatCurrency(remaining)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>선택 품목 합계</span>
                  <span>{formatCurrency(itemsTotal)}</span>
                </div>
                {Number(refundModal.coupon_discount_amount ?? 0) > 0 && (
                  <p className="text-xs text-amber-700">
                    <AlertTriangleIcon size={13} /> 쿠폰 할인(
                    {formatCurrency(refundModal.coupon_discount_amount)})이 적용된 주문입니다. 부분환불 시
                    할인 몫을 환불 금액에서 차감할지 확인하세요.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  환불 금액 * {isFinal ? "(전체 선택 — 배송비 포함 잔액 전액)" : "(기본값: 선택 품목 합계)"}
                </label>
                <input
                  className="input-base font-mono"
                  disabled={busy}
                  inputMode="numeric"
                  onChange={(e) => {
                    setRefundAmountTouched(true);
                    setRefundAmountInput(e.target.value);
                  }}
                  type="text"
                  value={refundAmountInput}
                />
                {!amountValid && refundAmountInput.trim() !== "" && (
                  <p className="mt-1 text-xs text-rose-600">
                    1원 이상, 남은 환불 가능 금액({formatCurrency(remaining)}) 이하로 입력하세요.
                  </p>
                )}
                <button
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                  disabled={busy}
                  onClick={() => {
                    setRefundAmountTouched(false);
                    setRefundAmountInput(String(computeRefundDefault(refundModal, refundCheckedIds)));
                  }}
                  type="button"
                >
                  기본값으로 되돌리기
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  환불 사유 * (최소 5자)
                </label>
                <textarea
                  className="input-base"
                  disabled={busy}
                  onChange={(e) => setRefundReasonInput(e.target.value)}
                  placeholder="예) 단순 변심 / 상품 불량 / 배송 사고"
                  rows={2}
                  value={refundReasonInput}
                />
              </div>

              {/* 반품 회수 옵션 (2026-08-24) — 배송 나간 주문은 재입고 보류가 기본값 */}
              <div className="space-y-2 rounded-lg border border-slate-100 px-3 py-2.5">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    checked={refundHoldRestock}
                    className="mt-0.5"
                    disabled={busy}
                    onChange={(e) => setRefundHoldRestock(e.target.checked)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">재입고 보류 (실물 회수 후 복원)</span>
                    <span className="block text-xs text-slate-400">
                      해제 시 환불 즉시 재판매로 풀립니다 — 책이 아직 구매자에게 있으면 보류를 유지하고,
                      회수 후 주문 상세의 &apos;회수 완료&apos; 버튼으로 복원/폐기하세요.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    checked={refundRegisterReturn}
                    className="mt-0.5"
                    disabled={busy}
                    onChange={(e) => setRefundRegisterReturn(e.target.checked)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">CJ 반품 수거 접수 (기사 방문)</span>
                    <span className="block text-xs text-slate-400">
                      환불 처리 직후 구매자 배송지로 CJ 반품 수거를 접수합니다.
                    </span>
                  </span>
                </label>
              </div>

              <div className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                {`[자동 처리]\n`
                  + `· ${refundModal.payment_method === "bank_transfer" ? "" : "PG 결제 부분/전액 취소 후 "}선택 품목 환불 · 해당 정산 pending/approved → cancelled\n`
                  + `· ${refundHoldRestock ? "reserved 재고 → 회수 대기 (재입고 보류)" : "reserved 재고 → 판매중 복원"}\n`
                  + `· 쿠폰 복구는 모든 품목이 환불 완료될 때만\n`
                  + `· 구매자에게 환불 안내 알림톡 발송`
                  + `${refundModal.payment_method === "bank_transfer" ? "\n※ 계좌이체 주문 — 처리 후 환불 계좌로 직접 송금해야 합니다." : ""}`
                  + `\n※ 셀러에게 이미 송금 완료된 정산이 있으면 다음 단계에서 손실 확인을 받습니다.`}
              </div>

              <div className="flex gap-2">
                <button className="btn-ghost flex-1" disabled={busy} onClick={closeRefundModal} type="button">
                  취소
                </button>
                <button
                  className="btn-danger flex-1"
                  disabled={busy || checkedItems.length === 0 || !amountValid || refundReasonInput.trim().length < 5}
                  onClick={handleRefundSubmit}
                  type="button"
                >
                  {busy
                    ? <BusyText>처리 중...</BusyText>
                    : `${isFinal ? "전액" : "부분"} 환불 진행 (${formatCurrency(amountNum || 0)})`}
                </button>
              </div>
            </div>
          );
        })() : null}
      </AdminDialog>

      <DestructiveConfirmModal
        busy={bulkProcessing || busyOrderId != null}
        cancelLabel="취소"
        confirmLabel={destructiveModal?.confirmLabel}
        confirmPhrase={destructiveModal?.confirmPhrase}
        description={destructiveModal?.description ?? ""}
        onCancel={() => setDestructiveModal(null)}
        onConfirm={async (reason) => {
          const current = destructiveModal;
          if (!current) return;
          setDestructiveModal(null);
          await current.run(reason);
        }}
        open={!!destructiveModal}
        reasonMinLength={destructiveModal?.reasonMinLength}
        reasonPlaceholder={destructiveModal?.reasonPlaceholder}
        reasonRequired={destructiveModal?.reasonRequired}
        title={destructiveModal?.title ?? ""}
      />

      {/* 대량 처리·엑셀 생성처럼 수 초 이상 걸리는 작업 — 진행 중임을 화면에서 확실히 보이게.
          단건 버튼 작업은 버튼 안 스피너로 충분해서 여기 넣지 않는다. */}
      <LoadingOverlay
        detail={
          bulkCjProgress
            ? `${bulkCjProgress.done} / ${bulkCjProgress.total}건 — CJ 서버 응답을 기다립니다`
            : csvProcessing
              ? "주문 건별로 순차 처리합니다"
              : null
        }
        message={
          bulkCjProgress
            ? "CJ 송장을 처리하고 있습니다"
            : csvProcessing
              ? "송장을 일괄 처리하고 있습니다"
              : isSalesExporting
                ? "판매내역 엑셀을 만들고 있습니다"
                : "선택한 주문을 처리하고 있습니다"
        }
        open={bulkProcessing || csvProcessing || isSalesExporting}
      />

      {/* 라벨 인쇄 — 단건(labelData) / 일괄(labelBatch) 공용. 일괄은 한 인쇄 작업으로 N장. */}
      <CjWaybillFormPrintModal
        data={labelData}
        items={labelBatch}
        onClose={() => {
          setLabelData(null);
          setLabelBatch(null);
        }}
        open={Boolean(labelData) || Boolean(labelBatch?.length)}
      />

      {/* CJ 실시간 배송조회 모달 */}
      {deliveryTrace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeDeliveryTrace}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">배송조회 — {deliveryTrace.orderNumber}</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  CJ대한통운 · <span className="font-mono">{deliveryTrace.invcNo}</span>
                  {deliveryTraceData?.delivered ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      배송완료
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={isDeliveryTraceLoading}
                onClick={() => fetchDeliveryTrace(deliveryTrace.invcNo)}
                type="button"
              >
                {isDeliveryTraceLoading ? <BusyText>조회 중...</BusyText> : "새로고침"}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isDeliveryTraceLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">CJ 배송 정보를 조회하고 있어요...</p>
              ) : deliveryTraceError ? (
                <p className="py-8 text-center text-sm font-semibold text-rose-600" role="alert">
                  {deliveryTraceError}
                </p>
              ) : deliveryTraceData?.noData ? (
                <p className="py-8 text-center text-sm text-slate-500">{deliveryTraceData.message}</p>
              ) : deliveryTraceData?.events?.length ? (
                <ol className="space-y-0">
                  {[...deliveryTraceData.events].reverse().map((event, index) => {
                    const isLatest = index === 0;
                    return (
                      <li className="relative flex gap-3 pb-4 last:pb-0" key={`${event.at}-${event.statusCode}-${index}`}>
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              isLatest ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-slate-300"
                            }`}
                          />
                          <span className="w-px flex-1 bg-slate-200" aria-hidden="true" />
                        </div>
                        <div className={isLatest ? "" : "opacity-80"}>
                          <p className={`text-sm ${isLatest ? "font-black text-slate-950" : "font-semibold text-slate-700"}`}>
                            {event.statusText || event.statusCode || "-"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {event.at}
                            {event.branchName ? ` · ${event.branchName}` : ""}
                          </p>
                          {event.workerName || event.workerTel || event.branchTel ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              담당 {event.workerName || "-"}
                              {event.workerTel || event.branchTel
                                ? ` · ${event.workerTel || event.branchTel}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">표시할 배송 이력이 없습니다.</p>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
              <a
                className="text-xs font-semibold text-blue-600 hover:underline"
                href={`https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${encodeURIComponent(deliveryTrace.invcNo)}`}
                rel="noreferrer"
                target="_blank"
              >
                CJ 조회 페이지에서 열기 ↗
              </a>
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                onClick={closeDeliveryTrace}
                type="button"
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminOrdersPage;
