import { bookConditionLabel } from "../../../../packages/shared-domain/src/status.js";
import { getSettlementInfo } from "../../../../packages/shared-domain/src/settlement.js";
import { buildMemberDashboardSummarySnapshot, mapOrderToDisplayOrder } from "./publicMypageUtils.js";
import { buildMockProductCover } from "./publicStoreMockData.js";

export const DEMO_VERSION = 4;
export const DEMO_MEMBER_USER = {
  id: "demo-member-v3",
  email: "demo@example.com",
  created_at: "2026-01-01T09:00:00+09:00",
  user_metadata: { name: "김수북", nickname: "수북체험", phone: "010-0000-0000", marketing_opt_in: false },
};
export const DEMO_MEMBER_PROFILE = {
  user_id: DEMO_MEMBER_USER.id,
  email: DEMO_MEMBER_USER.email,
  created_at: DEMO_MEMBER_USER.created_at,
  ...DEMO_MEMBER_USER.user_metadata,
};

// 로그인한 운영진도 실계정과 분리된 동일한 데모를 본다.
export function resolvePortalIdentity({ user, profile, demoMode }) {
  return demoMode
    ? { user: DEMO_MEMBER_USER, profile: DEMO_MEMBER_PROFILE }
    : { user, profile };
}

export function isDemoMember(userId) {
  return userId === DEMO_MEMBER_USER.id;
}

export function isMypageDemoLocation(location) {
  return location?.pathname === "/mypage" && new URLSearchParams(location.search).get("demo") === "1";
}

export function createDemoPortalSeed(profileOverride = {}, now = new Date()) {
  const profile = { ...DEMO_MEMBER_PROFILE, ...profileOverride, user_id: DEMO_MEMBER_USER.id };
  const ago = (days) => new Date(now.getTime() - days * 86400000).toISOString();
  const kst = new Date(now.getTime() + 9 * 3600000);
  const monthStart = (offset) => new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + offset, 1, 1)).toISOString();
  const monthCode = kst.getUTCFullYear().toString().slice(-2) + String(kst.getUTCMonth() + 1).padStart(2, "0");
  const orderItem = (key, title, price, option = "1회", extra = {}) => ({
    id: "demo-item-" + key, product_id: null, title, unit_price: price, total_price: price,
    quantity: 1, condition_grade: "S", option_label: option,
    cover_image_url: buildMockProductCover({
      publishedYear: kst.getUTCFullYear() + 1,
      subject: title.includes("수학") ? "수학" : title.includes("국어") ? "국어" : title.includes("영어") ? "영어" : "과학",
      brand: title.split(" ")[0], bookType: "예시 표지", instructorName: "운영진 체험용",
    }),
    ...extra,
  });
  const order = (key, status, days, items, extra = {}) => {
    const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    return mapOrderToDisplayOrder({
      id: "demo-order-" + key, order_number: "DEMO-" + monthCode + "-" + key, status,
      created_at: ago(days), paid_at: status === "pending" || status === "cancelled" ? null : ago(days - 0.01),
      payment_method: "card", payment_status: "paid", shipping_recipient_name: profile.name,
      shipping_fee: 3000, subtotal, total_amount: subtotal + 3000, items,
      tracking_number: ["shipping", "delivered", "confirmed"].includes(status) ? "000000000000" : null,
      confirmed_at: status === "confirmed" ? ago(days - 5) : null,
      auto_confirm_at: status === "delivered" ? ago(-3) : null,
      ...extra,
    });
  };
  const orders = [
    order("001", "pending", 0, [orderItem("001", "강남대성 수학 모의고사", 12000, "5회")], { payment_method: "bank_transfer", payment_status: "pending" }),
    order("002", "preparing", 1, [orderItem("002", "시대인재 브릿지 수학", 16000, "11~15회")]),
    order("003", "shipping", 2, [orderItem("003", "상상 국어 모의고사", 12000, "3회")], { payment_method: "bank_transfer" }),
    order("004", "delivered", 4, [orderItem("004a", "시대인재 수학 N제", 18000, "미적분"), orderItem("004b", "강남대성 국어 모의고사", 12000, "7회")], { coupon_discount_amount: 2000, points_used: 1000, total_amount: 30000 }),
    order("005", "confirmed", 10, [orderItem("005", "EBS 수능완성 영어", 14000, "영어")]),
    order("006", "cancelled", 12, [orderItem("006", "이감 국어 모의고사", 10000, "2회")], { payment_method: "bank_transfer", payment_status: "cancelled" }),
    order("007", "refunded", 14, [orderItem("007", "강남대성 수학 모의고사", 12000, "2회", { refunded_at: ago(7), refund_amount: 12000 })], { refunded_amount: 15000, payment_status: "refunded" }),
    order("008", "delivered", 6, [orderItem("008", "시대인재 물리학 모의고사", 10000, "4회")], { refund_requested_at: ago(1), refund_requested_item_ids: ["demo-item-008"], refund_request_reason: "인쇄 누락으로 문제 일부를 읽을 수 없어 환불을 신청합니다.", auto_confirm_at: null, return_progress: { status: "requested" } }),
    order("009", "confirmed", 18, [orderItem("009a", "강남대성 영어 모의고사", 12000, "6회"), orderItem("009b", "강남대성 영어 모의고사", 12000, "7회", { refunded_at: ago(10), refund_amount: 12000 })], { refunded_amount: 12000 }),
  ];

  const book = (key, title, price, statusLabel, extra = {}) => ({
    id: "demo-book-" + key, title, price, gradeLabel: bookConditionLabel.S, statusLabel,
    optionLabel: "기본 구성",
    coverImageUrl: orderItem(key, title, price).cover_image_url,
    tone: statusLabel === "판매중" ? "success" : "neutral", ...extra,
  });
  const shipment = (key, status, days, bookCount, items = [], extra = {}) => ({
    id: "demo-pickup-" + key, pickupRequestId: "demo-pickup-" + key, reference: "PU-DEMO-" + key,
    createdAt: ago(days), bookCount, status, items, compact: false, boxCount: 1,
    canCancel: status === "requested", trackingCompany: "CJ대한통운",
    trackingNumber: status === "collecting" ? "000000000000" : null, ...extra,
  });
  const shipments = [
    shipment("001", "requested", 0, 5),
    shipment("002", "scheduled", 1, 8),
    shipment("003", "collecting", 3, 12),
    shipment("004", "received", 5, 4),
    shipment("005", "inspecting", 7, 3, [
      book("005a", "시대인재 수학 N제", 18000, "검수중", { tone: "warning" }),
      book("005b", "EBS 수능완성 영어", null, "검수중", { gradeLabel: "-", tone: "warning" }),
      book("005c", "강남대성 국어 모의고사", null, "검수중", { gradeLabel: "-", tone: "warning" }),
    ]),
    shipment("006", "listed", 15, 4, [
      // 실제 공개 교재를 예시 이력에 연결한다. 거래·가격은 데모이며 클릭 후 일반 상품 화면으로 이동한다.
      book("006a", "2026 시대인재 파이널 브릿지 모의고사 수학", 24000, "판매중", {
        productId: 376, optionLabel: "10",
        coverImageUrl: "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/product-covers/sixshop/HVRELYAMS5E4.png",
      }),
      book("006b", "[수능직전 일일점검] 2027 J1 원트 미니모의고사 국어(30일분)", 8000, "판매중", {
        productId: 2371, optionLabel: "1-30회분 SET",
        coverImageUrl: "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/product-covers/edit-cover/1788761038446-vzw8vl21-KakaoTalk_Photo_2026-09-07-15-03-17.png",
      }),
      book("006c", "2026 이감 간쓸개 6모대비실전연습 국어", 16000, "판매완료", {
        productId: 2589, optionLabel: "시즌3-1",
        coverImageUrl: "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/product-covers/register/1790572632897-pussgsth-KakaoTalk_Photo_2026-09-28-14-16-16_003_studio.jpg",
      }),
      book("006d", "EBS 수능완성 영어", null, "폐기", { gradeLabel: "-", rejectionReason: "본문 필기 및 정답 표시", tone: "danger" }),
    ]),
    shipment("007", "settled", 40, 2, [book("007a", "시대인재 수학 N제 세트", 60000, "정산완료"), book("007b", "강남대성 국어 모의고사 세트", 40000, "정산완료")]),
    shipment("008", "settled", 70, 2, [book("008a", "시대인재 수학 N제", 24000, "정산완료"), book("008b", "강남대성 국어 모의고사", 16000, "정산완료")]),
  ];
  // 완료 2건은 정책 전환 전 접수한 이력: 이후 정산 시점에도 기존 요율을 유지한다.
  const completedSettlements = [100000, 40000].map((grossSales, index) => {
    const pickupDate = index === 0 ? "2026-08-01" : "2026-07-01";
    const { netAmount } = getSettlementInfo(grossSales, pickupDate);
    const date = monthStart(-index);
    shipments[6 + index].createdAt = pickupDate + "T10:00:00+09:00";
    return {
      id: "demo-settlement-" + index, date, amount: netAmount - 5000,
      pickupReference: "PU-DEMO-00" + (7 + index), bookCount: 2, grossSales,
      feeAmount: grossSales - netAmount, boxCostDeducted: 5000,
      bankLabel: "신한은행", maskedAccount: "****0000", hasAccountInfo: true,
      soldAt: new Date(new Date(date).getTime() - 10 * 86400000).toISOString(),
      confirmedAt: new Date(new Date(date).getTime() - 8 * 86400000).toISOString(),
      scheduledAt: date, completedAt: date,
    };
  });
  const seed = {
    demoVersion: DEMO_VERSION,
    profile, shipments, orders, completedSettlements,
    settlementSummary: { currentMonthAmount: completedSettlements[0].amount, totalAmount: completedSettlements.reduce((sum, row) => sum + row.amount, 0), expectedAmount: 3800 },
    // 1만6천원 판매분 수수료 45%와 박스비 5천원 차감.
    scheduledSettlements: [{ id: "demo-settlement-next", date: monthStart(1), scheduledAt: monthStart(1), soldAt: ago(8), confirmedAt: ago(1), pickupReference: "PU-DEMO-006", bookCount: 1, grossSales: 16000, feeAmount: 7200, boxCostDeducted: 5000, amount: 3800, status: "pending", statusLabel: "정산대기", tone: "warning" }],
    shippingAddresses: [{ id: "demo-address-home", user_id: profile.user_id, label: "집 (예시)", recipient_name: profile.name, recipient_phone: profile.phone, postal_code: "00000", address_line1: "데모시 데모구 예시로 123", address_line2: "101동 101호", is_default: true, created_at: ago(30), updated_at: ago(30) }],
    settlementAccounts: [{ id: "demo-account-default", user_id: profile.user_id, bank_name: "신한은행", account_number: "000-000-000000", account_holder: profile.name, is_default: true, created_at: ago(30), updated_at: ago(30) }],
  };
  seed.dashboardSummary = buildMemberDashboardSummarySnapshot(seed);
  return seed;
}

export function createDemoCoupons() {
  return ["available", "used", "expired"].map((status, index) => ({
    id: "demo-coupon-" + status, title: ["가입 환영 쿠폰 (예시)", "교재 구매 쿠폰 (예시)", "기간 한정 쿠폰 (예시)"][index],
    discount_type: "fixed", discount_value: 2000, min_order_amount: 20000, effective_status: status,
    expires_at: new Date(Date.now() + (status === "expired" ? -7 : 30) * 86400000).toISOString(),
  }));
}

export function mergePortalDemoState(storedState = {}, profileOverride = {}) {
  const seed = createDemoPortalSeed(profileOverride);
  // 초기 로딩의 빈 배열과 사용자가 모두 삭제한 빈 배열을 구분한다.
  const saved = storedState.demoVersion === DEMO_VERSION ? storedState : {};
  const state = { ...seed, ...saved, profile: { ...seed.profile, ...saved.profile } };
  state.dashboardSummary = buildMemberDashboardSummarySnapshot(state);
  return state;
}

export function confirmPortalOrder(orders = [], orderId) {
  let changed = false;
  const nextOrders = orders.map((order) => {
    if (order.id !== orderId || order.status !== "delivered" || !order.canConfirm || order.refundRequestedAt) return order;
    changed = true;
    return { ...order, status: "confirmed", canConfirm: false, canReturn: false, autoConfirmDaysRemaining: null, confirmedAt: new Date().toISOString() };
  });
  return { changed, orders: nextOrders };
}
