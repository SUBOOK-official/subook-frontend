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

test("mapOrderToDisplayOrder keeps item-level review availability in sync", () => {
  const order = mapOrderToDisplayOrder({
    id: 31,
    order_number: "ORD-2604-0009",
    status: "confirmed",
    total_amount: 16000,
    shipping_fee: 3500,
    items: [
      {
        id: 101,
        product_id: 9001,
        title: "수학 N제",
        condition_grade: "A+",
        quantity: 1,
        total_price: 8000,
        review_id: null,
      },
      {
        id: 102,
        product_id: 9002,
        title: "영어 모의고사",
        condition_grade: "S",
        quantity: 1,
        total_price: 8000,
        review_id: 501,
        review_rating: 5,
        review_created_at: "2026-04-12T15:00:00+09:00",
      },
    ],
  });

  assert.equal(order.canReview, true);
  assert.equal(order.items[0].canReview, true);
  assert.equal(order.items[1].canReview, false);
  assert.equal(order.items[1].reviewId, 501);
});
