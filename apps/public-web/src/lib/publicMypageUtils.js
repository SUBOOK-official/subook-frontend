export const DEFAULT_TAB_KEY = "purchases";
export const MAX_SAVED_ITEMS = 5;

export const BANK_OPTIONS = [
  "신한은행",
  "국민은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  "카카오뱅크",
  "토스뱅크",
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
export const SIDEBAR_GROUPS = [
  {
    title: "쇼핑 정보",
    items: [
      { key: "purchases", label: "구매 내역" },
      { key: "sales", label: "판매 내역" },
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

const SIDEBAR_KEYS = SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export function findSidebarItem(key) {
  for (const group of SIDEBAR_GROUPS) {
    const found = group.items.find((item) => item.key === key);
    if (found) {
      return { ...found, group: group.title };
    }
  }
  return null;
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
  { key: "inspecting", label: "검수" },
  { key: "listed", label: "판매" },
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
  paid: { label: "결제완료", tone: "accent" },
  // preparing: 어드민이 결제 확인 후 "상품 준비 중"으로 전환하는 단계.
  // 백엔드(orders.status enum)에 추가되기 전까지는 사용되지 않지만,
  // 라벨/필터 매핑은 미리 갖춰둔다.
  preparing: { label: "상품 준비 중", tone: "warning" },
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
    return orders.filter((order) => ["pending", "paid", "shipping", "delivered"].includes(order.status));
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

      if (["pending", "paid", "shipping", "delivered"].includes(order.status)) {
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
// - 결제 완료(paid): 사용자가 계좌이체/PG로 결제하고 입금 확인까지 완료된 상태
// - 상품 준비 중(preparing): 어드민이 결제 확인 후 명시적으로 전환한 상태 — 백엔드 status 추가 필요
// - 배송중(shipping): 운송장이 등록된 상태
// - 구매 확정(confirmed): 배송 도착 후 7일 자동 또는 사용자 임의 확정
// (delivered/pending/cancelled/refunded/returned 등은 별도 카드로 노출하지 않음)
export const PURCHASE_SUMMARY_CARDS = [
  { key: "all",       label: "전체",       statuses: null },
  { key: "paid",      label: "결제 완료",   statuses: ["paid"] },
  { key: "preparing", label: "상품 준비 중", statuses: ["preparing"] },
  { key: "shipping",  label: "배송중",     statuses: ["shipping"] },
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
  const items = (pr.items ?? []).map((item) => ({
    id: item.id,
    title: item.title ?? "교재",
    gradeLabel: null,
    price: item.original_price ?? null,
    rejectionReason: pr.status === "cancelled" ? "수거 취소" : null,
    statusLabel: statusLabelMap[pr.status]?.label ?? "접수됨",
    tone: statusLabelMap[pr.status]?.tone ?? "neutral",
  }));
  const itemCount = pr.item_count ?? items.length;
  const summaryByStatus = {
    completed: `교재 ${itemCount}권 · 정산완료`,
    inspected: `교재 ${itemCount}권 · 검수완료`,
    cancelled: `교재 ${itemCount}권 · 취소`,
  };

  return {
    id: pr.id,
    reference: pr.request_number,
    createdAt: pr.created_at,
    status: mappedStatus,
    summaryLabel: summaryByStatus[pr.status] ?? `교재 ${itemCount}권`,
    bookCount: itemCount,
    compact: false,
    trackingNumber: pr.tracking_number ?? null,
    trackingCompany: pr.tracking_carrier ?? "CJ대한통운",
    items,
  };
}

// 주문 DB row → PurchasesTab의 order 형태로 변환
export function mapOrderToDisplayOrder(order) {
  const items = (order.items ?? []).map((item) => ({
    id: item.id,
    productId: item.product_id ?? null,
    title: item.title ?? "교재",
    gradeLabel: item.condition_grade ?? item.option_label ?? "-",
    quantity: item.quantity ?? 1,
    price: item.total_price ?? item.unit_price ?? 0,
    coverImageUrl: item.cover_image_url ?? null,
    reviewId: item.review_id ?? null,
    reviewRating: item.review_rating ?? null,
    reviewCreatedAt: item.review_created_at ?? null,
    canReview:
      order.status === "confirmed" &&
      !item.review_id &&
      Boolean(item.product_id),
  }));

  const autoConfirmAt = order.auto_confirm_at ? new Date(order.auto_confirm_at) : null;
  const now = new Date();
  const autoConfirmDaysRemaining =
    autoConfirmAt && autoConfirmAt > now && !order.confirmed_at
      ? Math.ceil((autoConfirmAt - now) / (1000 * 60 * 60 * 24))
      : null;

  const canConfirm = order.status === "delivered" && !order.confirmed_at;
  // 사용자는 배송 전 단계(입금대기/결제완료/상품 준비 중)에서 주문 취소 가능
  const canCancel = ["pending", "paid", "preparing"].includes(order.status);
  const canReturn = order.status === "delivered" && !order.confirmed_at;
  const canReview = items.some((item) => item.canReview);

  return {
    id: order.id,
    reference: order.order_number,
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
    canReturn,
    canReview,
    items,
  };
}
