// 주문 조회 RPC의 기존 응답 계약을 유지하면서 구매자 신청 품목을 연결한다.
// RLS가 구매자 본인 또는 관리자 조회만 허용한다.
export async function attachRefundRequestItems(client, orders) {
  const orderIds = orders.filter(order => order.refund_requested_at).map(order => order.id);
  let rows = [];
  let failed = false;
  if (orderIds.length) {
    try {
      const result = await client.from("order_refund_request_items")
        .select("order_id,order_item_id").in("order_id", orderIds);
      if (result.error) throw result.error;
      rows = result.data ?? [];
    } catch {
      failed = true;
    }
  }
  return orders.map(order => ({
    ...order,
    refund_requested_item_ids: rows.filter(row => String(row.order_id) === String(order.id)).map(row => row.order_item_id),
    // 조회 실패를 '과거 신청의 대상 미기록'으로 오인하지 않는다.
    refund_request_items_error: Boolean(order.refund_requested_at) && failed,
  }));
}
