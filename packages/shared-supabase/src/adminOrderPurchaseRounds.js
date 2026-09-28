// 화면에 보이는 주문 ID만 전달하며 전체 구매 이력 집계와 권한 확인은 DB에서 수행한다.
export async function getAdminOrderPurchaseRounds(client, orders) {
  const orderIds = [...new Set(orders.map((order) => order.id))];
  if (orderIds.length === 0) return {};

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await client
        .rpc("admin_order_purchase_rounds", { p_order_ids: orderIds })
        .abortSignal(AbortSignal.timeout(10000));
      if (error) throw error;
      return data ?? {};
    } catch (error) {
      lastError = error;
      if (error.code === "42501" || error.code === "22023") break;
    }
  }
  throw lastError;
}
