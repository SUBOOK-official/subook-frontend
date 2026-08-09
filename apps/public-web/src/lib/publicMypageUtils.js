import { bookConditionLabel } from "../../../../packages/shared-domain/src/status.js";

// raw condition_grade (NEW/S/A_PLUS/A) → 사람이 읽는 한국어 라벨.
// 매핑 없는 값은 그대로 반환 (option_label 같은 임의 텍스트 fallback).
function toGradeLabel(rawGrade) {
  if (rawGrade === null || rawGrade === undefined || rawGrade === "") return null;
  return bookConditionLabel[rawGrade] ?? rawGrade;
}

export const DEFAULT_TAB_KEY = "purchases";
export const MAX_SAVED_ITEMS = 5;

// 은행·증권사 목록 — 토스페이먼츠 공식 기관 코드 기준 전수 반영 (2026-07-12).
// https://docs.tosspayments.com/codes/org-codes
// ⚠ 기존 저장값(정산계좌·환불계좌)과의 select 매칭을 위해 기존 8개 표기는 변경 금지.
export const BANK_OPTIONS = [
  // 주요 은행 (사용 빈도순)
  "카카오뱅크",
  "토스뱅크",
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  // 그 외 은행·금융기관
  "케이뱅크",
  "SC제일은행",
  "씨티은행",
  "우체국",
  "새마을금고",
  "신협",
  "수협은행",
  "산업은행",
  "저축은행",
  "산림조합",
  "지역농축협",
  // 지방은행
  "iM뱅크(대구)",
  "부산은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
  // 증권사
  "미래에셋증권",
  "삼성증권",
  "한국투자증권",
  "KB증권",
  "NH투자증권",
  "키움증권",
  "토스증권",
  "카카오페이증권",
];

export const TAB_ITEMS = [
  { key: "purchases", label: "구매내역", icon: "📚" },
  { key: "sales", label: "판매내역", icon: "📦" },
  { key: "wishlist", label: "찜한 교재", icon: "♥" },
  { key: "settlements", label: "정산내역", icon: "💰" },
  { key: "settings", label: "설정", icon: "⚙️" },
];

// 새 사이드바 메뉴 구성. 그룹별로 묶여 표시되며,
// 키는 location.hash와 동기화되어 활성 메뉴 판단에 사용된다.
// settings-* 키는 SettingsTab을 공유하되 section prop으로 분기된다.
// 수거 요청 CTA는 sales empty state(MypageEmptyState)와 홈 PickupCTA·헤더 메뉴에 있어 사이드바 중복 노출 제거.
export const SIDEBAR_GROUPS = [
  {
    title: "판매 정보",
    items: [
      { key: "sales", label: "판매 내역" },
      { key: "settlements", label: "정산 내역" },
    ],
  },
  {
    title: "쇼핑 정보",
    items: [
      { key: "purchases", label: "구매 내역" },
      { key: "wishlist", label: "찜한 교재" },
      { key: "coupons", label: "쿠폰" },
    ],
  },
  {
    title: "내 정보",
    items: [
      { key: "profile", label: "회원정보 수정" },
      { key: "addresses", label: "주소록" },
      { key: "settlement-account", label: "판매 정산 계좌 관리" },
    ],
  },
];

// CTA(외부 라우팅) 아이템은 사이드바 hash 키 매칭 대상에서 제외한다.
const SIDEBAR_KEYS = SIDEBAR_GROUPS.flatMap((group) =>
  group.items.filter((item) => !item.isCta).map((item) => item.key),
);

export function findSidebarItem(key) {
  for (const group of SIDEBAR_GROUPS) {
    const found = group.items.find((item) => item.key === key && !item.isCta);
    if (found) {
      return { ...found, group: group.title };
    }
  }
  return null;
}

// 첫 진입 시 어떤 탭을 보여줄지 결정.
// 변경(2026-07-20): 웹·모바일 공통으로 항상 "구매 내역"을 기본 노출한다.
export function getDefaultTabForMember() {
  return "purchases";
}

export const SALES_STATUS_FILTERS = [
  { value: "all", label: "전체" },
  { value: "in_progress", label: "진행중" },
  { value: "on_sale", label: "판매중" },
  { value: "settled", label: "정산완료" },
  { value: "rejected", label: "판매불가" },
];

export const PURCHASE_STATUS_FILTERS = [
  { value: "all", label: "전체" },
  { value: "in_progress", label: "진행중" },
  { value: "delivered", label: "배송완료" },
  { value: "confirmed", label: "구매확정" },
  { value: "cancelled", label: "취소/환불" },
];

export const SHIPMENT_PROGRESS_STEPS = [
  { key: "requested", label: "신청" },
  { key: "scheduled", label: "접수" },
  { key: "collecting", label: "수거중" },
  { key: "received", label: "입고" },
  { key: "inspecting", label: "검수중" },
  { key: "listed", label: "판매중" },
];

export const initialProfileForm = {
  email: "",
  name: "",
  nickname: "",
  phone: "",
  marketing_opt_in: false,
};

export const initialAddressForm = {
  id: null,
  label: "",
  recipient_name: "",
  recipient_phone: "",
  postal_code: "",
  address_line1: "",
  address_line2: "",
  delivery_memo: "",
  is_default: false,
};

export const initialAccountForm = {
  id: null,
  bank_name: "",
  account_number: "",
  account_holder: "",
  is_default: false,
};

export const initialProfileErrors = {
  name: "",
  nickname: "",
  phone: "",
};

export const initialAddressErrors = {
  label: "",
  recipient_name: "",
  recipient_phone: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
};

export const initialAccountErrors = {
  bank_name: "",
  account_number: "",
  account_holder: "",
};

export const initialNicknameStatus = {
  state: "idle",
  message: "",
  tone: "info",
};

const shipmentStatusMap = {
  requested: { label: "대기", tone: "neutral" },
  scheduled: { label: "수거접수", tone: "accent" },
  collecting: { label: "수거중", tone: "accent" },
  received: { label: "입고", tone: "info" },
  inspecting: { label: "검수중", tone: "warning" },
  listed: { label: "판매중", tone: "success" },
  settled: { label: "정산완료", tone: "neutral" },
  rejected: { label: "판매불가", tone: "danger" },
};

const pickupStatusToShipmentStatus = {
  pending: "requested",
  pickup_scheduled: "scheduled",
  picking_up: "collecting",
  arrived: "received",
  inspecting: "inspecting",
  inspected: "listed",
  completed: "settled",
  cancelled: "rejected",
};

const orderStatusMap = {
  pending: { label: "입금대기", tone: "neutral" },
  // paid: 2026-07 폐지된 레거시 상태 — 결제가 확인되면 곧바로 preparing으로 간다.
  // 폐지 전 주문의 라벨 렌더용으로만 유지.
  paid: { label: "결제완료", tone: "accent" },
  // preparing: 결제 확인(무통장 입금확인 / PG 승인) 즉시 진입하는 상태.
  preparing: { label: "결제 완료", tone: "warning" },
  shipping: { label: "배송중", tone: "warning" },
  delivered: { label: "배송완료", tone: "success" },
  confirmed: { label: "구매확정", tone: "success" },
  cancelled: { label: "주문취소", tone: "danger" },
  refunded: { label: "환불", tone: "danger" },
  returned: { label: "반품", tone: "danger" },
};

function toNumber(value) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
}

function getTimestamp(value) {
  if (!value) {
    return null;
  }

  const nextDate = new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate.getTime();
}

function getShipmentFilterKey(status) {
  switch (status) {
    case "requested":
    case "scheduled":
    case "collecting":
    case "received":
    case "inspecting":
      return "in_progress";
    case "listed":
      return "on_sale";
    case "settled":
      return "settled";
    case "rejected":
      return "rejected";
    default:
      return "in_progress";
  }
}

function isRejectedShipmentItem(item) {
  if (item?.rejectionReason) {
    return true;
  }

  if (item?.tone === "danger") {
    return true;
  }

  return /판매불가|폐기|취소/.test(String(item?.statusLabel ?? ""));
}

function isSettledShipmentItem(item) {
  if (item?.tone === "neutral") {
    return /정산완료|판매완료/.test(String(item?.statusLabel ?? ""));
  }

  return /정산완료|판매완료/.test(String(item?.statusLabel ?? ""));
}

function isOnSaleShipmentItem(item) {
  if (item?.tone === "success") {
    return true;
  }

  return /판매중/.test(String(item?.statusLabel ?? ""));
}

function countRecentEntries(entries, key) {
  const now = Date.now();
  const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;

  return entries.filter((entry) => {
    const timestamp = getTimestamp(entry?.[key]);
    return timestamp !== null && now - timestamp <= THIRTY_DAYS_IN_MS;
  }).length;
}

export function filterShipmentsByStatus(shipments, filterValue = "all") {
  if (filterValue === "all") {
    return shipments;
  }

  return shipments.filter((shipment) => getShipmentFilterKey(shipment.status) === filterValue);
}

export function deriveShipmentMetrics(shipments = []) {
  const initialMetrics = {
    totalRequests: shipments.length,
    inProgressRequestCount: 0,
    totalBookCount: 0,
    onSaleBookCount: 0,
    settledBookCount: 0,
    rejectedBookCount: 0,
    onSaleValue: 0,
    recentRequestCount: countRecentEntries(shipments, "createdAt"),
    latestCreatedAt: null,
    latestStatus: null,
  };

  return shipments.reduce((metrics, shipment) => {
    const shipmentFilterKey = getShipmentFilterKey(shipment.status);
    const items = Array.isArray(shipment.items) ? shipment.items : [];
    const fallbackItemCount = items.length > 0 ? items.length : toNumber(shipment.bookCount);

    if (shipmentFilterKey === "in_progress") {
      metrics.inProgressRequestCount += 1;
    }

    metrics.totalBookCount += fallbackItemCount;

    const shipmentTimestamp = getTimestamp(shipment.createdAt);
    const latestTimestamp = getTimestamp(metrics.latestCreatedAt);
    if (shipmentTimestamp !== null && (latestTimestamp === null || shipmentTimestamp > latestTimestamp)) {
      metrics.latestCreatedAt = shipment.createdAt ?? null;
      metrics.latestStatus = shipment.status ?? null;
    }

    if (!items.length) {
      if (shipmentFilterKey === "on_sale") {
        metrics.onSaleBookCount += fallbackItemCount;
      } else if (shipmentFilterKey === "settled") {
        metrics.settledBookCount += fallbackItemCount;
      } else if (shipmentFilterKey === "rejected") {
        metrics.rejectedBookCount += fallbackItemCount;
      }

      return metrics;
    }

    items.forEach((item) => {
      const price = toNumber(item?.price);

      if (isRejectedShipmentItem(item)) {
        metrics.rejectedBookCount += 1;
        return;
      }

      if (isSettledShipmentItem(item) || shipmentFilterKey === "settled") {
        metrics.settledBookCount += 1;
        return;
      }

      if (isOnSaleShipmentItem(item) || shipmentFilterKey === "on_sale") {
        metrics.onSaleBookCount += 1;
        metrics.onSaleValue += price;
      }
    });

    return metrics;
  }, initialMetrics);
}

export function filterOrdersByStatus(orders, filterValue = "all") {
  if (filterValue === "all") {
    return orders;
  }

  if (filterValue === "in_progress") {
    return orders.filter((order) =>
      ["pending", "paid", "preparing", "shipping", "delivered"].includes(order.status),
    );
  }

  if (filterValue === "cancelled") {
    return orders.filter((order) => ["cancelled", "refunded", "returned"].includes(order.status));
  }

  return orders.filter((order) => order.status === filterValue);
}

export function derivePurchaseMetrics(orders = []) {
  return orders.reduce(
    (metrics, order) => {
      metrics.totalOrderCount += 1;
      metrics.totalSpend += toNumber(order.totalAmount);

      if (["pending", "paid", "preparing", "shipping", "delivered"].includes(order.status)) {
        metrics.inProgressCount += 1;
      }

      if (order.status === "delivered") {
        metrics.deliveredCount += 1;
      }

      if (order.status === "confirmed") {
        metrics.confirmedCount += 1;
      }

      if (["cancelled", "refunded", "returned"].includes(order.status)) {
        metrics.cancelledCount += 1;
      }

      return metrics;
    },
    {
      totalOrderCount: 0,
      inProgressCount: 0,
      deliveredCount: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      totalSpend: 0,
    },
  );
}

export function deriveSettlementMetrics({
  settlementSummary = null,
  completedSettlements = [],
  scheduledSettlements = [],
} = {}) {
  const summary = settlementSummary ?? {};

  return {
    currentMonthAmount: toNumber(summary.currentMonthAmount ?? summary.current_month_amount),
    totalAmount: toNumber(summary.totalAmount ?? summary.total_amount),
    expectedAmount: toNumber(summary.expectedAmount ?? summary.expected_amount),
    completedCount:
      completedSettlements.length || toNumber(summary.completedCount ?? summary.completed_count),
    pendingCount:
      scheduledSettlements.filter((settlement) => settlement.status === "pending").length ||
      toNumber(summary.pendingCount ?? summary.pending_count),
    approvedCount:
      scheduledSettlements.filter((settlement) => settlement.status === "approved").length ||
      toNumber(summary.approvedCount ?? summary.approved_count),
    scheduledCount: scheduledSettlements.length,
  };
}

export function buildMemberDashboardSummarySnapshot({
  baseSummary = {},
  completedSettlements = [],
  orders = [],
  profile = null,
  scheduledSettlements = [],
  settlementAccounts = [],
  settlementSummary = null,
  shipments = [],
  shippingAddresses = [],
} = {}) {
  const shipmentMetrics = deriveShipmentMetrics(shipments);
  const purchaseMetrics = derivePurchaseMetrics(orders);
  const settlementMetrics = deriveSettlementMetrics({
    settlementSummary,
    completedSettlements,
    scheduledSettlements,
  });
  const defaultShippingAddress = shippingAddresses.find((address) => address.is_default);
  const defaultSettlementAccount = settlementAccounts.find((account) => account.is_default);
  const displayName =
    profile?.nickname?.trim() ||
    profile?.name?.trim() ||
    profile?.email?.split("@")[0] ||
    baseSummary.display_name ||
    "회원";
  const hasSettlementData =
    settlementSummary !== null || completedSettlements.length > 0 || scheduledSettlements.length > 0;

  return {
    ...baseSummary,
    user_id: profile?.user_id ?? baseSummary.user_id ?? null,
    email: profile?.email ?? baseSummary.email ?? "",
    name: profile?.name ?? baseSummary.name ?? "",
    nickname: profile?.nickname ?? baseSummary.nickname ?? profile?.name ?? "",
    display_name: displayName,
    phone: profile?.phone ?? baseSummary.phone ?? "",
    marketing_opt_in: Boolean(profile?.marketing_opt_in ?? baseSummary.marketing_opt_in),
    shipping_address_count: shippingAddresses.length,
    default_shipping_address_id: defaultShippingAddress?.id ?? null,
    settlement_account_count: settlementAccounts.length,
    default_settlement_account_id: defaultSettlementAccount?.id ?? null,
    shipment_count: shipments.length || toNumber(baseSummary.shipment_count),
    recent_shipment_count: shipments.length
      ? shipmentMetrics.recentRequestCount
      : toNumber(baseSummary.recent_shipment_count),
    total_book_count: Math.max(toNumber(baseSummary.total_book_count), shipmentMetrics.totalBookCount),
    on_sale_book_count: Math.max(toNumber(baseSummary.on_sale_book_count), shipmentMetrics.onSaleBookCount),
    settled_book_count: Math.max(toNumber(baseSummary.settled_book_count), shipmentMetrics.settledBookCount),
    estimated_on_sale_value: Math.max(
      toNumber(baseSummary.estimated_on_sale_value),
      shipmentMetrics.onSaleValue,
    ),
    estimated_settled_value: hasSettlementData
      ? settlementMetrics.expectedAmount
      : toNumber(baseSummary.estimated_settled_value),
    latest_shipment_created_at:
      shipmentMetrics.latestCreatedAt ?? baseSummary.latest_shipment_created_at ?? null,
    latest_shipment_pickup_date:
      shipmentMetrics.latestCreatedAt ?? baseSummary.latest_shipment_pickup_date ?? null,
    latest_shipment_status: shipmentMetrics.latestStatus ?? baseSummary.latest_shipment_status ?? null,
    purchase_in_progress_count: purchaseMetrics.inProgressCount,
    current_month_settlement_total: hasSettlementData
      ? settlementMetrics.currentMonthAmount
      : toNumber(baseSummary.current_month_settlement_total),
    total_settlement_amount: hasSettlementData
      ? settlementMetrics.totalAmount
      : toNumber(baseSummary.total_settlement_amount),
  };
}

export function getTabKeyFromHash(hash) {
  const normalizedHash = hash?.replace("#", "") ?? "";

  // 사이드바 키 (purchases/sales/wishlist/coupons/profile/addresses/settlement-account) 우선
  if (SIDEBAR_KEYS.includes(normalizedHash)) {
    return normalizedHash;
  }

  // 레거시 호환: 이전 settings/settlements 해시는 기본 탭(구매내역)으로 보낸다
  if (normalizedHash === "settings") {
    return "profile";
  }

  return DEFAULT_TAB_KEY;
}

// 구매 내역 상단 통계 카드. 도메인 status와 1:1 매핑.
// - 상품 준비 중(preparing): 결제 확인(무통장 입금확인 / PG 승인) 즉시 진입하는 상태.
//   '결제 완료(paid)' 카드는 2026-07 paid 단계 폐지로 제거 — 레거시 paid 주문은 '전체'에서 확인.
// - 배송중(shipping): 운송장이 등록된 상태
// - 배송 완료(delivered): 배송이 도착 완료된 상태 (구매확정 전)
// - 구매 확정(confirmed): 배송 도착 후 7일 자동 또는 사용자 임의 확정
// (pending/cancelled/refunded/returned 등은 별도 카드로 노출하지 않음)
export const PURCHASE_SUMMARY_CARDS = [
  { key: "all",       label: "전체",       statuses: null },
  { key: "preparing", label: "결제 완료",   statuses: ["preparing"] },
  { key: "shipping",  label: "배송중",     statuses: ["shipping"] },
  { key: "delivered", label: "배송 완료",   statuses: ["delivered"] },
  { key: "confirmed", label: "구매 확정",   statuses: ["confirmed"] },
];

export function countOrdersByStatuses(orders, statuses) {
  if (!Array.isArray(orders)) return 0;
  if (!statuses) return orders.length;
  return orders.filter((order) => statuses.includes(order.status)).length;
}

// 같은 날짜(yyyy-mm-dd)에 만들어진 주문들을 한 그룹으로 묶는다.
// 입력은 mapOrderToDisplayOrder 결과(order[]), 반환은 [{ dateKey, dateLabel, orders }, ...]
// dateLabel은 "2026.05.09(일)" 형식, dateKey 내림차순 정렬.
const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function groupOrdersByDate(orders = []) {
  const buckets = new Map();
  for (const order of orders) {
    const created = order?.createdAt ? new Date(order.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) continue;

    const year = created.getFullYear();
    const month = String(created.getMonth() + 1).padStart(2, "0");
    const day = String(created.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    const dateLabel = `${year}.${month}.${day}(${KOREAN_WEEKDAYS[created.getDay()]})`;

    if (!buckets.has(dateKey)) {
      buckets.set(dateKey, { dateKey, dateLabel, orders: [] });
    }
    buckets.get(dateKey).orders.push(order);
  }

  return Array.from(buckets.values()).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

export function formatCompactDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = `${date.getFullYear()}`;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}.${month}.${day}`;
}

// 결제일시 표기용 — 날짜 + 시:분. (결제일시가 없으면 "-")
export function formatDateTime(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const base = formatCompactDate(dateString);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${base} ${hours}:${minutes}`;
}

export function formatShipmentReference(reference) {
  if (!reference) {
    return "PU-0000";
  }

  const normalizedReference = String(reference).trim();
  if (normalizedReference.startsWith("PU-")) {
    return normalizedReference;
  }

  return `PU-${normalizedReference}`;
}

export function formatOrderReference(reference) {
  if (!reference) {
    return "ORD-0000";
  }

  const normalizedReference = String(reference).trim();
  if (normalizedReference.startsWith("ORD-")) {
    return normalizedReference;
  }

  return `ORD-${normalizedReference}`;
}

export function sanitizeAccountNumberInput(value) {
  return (value ?? "").replace(/[^\d-]/g, "").slice(0, 24);
}

export function maskAccountNumber(value, last4 = "") {
  const normalizedLast4 = `${last4 ?? ""}`.replace(/\D/g, "").slice(-4);
  if (normalizedLast4) {
    return `****${normalizedLast4}`;
  }

  const rawValue = `${value ?? ""}`;
  if (rawValue.startsWith("****")) {
    return rawValue;
  }

  const digits = rawValue.replace(/\D/g, "");

  if (!digits) {
    return "계좌번호 미등록";
  }

  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, 3)}-***-**${digits.slice(-4)}`;
}

export function getShipmentStatusLabel(status) {
  return shipmentStatusMap[status]?.label ?? "대기";
}

export function getShipmentStatusTone(status) {
  return shipmentStatusMap[status]?.tone ?? "neutral";
}

export function getShipmentProgressIndex(status) {
  const statusMap = {
    requested: 0,
    scheduled: 1,
    collecting: 2,
    received: 3,
    inspecting: 4,
    listed: 5,
    settled: 5,
  };

  return statusMap[status] ?? 0;
}

export function getOrderStatusLabel(status) {
  return orderStatusMap[status]?.label ?? "결제완료";
}

export function getOrderStatusTone(status) {
  return orderStatusMap[status]?.tone ?? "neutral";
}

export function buildCjTrackingUrl(invoiceNumber) {
  if (!invoiceNumber) {
    return "";
  }

  return `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${encodeURIComponent(invoiceNumber)}`;
}

export function buildProfileForm(profileSnapshot, user) {
  return {
    email: profileSnapshot?.email ?? user?.email ?? "",
    name: profileSnapshot?.name ?? "",
    nickname: profileSnapshot?.nickname ?? profileSnapshot?.name ?? "",
    phone: profileSnapshot?.phone ?? "",
    marketing_opt_in: Boolean(profileSnapshot?.marketing_opt_in),
  };
}

export function buildAddressForm(address = {}, profileSnapshot = null) {
  return {
    ...initialAddressForm,
    recipient_name: profileSnapshot?.name ?? "",
    recipient_phone: profileSnapshot?.phone ?? "",
    ...address,
  };
}

export function buildAccountForm(account = {}, profileSnapshot = null) {
  const nextForm = {
    ...initialAccountForm,
    account_holder: profileSnapshot?.name ?? "",
    ...account,
  };

  if (account?.id) {
    nextForm.account_number = "";
  }

  return nextForm;
}

// 수거 요청 DB row → SalesTab의 shipment 형태로 변환
export function mapPickupRequestToShipment(pr) {
  const mappedStatus = pickupStatusToShipmentStatus[pr.status] ?? "requested";
  const statusLabelMap = {
    pending: { label: "신청완료", tone: "neutral" },
    pickup_scheduled: { label: "수거접수", tone: "accent" },
    picking_up: { label: "수거중", tone: "accent" },
    arrived: { label: "입고", tone: "info" },
    inspecting: { label: "검수중", tone: "warning" },
    inspected: { label: "검수완료", tone: "success" },
    completed: { label: "정산완료", tone: "neutral" },
    cancelled: { label: "취소", tone: "danger" },
  };
  // 2026-07-16: get_my_pickup_requests가 브리지된 shipment의 실제 검수 books를
  // items로 반환한다(등급·확정 판매가·상태·폐기사유·검수사진·검수메모).
  // 레거시 신청은 기존 pickup_items 형태가 그대로 내려오므로 두 형태를 모두 수용한다.
  const bookStatusChipMap = {
    on_sale: { label: "판매중", tone: "success" },
    reserved: { label: "판매중", tone: "success" },
    settled: { label: "정산완료", tone: "neutral" },
  };
  const items = (pr.items ?? []).map((item) => {
    const fallbackReason = pr.status === "cancelled" ? "수거 취소" : null;
    const rejectionReason = item.rejection_reason ?? item.rejectionReason ?? fallbackReason;
    const rejectionDetail = item.rejection_detail ?? item.rejectionDetail ?? null;
    const rejectionPhotoUrls = Array.isArray(item.rejection_photo_urls)
      ? item.rejection_photo_urls
      : Array.isArray(item.rejectionPhotoUrls)
        ? item.rejectionPhotoUrls
        : [];
    const inspectorNote = item.inspector_note ?? item.inspectorNote ?? null;
    const inspectedAt = item.inspected_at ?? item.inspectedAt ?? null;
    // 사유 미입력 폐기도 판매불가로 잡아야 함 — status가 판정의 1차 근거
    const isRejected =
      Boolean(rejectionReason) || item.status === "rejected" || item.status === "discarded";
    const bookChip = bookStatusChipMap[item.status] ?? null;
    const title = item.option
      ? `${item.title ?? "교재"} (${item.option})`
      : (item.title ?? "교재");

    return {
      id: item.id,
      title,
      gradeLabel: toGradeLabel(item.grade),
      // 확정 판매가(검수 후 책정) 우선, 없으면 정가 fallback
      price: item.price ?? item.original_price ?? null,
      rejectionReason,
      rejectionDetail,
      rejectionPhotoUrls,
      inspectorNote,
      inspectedAt,
      isRejected,
      statusLabel: isRejected
        ? "판매불가"
        : (bookChip?.label ?? statusLabelMap[pr.status]?.label ?? "접수됨"),
      tone: isRejected ? "danger" : (bookChip?.tone ?? statusLabelMap[pr.status]?.tone ?? "neutral"),
    };
  });
  // 검수된 실제 books가 있으면 그 권수가 진실 (item_count는 신청 시 '예상' 권수)
  const itemCount = items.length > 0 ? items.length : (pr.item_count ?? 0);
  const summaryByStatus = {
    completed: `교재 ${itemCount}권 · 정산완료`,
    inspected: `교재 ${itemCount}권 · 검수완료`,
    cancelled: `교재 ${itemCount}권 · 취소`,
  };
  // 2026-08-05: 구 수북 시절 수거건(수거신청 레코드 없음)은 PU 요청번호가 없어
  // shipment 번호(#N)로 표기한다. RPC가 source='legacy_shipment'로 구분해 내려줌.
  const isLegacyShipment = pr.source === "legacy_shipment";

  return {
    id: pr.id,
    reference: pr.request_number,
    referenceLabel: isLegacyShipment
      ? `#${pr.legacy_shipment_id ?? String(pr.id).replace("legacy-", "")}`
      : null,
    createdAt: pr.created_at,
    status: mappedStatus,
    summaryLabel: summaryByStatus[pr.status] ?? `교재 ${itemCount}권`,
    bookCount: itemCount,
    compact: false,
    trackingNumber: pr.tracking_number ?? null,
    trackingCompany: pr.tracking_carrier ?? "CJ대한통운",
    // CJ 접수(운송장 발급) 전에만 셀러가 직접 취소 가능 — 원본 pickup_request 상태 기준
    canCancel: !isLegacyShipment && pr.status === "pending" && !pr.tracking_number,
    pickupRequestId: isLegacyShipment ? null : pr.id,
    items,
  };
}

// get_member_recent_shipments 집계 행(비상 fallback 전용) → SalesTab shipment 형태.
// 책 목록이 없는 요약 행이므로 compact 카드로만 표시한다.
export function mapRecentShipmentRowToDisplay(row) {
  const statusMap = { scheduled: "scheduled", inspected: "listed" };
  const bookCount = toNumber(row?.book_count);

  return {
    id: `recent-${row?.id}`,
    reference: null,
    referenceLabel: `#${row?.id}`,
    createdAt: row?.created_at ?? null,
    status: statusMap[row?.status] ?? "requested",
    summaryLabel: `교재 ${bookCount}권`,
    bookCount,
    compact: true,
    trackingNumber: null,
    trackingCompany: null,
    items: [],
  };
}

// 주문 DB row → PurchasesTab의 order 형태로 변환
// 결제수단 코드 → 한글 라벨. 미확인/미지원 값은 기본 문구로.
const PAYMENT_METHOD_LABELS = {
  bank_transfer: "무통장입금 (계좌이체)",
  card: "신용/체크카드",
  kakao_pay: "카카오페이",
  naver_pay: "네이버페이",
  toss_pay: "토스페이",
};

export function getPaymentMethodLabel(method) {
  if (!method) return "-";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

// 미결제 카드(PG) 주문은 구매내역에서 숨긴다 (2026-07-28 정책).
// 카드 주문의 pending/cancelled + 결제이력 없음 = 결제창 이탈/실패 시도일 뿐이라
// 내역에 남기지 않는다 (fail 페이지 자동취소·30분 자동만료로 곧 cancelled가 됨).
// 결제까지 갔던 카드 주문(payment_status='paid')은 취소·환불돼도 계속 노출.
export function isHiddenUnpaidCardOrder(order) {
  return (
    order.paymentMethod === "card" &&
    order.paymentStatus !== "paid" &&
    (order.status === "pending" || order.status === "cancelled")
  );
}

export function mapOrderToDisplayOrder(order) {
  const items = (order.items ?? []).map((item) => ({
    id: item.id,
    productId: item.product_id ?? null,
    title: item.title ?? "교재",
    gradeLabel: toGradeLabel(item.condition_grade) ?? item.option_label ?? "-",
    quantity: item.quantity ?? 1,
    price: item.total_price ?? item.unit_price ?? 0,
    coverImageUrl: item.cover_image_url ?? null,
    // 품목별 부분환불 (2026-08-01): 값이 있으면 이 품목만 환불된 상태 (주문 status는 유지)
    refundedAt: item.refunded_at ?? null,
    refundAmount: item.refund_amount ?? null,
  }));

  const autoConfirmAt = order.auto_confirm_at ? new Date(order.auto_confirm_at) : null;
  const now = new Date();
  const autoConfirmDaysRemaining =
    autoConfirmAt && autoConfirmAt > now && !order.confirmed_at
      ? Math.ceil((autoConfirmAt - now) / (1000 * 60 * 60 * 24))
      : null;

  const canConfirm = order.status === "delivered" && !order.confirmed_at;
  // 주문 직접 취소는 입금 확인 전(입금대기)에만 가능 (2026-07-24 정책).
  // 입금 확인(preparing 이후)부터는 실입금이 있어 환불 이체가 필요하므로
  // 고객센터(카카오톡 채널) 경유 — 운영자가 admin 환불 흐름으로 처리한다.
  const canCancel = order.status === "pending";
  // 전자상거래법 7일 청약철회: delivered(미확정) 상태에서만 셀프 환불 신청 가능.
  // confirmed 후는 셀러 정산 송금이 진행됐을 위험이 있어 차단 — 고객센터 협의로 redirect
  // (백엔드 request_member_refund도 동일 정책으로 confirmed 차단).
  const refundRequestedAt = order.refund_requested_at ?? null;
  const canRequestRefund =
    order.status === "delivered" &&
    !refundRequestedAt &&
    order.status !== "refunded";
  const canReturn = order.status === "delivered" && !order.confirmed_at;

  return {
    id: order.id,
    reference: order.order_number,
    recipientName: order.shipping_recipient_name ?? null,
    paymentStatus: order.payment_status ?? null,
    paymentMethod: order.payment_method ?? null,
    // 결제 확인 시각: paid_at(2026-07-13부터 무통장 입금확인·PG 승인 공통 트리거 스탬프) 우선,
    // 그 이전 PG 주문은 pg_approved_at 폴백. 그 이전 무통장 주문은 둘 다 없어 주문일시로 표시.
    paidAt: order.paid_at ?? order.pg_approved_at ?? null,
    createdAt: order.created_at,
    status: order.status,
    subtotal: order.subtotal ?? 0,
    totalAmount: order.total_amount ?? 0,
    shippingFee: order.shipping_fee ?? 0,
    couponDiscountAmount: order.coupon_discount_amount ?? 0,
    appliedMemberCouponId: order.applied_member_coupon_id ?? null,
    trackingNumber: order.tracking_number ?? null,
    trackingCompany: order.tracking_carrier ?? "CJ대한통운",
    autoConfirmDaysRemaining,
    canConfirm,
    canCancel,
    canRequestRefund,
    canReturn,
    refundRequestedAt,
    refundRequestReason: order.refund_request_reason ?? null,
    // 환불 누계 (부분환불이면 status 유지 + 이 값만 증가 — 상세보기 시트의 환불 금액 행)
    refundedAmount: order.refunded_amount ?? 0,
    items,
  };
}
