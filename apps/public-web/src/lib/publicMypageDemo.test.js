import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmPortalOrder,
  createDemoPortalSeed,
  mergePortalDemoState,
} from "./publicMypageDemo.js";

test("createDemoPortalSeed creates a usable dashboard seed", () => {
  const seed = createDemoPortalSeed();

  assert.equal(seed.profile.nickname, "수능킹");
  assert.equal(seed.shipments.length, 2);
  assert.equal(seed.orders.length, 2);
  assert.equal(seed.dashboardSummary.on_sale_book_count, 3);
  assert.equal(seed.dashboardSummary.purchase_in_progress_count, 1);
});

test("confirmPortalOrder confirms only the requested order", () => {
  const seed = createDemoPortalSeed();
  const { changed, orders } = confirmPortalOrder(seed.orders, "order-demo-0315");

  assert.equal(changed, true);
  assert.equal(orders[0].status, "confirmed");
  assert.equal(orders[0].canConfirm, false);
  assert.equal(orders[0].canReview, true);
  assert.equal(orders[1].status, "confirmed");
});

test("mergePortalDemoState keeps stored edits and recalculates active purchase count", () => {
  const seed = createDemoPortalSeed();
  const { orders } = confirmPortalOrder(seed.orders, "order-demo-0315");
  const merged = mergePortalDemoState({
    orders,
    profile: {
      nickname: "모의유저",
    },
  });

  assert.equal(merged.profile.nickname, "모의유저");
  assert.equal(merged.orders[0].status, "confirmed");
  assert.equal(merged.dashboardSummary.purchase_in_progress_count, 0);
});
