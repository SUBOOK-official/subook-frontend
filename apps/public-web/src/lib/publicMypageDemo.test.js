import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_MEMBER_USER, DEMO_MEMBER_PROFILE, confirmPortalOrder, createDemoPortalSeed, mergePortalDemoState, resolvePortalIdentity, isMypageDemoLocation } from "./publicMypageDemo.js";

test("demo shows current purchase and pickup stages with consistent money", () => {
  const seed = createDemoPortalSeed();
  assert.equal(seed.orders.length, 9);
  assert.equal(seed.shipments.length, 8);
  assert.deepEqual(new Set(seed.orders.map(order => order.status)), new Set(["pending", "preparing", "shipping", "delivered", "confirmed", "cancelled", "refunded"]));
  assert.equal(seed.dashboardSummary.on_sale_book_count, 2);
  assert.equal(seed.dashboardSummary.purchase_in_progress_count, 5);
  for (const order of seed.orders) {
    assert.equal(order.subtotal, order.items.reduce((sum, item) => sum + item.price, 0));
    assert.equal(order.totalAmount, order.subtotal + order.shippingFee - order.couponDiscountAmount - order.pointsUsed);
    assert.ok(order.refundedAmount <= order.totalAmount);
  }
  assert.equal(seed.settlementSummary.totalAmount, seed.completedSettlements.reduce((sum, row) => sum + row.amount, 0));
  for (const row of seed.completedSettlements) {
    assert.equal(row.amount, row.grossSales - row.feeAmount - row.boxCostDeducted);
  }
});

test("settlements use the first day of the month including year rollover", () => {
  const seed = createDemoPortalSeed({}, new Date("2026-12-31T23:30:00+09:00"));
  assert.equal(seed.scheduledSettlements[0].date, "2027-01-01T01:00:00.000Z");
  assert.equal(seed.completedSettlements[0].date, "2026-12-01T01:00:00.000Z");
});

test("demo replaces authenticated identity without changing normal identity", () => {
  const user = { id: "real-member", email: "private@example.com" };
  const profile = { name: "real profile" };
  assert.deepEqual(resolvePortalIdentity({ user, profile, demoMode: true }), { user: DEMO_MEMBER_USER, profile: DEMO_MEMBER_PROFILE });
  assert.deepEqual(resolvePortalIdentity({ user, profile, demoMode: false }), { user, profile });
});

test("confirm only an eligible delivered order and preserve unrelated samples", () => {
  const seed = createDemoPortalSeed();
  const { changed, orders } = confirmPortalOrder(seed.orders, "demo-order-004");
  assert.equal(changed, true);
  assert.equal(orders.find(order => order.id === "demo-order-004").status, "confirmed");
  assert.equal(confirmPortalOrder(orders, "demo-order-004").changed, false);
  assert.equal(confirmPortalOrder(seed.orders, "demo-order-008").changed, false);
  assert.equal(confirmPortalOrder(seed.orders, "demo-order-001").changed, false);
});

test("merge preserves local edits and deliberately emptied collections", () => {
  const seed = createDemoPortalSeed();
  const { orders } = confirmPortalOrder(seed.orders, "demo-order-004");
  const merged = mergePortalDemoState({ ...seed, orders, shippingAddresses: [], profile: { nickname: "체험수정" } });
  assert.equal(merged.profile.nickname, "체험수정");
  assert.equal(merged.dashboardSummary.purchase_in_progress_count, 4);
  assert.deepEqual(merged.shippingAddresses, []);
  assert.equal(mergePortalDemoState({ orders: [] }).orders.length, 9);
});

test("demo event suppression is scoped to the mypage demo URL", () => {
  assert.equal(isMypageDemoLocation({ pathname: "/mypage", search: "?demo=1" }), true);
  assert.equal(isMypageDemoLocation({ pathname: "/mypage", search: "" }), false);
  assert.equal(isMypageDemoLocation({ pathname: "/store", search: "?demo=1" }), false);
});
