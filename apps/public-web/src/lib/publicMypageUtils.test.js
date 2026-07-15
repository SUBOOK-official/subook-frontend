import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberDashboardSummarySnapshot,
  filterOrdersByStatus,
  filterShipmentsByStatus,
  mapOrderToDisplayOrder,
  mapPickupRequestToShipment,
} from "./publicMypageUtils.js";

test("filterShipmentsByStatus groups shipment rows by seller progress buckets", () => {
  const shipments = [
    { id: 1, status: "requested" },
    { id: 2, status: "listed" },
    { id: 3, status: "settled" },
    { id: 4, status: "rejected" },
  ];

  assert.equal(filterShipmentsByStatus(shipments, "all").length, 4);
  assert.equal(filterShipmentsByStatus(shipments, "in_progress").length, 1);
  assert.equal(filterShipmentsByStatus(shipments, "on_sale").length, 1);
  assert.equal(filterShipmentsByStatus(shipments, "settled").length, 1);
  assert.equal(filterShipmentsByStatus(shipments, "rejected").length, 1);
});

test("mapOrderToDisplayOrder exposes payment detail fields for the order detail sheet", () => {
  const order = mapOrderToDisplayOrder({
    id: "order-1",
    order_number: "SB-20260710-1001",
    status: "preparing",
    payment_method: "kakao_pay",
    payment_status: "paid",
    pg_approved_at: "2026-07-10T12:34:56+09:00",
    created_at: "2026-07-10T12:30:00+09:00",
    subtotal: 23000,
    shipping_fee: 3000,
    coupon_discount_amount: 2000,
    total_amount: 24000,
    items: [],
  });

  assert.equal(order.reference, "SB-20260710-1001");
  assert.equal(order.paymentMethod, "kakao_pay");
  // PG 결제는 pg_approved_at을 결제일시로 사용한다.
  assert.equal(order.paidAt, "2026-07-10T12:34:56+09:00");
  assert.equal(order.subtotal, 23000);
  assert.equal(order.shippingFee, 3000);
  assert.equal(order.couponDiscountAmount, 2000);
  assert.equal(order.totalAmount, 24000);
});

test("mapOrderToDisplayOrder leaves paidAt empty for legacy orders without any payment timestamp", () => {
  const order = mapOrderToDisplayOrder({
    id: "order-2",
    order_number: "SB-20260710-1002",
    status: "pending",
    payment_method: "bank_transfer",
    payment_status: "pending",
    paid_at: null,
    pg_approved_at: null,
    created_at: "2026-07-10T12:30:00+09:00",
    subtotal: 10000,
    shipping_fee: 0,
    coupon_discount_amount: 0,
    total_amount: 10000,
    items: [],
  });

  // 결제 시각이 어디에도 없으면(미입금·paid_at 도입 전 무통장 주문)
  // 시트에서 '주문일시' 라벨로 폴백해야 한다.
  assert.equal(order.paidAt, null);
  assert.equal(order.couponDiscountAmount, 0);
});

test("mapOrderToDisplayOrder uses paid_at for bank transfers and prefers it over pg_approved_at", () => {
  // 무통장 입금확인 — 트리거가 스탬프한 paid_at이 결제일시로 쓰인다.
  const bankOrder = mapOrderToDisplayOrder({
    id: "order-3",
    order_number: "SB-20260713-1003",
    status: "preparing",
    payment_method: "bank_transfer",
    payment_status: "paid",
    paid_at: "2026-07-13T10:00:00+09:00",
    pg_approved_at: null,
    created_at: "2026-07-13T09:00:00+09:00",
    subtotal: 15000,
    shipping_fee: 3000,
    coupon_discount_amount: 0,
    total_amount: 18000,
    items: [],
  });
  assert.equal(bankOrder.paidAt, "2026-07-13T10:00:00+09:00");

  // 두 값이 모두 있으면 공통 컬럼인 paid_at이 우선.
  const pgOrder = mapOrderToDisplayOrder({
    id: "order-4",
    order_number: "SB-20260713-1004",
    status: "preparing",
    payment_method: "toss_pay",
    payment_status: "paid",
    paid_at: "2026-07-13T11:00:00+09:00",
    pg_approved_at: "2026-07-13T11:00:02+09:00",
    created_at: "2026-07-13T10:55:00+09:00",
    subtotal: 20000,
    shipping_fee: 0,
    coupon_discount_amount: 1000,
    total_amount: 19000,
    items: [],
  });
  assert.equal(pgOrder.paidAt, "2026-07-13T11:00:00+09:00");
});

test("filterOrdersByStatus keeps delivered orders inside the in-progress bucket", () => {
  const orders = [
    { id: 1, status: "pending" },
    { id: 2, status: "shipping" },
    { id: 3, status: "delivered" },
    { id: 4, status: "confirmed" },
    { id: 5, status: "cancelled" },
  ];

  assert.deepEqual(
    filterOrdersByStatus(orders, "in_progress").map((order) => order.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    filterOrdersByStatus(orders, "cancelled").map((order) => order.id),
    [5],
  );
});

test("buildMemberDashboardSummarySnapshot recalculates live purchase and settlement metrics", () => {
  const summary = buildMemberDashboardSummarySnapshot({
    baseSummary: {
      on_sale_book_count: 3,
      estimated_on_sale_value: 45000,
    },
    completedSettlements: [
      {
        id: "completed-1",
        amount: 13800,
        status: "completed",
      },
    ],
    orders: [
      { id: 1, status: "paid", totalAmount: 23000 },
      { id: 2, status: "delivered", totalAmount: 8000 },
      { id: 3, status: "confirmed", totalAmount: 4000 },
    ],
    profile: {
      user_id: "member-1",
      email: "member@example.com",
      name: "홍길동",
      nickname: "수북왕",
      phone: "010-1234-5678",
      marketing_opt_in: true,
    },
    scheduledSettlements: [
      {
        id: "pending-1",
        amount: 6600,
        status: "pending",
      },
    ],
    settlementAccounts: [{ id: 7, is_default: true }],
    settlementSummary: {
      currentMonthAmount: 13800,
      totalAmount: 13800,
      expectedAmount: 6600,
      pendingCount: 1,
      completedCount: 1,
    },
    shipments: [
      {
        id: "pickup-1",
        createdAt: "2026-04-10T10:00:00+09:00",
        status: "listed",
        items: [
          { id: "book-1", statusLabel: "판매중", tone: "success", price: 8000 },
          { id: "book-2", statusLabel: "검수중", tone: "warning", price: null },
        ],
      },
    ],
    shippingAddresses: [{ id: 11, is_default: true }],
  });

  assert.equal(summary.shipping_address_count, 1);
  assert.equal(summary.settlement_account_count, 1);
  assert.equal(summary.purchase_in_progress_count, 2);
  assert.equal(summary.estimated_settled_value, 6600);
  assert.equal(summary.current_month_settlement_total, 13800);
  assert.equal(summary.total_settlement_amount, 13800);
  assert.equal(summary.on_sale_book_count, 3);
  assert.equal(summary.latest_shipment_status, "listed");
});

test("mapPickupRequestToShipment adds richer summary labels for completed pickup rows", () => {
  const shipment = mapPickupRequestToShipment({
    id: 21,
    request_number: "PU-2604-0001",
    status: "completed",
    item_count: 2,
    created_at: "2026-04-11T09:00:00+09:00",
    items: [
      { id: 1, title: "수학 N제", original_price: 12000 },
      { id: 2, title: "국어 모의고사", original_price: 8000 },
    ],
  });

  assert.equal(shipment.summaryLabel, "교재 2권 · 정산완료");
  assert.equal(shipment.items[0].statusLabel, "정산완료");
  assert.equal(shipment.items[0].tone, "neutral");
});

// ─── 검수 결과 표면화: 브리지된 books 형태의 items 매핑 ───

const inspectedPickupRow = {
  id: 77,
  request_number: "PU-2026-0077",
  status: "inspected",
  item_count: 10, // 신청 시 예상 권수 — 실측(items)과 다름
  created_at: "2026-07-10T09:00:00Z",
  items: [
    {
      id: 9001,
      title: "시대인재 서바이벌 수학",
      option: "시즌1",
      grade: "S",
      price: 12000,
      original_price: 19000,
      status: "on_sale",
      rejection_reason: null,
      rejection_photo_urls: [],
      inspector_note: null,
      inspected_at: "2026-07-11T02:00:00Z",
    },
    {
      id: 9002,
      title: "메가스터디 수분감",
      option: null,
      grade: "A_PLUS",
      price: 8000,
      original_price: null,
      status: "settled",
      rejection_reason: null,
      rejection_photo_urls: [],
      inspector_note: null,
      inspected_at: "2026-07-11T02:00:00Z",
    },
    {
      id: 9003,
      title: "찢어진 기출문제집",
      option: null,
      grade: "DISCARD",
      price: null,
      original_price: 15000,
      status: "discarded",
      rejection_reason: "표지 파손·낙서 다수",
      rejection_photo_urls: ["https://example.com/inspect1.jpg"],
      inspector_note: "복구 불가 수준의 훼손",
      inspected_at: "2026-07-11T02:10:00Z",
    },
    {
      id: 9004,
      title: "사유 없이 폐기된 책",
      option: null,
      grade: "DISCARD",
      price: null,
      original_price: null,
      status: "discarded",
      rejection_reason: null,
      rejection_photo_urls: [],
      inspector_note: null,
      inspected_at: null,
    },
  ],
};

test("mapPickupRequestToShipment maps inspected books with grade, price, and status chips", () => {
  const shipment = mapPickupRequestToShipment(inspectedPickupRow);

  // 실측 권수(4)가 예상 권수(10)를 대체
  assert.equal(shipment.bookCount, 4);

  const [onSale, settled, discarded] = shipment.items;

  // 판매중 책: 옵션 병기 제목 + 확정 판매가 + 판매중 칩
  assert.equal(onSale.title, "시대인재 서바이벌 수학 (시즌1)");
  assert.equal(onSale.price, 12000);
  assert.equal(onSale.isRejected, false);
  assert.equal(onSale.statusLabel, "판매중");
  assert.equal(onSale.tone, "success");

  // 정산완료 책
  assert.equal(settled.statusLabel, "정산완료");
  assert.equal(settled.isRejected, false);

  // 폐기 책: 사유·사진·메모 노출 + 판매불가 칩
  assert.equal(discarded.isRejected, true);
  assert.equal(discarded.statusLabel, "판매불가");
  assert.equal(discarded.tone, "danger");
  assert.equal(discarded.rejectionReason, "표지 파손·낙서 다수");
  assert.deepEqual(discarded.rejectionPhotoUrls, ["https://example.com/inspect1.jpg"]);
  assert.equal(discarded.inspectorNote, "복구 불가 수준의 훼손");
});

test("mapPickupRequestToShipment flags reason-less discarded books as rejected", () => {
  const shipment = mapPickupRequestToShipment(inspectedPickupRow);
  const reasonless = shipment.items[3];

  // 사유 미입력이어도 status='discarded'면 판매불가로 판정 (사유는 '사유 미입력'으로 렌더)
  assert.equal(reasonless.isRejected, true);
  assert.equal(reasonless.statusLabel, "판매불가");
  assert.equal(reasonless.rejectionReason, null);
});

test("mapPickupRequestToShipment keeps legacy pickup_items shape working", () => {
  const shipment = mapPickupRequestToShipment({
    id: 78,
    request_number: "PU-2026-0078",
    status: "pending",
    item_count: 2,
    created_at: "2026-07-12T09:00:00Z",
    items: [
      { id: 1, title: "레거시 신청 교재", original_price: 15000 },
    ],
  });

  const [legacyItem] = shipment.items;
  assert.equal(legacyItem.title, "레거시 신청 교재");
  // 확정가 없으면 정가 fallback
  assert.equal(legacyItem.price, 15000);
  assert.equal(legacyItem.isRejected, false);
  // 책 상태가 없으면 신청 단계 라벨로 fallback
  assert.equal(legacyItem.statusLabel, "신청완료");
});
