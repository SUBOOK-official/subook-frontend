// 회원 포인트 — 순수 헬퍼 (브라우저·Supabase 의존 없음, 단위 테스트 대상)
// ⚠ 서버 point_policy()와 같은 값 유지 (backend 20260902111905_member_points.sql)

export const POINT_POLICY = Object.freeze({
  earnText: 500,
  earnPhoto: 1000,
  minBalanceToUse: 1000,
  minOrderSubtotal: 15000,
  maxUseRatio: 0.2,
  expiryMonths: 12,
});

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

export function formatPoints(value) {
  return `${toInteger(value).toLocaleString("ko-KR")}P`;
}

// 이 주문에서 쓸 수 있는 최대 포인트. 0이면 사용 불가.
// - 잔액이 최소 보유 기준 미만이면 0
// - 상품금액이 최소 주문 기준 미만이면 0
// - 상한 = 상품금액의 20% (쿠폰 할인 후 남는 상품금액을 넘지 않음)
export function computeMaxUsablePoints({ balance, subtotal, couponDiscount = 0, policy = POINT_POLICY }) {
  const balanceValue = Math.max(0, toInteger(balance));
  const subtotalValue = Math.max(0, toInteger(subtotal));
  const couponValue = Math.max(0, toInteger(couponDiscount));

  if (balanceValue < policy.minBalanceToUse) {
    return 0;
  }
  if (subtotalValue < policy.minOrderSubtotal) {
    return 0;
  }
  const ratioCap = Math.floor(subtotalValue * policy.maxUseRatio);
  const remainingCap = Math.max(0, subtotalValue - couponValue);
  return Math.max(0, Math.min(balanceValue, ratioCap, remainingCap));
}

// 사용 불가 사유 한 줄 (사용 가능하면 빈 문자열)
export function getPointsUnavailableReason({ balance, subtotal, policy = POINT_POLICY }) {
  const balanceValue = Math.max(0, toInteger(balance));
  const subtotalValue = Math.max(0, toInteger(subtotal));
  if (balanceValue <= 0) {
    return "";
  }
  if (balanceValue < policy.minBalanceToUse) {
    return `${formatPoints(policy.minBalanceToUse)}부터 사용할 수 있어요.`;
  }
  if (subtotalValue < policy.minOrderSubtotal) {
    return `상품금액 ${policy.minOrderSubtotal.toLocaleString("ko-KR")}원 이상 주문에서 사용할 수 있어요.`;
  }
  return "";
}

// 입력값 정규화 — 숫자만, 0~max 범위로 클램프
export function clampPointsInput(value, max) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  const number = digits ? Number(digits) : 0;
  return Math.max(0, Math.min(number, Math.max(0, toInteger(max))));
}

const KIND_LABELS = {
  review_earn: "후기 적립",
  order_use: "주문 사용",
  order_restore: "취소·환불 복구",
  reclaim: "적립 회수",
  admin_adjust: "운영 조정",
};

export function getPointKindLabel(kind) {
  return KIND_LABELS[kind] ?? "포인트";
}

export function normalizePointTransaction(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  const id = Number(row.id);
  if (!Number.isFinite(id)) {
    return null;
  }
  return {
    id,
    amount: toInteger(row.amount),
    kind: typeof row.kind === "string" ? row.kind : "",
    note: typeof row.note === "string" ? row.note : "",
    orderId: row.order_id != null ? Number(row.order_id) : null,
    orderNumber: typeof row.order_number === "string" ? row.order_number : "",
    reviewId: row.review_id != null ? Number(row.review_id) : null,
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

export function normalizeMyPoints(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    balance: Math.max(0, toInteger(source.balance)),
    expiringWithin30Days: Math.max(0, toInteger(source.expiring_within_30_days)),
    nextExpiryAt: source.next_expiry_at ?? null,
    transactions: Array.isArray(source.transactions)
      ? source.transactions.map(normalizePointTransaction).filter(Boolean)
      : [],
  };
}
