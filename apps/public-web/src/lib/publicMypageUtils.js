export const DEFAULT_TAB_KEY = "sales";
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
  { key: "sales", label: "판매현황", icon: "📦" },
  { key: "purchases", label: "구매현황", icon: "📚" },
  { key: "settlements", label: "정산내역", icon: "💰" },
  { key: "settings", label: "설정", icon: "⚙️" },
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
  shipping: { label: "배송중", tone: "warning" },
  delivered: { label: "배송완료", tone: "success" },
  confirmed: { label: "구매확정", tone: "success" },
  cancelled: { label: "주문취소", tone: "danger" },
  refunded: { label: "환불", tone: "danger" },
  returned: { label: "반품", tone: "danger" },
};

export function getTabKeyFromHash(hash) {
  const normalizedHash = hash?.replace("#", "") ?? "";
  return TAB_ITEMS.some((item) => item.key === normalizedHash) ? normalizedHash : DEFAULT_TAB_KEY;
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

export function maskAccountNumber(value) {
  const digits = `${value ?? ""}`.replace(/\D/g, "");

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
  return {
    ...initialAccountForm,
    account_holder: profileSnapshot?.name ?? "",
    ...account,
  };
}

// 수거 요청 DB row → SalesTab의 shipment 형태로 변환
export function mapPickupRequestToShipment(pr) {
  const mappedStatus = pickupStatusToShipmentStatus[pr.status] ?? "requested";
  const items = (pr.items ?? []).map((item) => ({
    id: item.id,
    title: item.title ?? "교재",
    gradeLabel: null,
    price: item.original_price ?? null,
    rejectionReason: pr.status === "cancelled" ? "수거 취소" : null,
    statusLabel: pr.status === "cancelled" ? "취소" : "접수됨",
    tone: pr.status === "cancelled" ? "danger" : "neutral",
  }));

  return {
    id: pr.id,
    reference: pr.request_number,
    createdAt: pr.created_at,
    status: mappedStatus,
    summaryLabel: `교재 ${pr.item_count ?? items.length}권`,
    bookCount: pr.item_count ?? items.length,
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
    title: item.title ?? "교재",
    gradeLabel: item.condition_grade ?? item.option_label ?? "-",
    quantity: item.quantity ?? 1,
    price: item.total_price ?? item.unit_price ?? 0,
  }));

  const autoConfirmAt = order.auto_confirm_at ? new Date(order.auto_confirm_at) : null;
  const now = new Date();
  const autoConfirmDaysRemaining =
    autoConfirmAt && autoConfirmAt > now && !order.confirmed_at
      ? Math.ceil((autoConfirmAt - now) / (1000 * 60 * 60 * 24))
      : null;

  const canConfirm = order.status === "delivered" && !order.confirmed_at;
  const canCancel = ["pending", "paid"].includes(order.status);
  const canReturn = order.status === "delivered" && !order.confirmed_at;
  const canReview = order.status === "confirmed";

  return {
    id: order.id,
    reference: order.order_number,
    createdAt: order.created_at,
    status: order.status,
    totalAmount: order.total_amount ?? 0,
    shippingFee: order.shipping_fee ?? 0,
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
