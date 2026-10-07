import test from "node:test";
import assert from "node:assert/strict";
import { createDemoPortalSeed } from "./publicMypageDemo.js";
import { deriveShipmentMetrics, filterPurchaseOrders, filterShipmentsByStatus, getPortalHistoryIssue, getVisibleSalesShipments, groupOrdersByDate, mapOrderToDisplayOrder, mapPickupRequestToShipment } from "./publicMypageUtils.js";

test("판매자 표시 목록에서 폐기 교재·제목·권수를 제외하고 원본은 보존한다", () => {
  const seed = createDemoPortalSeed();
  const visible = getVisibleSalesShipments(seed.shipments);
  const mixed = visible.find(row => row.id === "demo-pickup-006");
  assert.equal(mixed.items.length, 3);
  assert.equal(mixed.bookCount, 3);
  assert.equal(mixed.items.some(item => item.rejectionReason), false);
  assert.equal(seed.shipments.find(row => row.id === mixed.id).items.length, 4);
  assert.equal(deriveShipmentMetrics(visible).totalBookCount, 39);
  assert.equal(deriveShipmentMetrics(visible).onSaleBookCount, 2);
  assert.equal(deriveShipmentMetrics(visible).soldBookCount, 5);
  assert.equal(visible[0].bookCount, 5); // 아직 입고되지 않은 수거의 예상 권수 보존
  assert.deepEqual(getVisibleSalesShipments([
    {id:1,status:"listed",items:[{status:"discarded"}]},
    {id:2,status:"rejected",items:[]},
    {id:3,status:"listed",items:[{statusLabel:"폐기"}]},
  ]), []);
});

test("판매 교재의 옵션·썸네일·상품 ID를 보존하고 신청 사진도 지원한다", () => {
  const row = mapPickupRequestToShipment({id:1,status:"inspected",items:[
    {id:20,title:"교재",option:"시즌3-1",product_id:10,cover_image_url:"https://example.com/book.jpg",status:"on_sale"},
    {id:21,title:"신청 교재",cover_photo_url:"https://example.com/pickup.jpg"},
  ]});
  assert.equal(row.items[0].title,"교재");
  assert.equal(row.items[0].optionLabel,"시즌3-1");
  assert.equal(row.items[0].productId,10);
  assert.equal(row.items[0].coverImageUrl,"https://example.com/book.jpg");
  assert.equal(row.items[1].productId,null);
  assert.equal(row.items[1].coverImageUrl,"https://example.com/pickup.jpg");
});

test("판매완료는 정산완료와 다르고 검수중·폐기 교재는 판매중에 합산하지 않는다", () => {
  const seed = createDemoPortalSeed();
  const metrics = deriveShipmentMetrics(seed.shipments);
  assert.equal(metrics.totalBookCount, 40);
  assert.equal(metrics.onSaleBookCount, 2);
  assert.equal(metrics.settledBookCount, 4);
  assert.equal(metrics.soldBookCount, 5);
  assert.equal(metrics.rejectedBookCount, 1);
  assert.equal(metrics.onSaleValue, 32000);
});

test("일부 판매불가·판매완료 교재가 포함된 수거도 해당 필터에서 찾는다", () => {
  const shipment = mapPickupRequestToShipment({ id: 1, status: "inspected", items: [
    { id: 1, title: "판매중", status: "on_sale", price: 12000 },
    { id: 2, title: "판매완료", status: "sold", price: 10000 },
    { id: 3, title: "정산완료", status: "settled", price: 10000 },
    { id: 4, title: "폐기", status: "discarded" },
  ] });
  for (const filter of ["on_sale", "sold", "rejected"]) assert.equal(filterShipmentsByStatus([shipment], filter).length, 1);
  assert.equal(shipment.items[1].statusLabel, "판매완료");
  assert.equal(shipment.items[2].statusLabel, "판매완료");
  assert.equal(deriveShipmentMetrics([shipment]).settledBookCount, 0);
  assert.equal(deriveShipmentMetrics([shipment]).soldBookCount, 2);
});

test("수거 취소를 검수 판매불가로 오인하지 않는다", () => {
  const cancelled = mapPickupRequestToShipment({ id: 1, status: "cancelled", item_count: 2, items: [{ id: 1, title: "교재" }] });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.items[0].isRejected, false);
  assert.equal(filterShipmentsByStatus([cancelled], "rejected").length, 0);
  assert.equal(filterShipmentsByStatus([cancelled], "in_progress").length, 0);
  assert.equal(filterShipmentsByStatus([cancelled], "cancelled").length, 1);
  assert.equal(deriveShipmentMetrics([cancelled]).rejectedBookCount, 0);
  assert.equal(deriveShipmentMetrics([cancelled]).totalBookCount, 0);
});

test("남은 재고 없는 수거는 판매완료, 전부 폐기된 수거는 판매불가로 표시한다", () => {
  const sold = mapPickupRequestToShipment({ id: 1, status: "inspected", items: [{ id: 1, status: "settled" }, { id: 2, status: "discarded" }] });
  assert.equal(sold.status, "sold");
  assert.equal(filterShipmentsByStatus([sold], "sold").length, 1);
  assert.equal(filterShipmentsByStatus([sold], "on_sale").length, 0);
  const rejected = mapPickupRequestToShipment({ id: 2, status: "inspected", items: [{ id: 2, status: "discarded" }] });
  assert.equal(rejected.status, "rejected");
});

test("부분환불·환불접수 주문도 취소 환불 필터에 포함하고 주문별 한 번만 센다", () => {
  const { orders } = createDemoPortalSeed();
  assert.equal(filterPurchaseOrders(orders, "cancelled").length, 4);
  assert.equal(filterPurchaseOrders(orders, "delivered").length, 2);
  assert.equal(filterPurchaseOrders(orders, "all", orders.find((order) => order.id === "demo-order-004").reference).length, 1);
  assert.equal(filterPurchaseOrders(orders, "all", "강남대성 영어").length, 1);
  assert.equal(filterPurchaseOrders(orders, "shipping", "존재하지 않음").length, 0);
});

test("날짜가 빠진 주문을 목록에서 조용히 누락하지 않는다", () => {
  const groups = groupOrdersByDate([{ id: 1, createdAt: "2026-10-07" }, { id: 2 }, { id: 3, createdAt: "invalid" }]);
  assert.equal(groups[0].dateKey, "2026-10-07");
  assert.deepEqual(groups[1].orders.map((order) => order.id), [2, 3]);
});

test("환불접수만 있고 반품 조회가 비어 있어도 구매확정을 노출하지 않는다", () => {
  const order = { id: 1, status: "delivered", items: [{ id: 1, total_price: 10000 }] };
  assert.equal(mapOrderToDisplayOrder(order).canConfirm, true);
  assert.equal(mapOrderToDisplayOrder({ ...order, refund_requested_at: "2026-10-07" }).canConfirm, false);
  assert.equal(mapOrderToDisplayOrder({ ...order, items: [{ id: 1, refunded_at: "2026-10-07" }] }).canConfirm, false);
});

test("API 실패·캐시는 빈 내역 대신 재시도 안내, 정상 빈 응답은 허용", () => {
  for (const source of ["local", "fallback", "empty", undefined]) {
    assert.ok(getPortalHistoryIssue({ sources: { orders: source } }, "purchases"));
  }
  assert.equal(getPortalHistoryIssue({ sources: { orders: "supabase" }, orders: [] }, "purchases"), "");
  assert.equal(getPortalHistoryIssue({ sources: { settlements: "demo" } }, "settlements"), "");
  assert.ok(getPortalHistoryIssue({ sources: { recentShipments: "fallback" } }, "sales"));
  assert.equal(getPortalHistoryIssue({}, "coupons"), "");
});
