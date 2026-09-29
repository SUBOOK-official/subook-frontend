// 계측 장애는 결제를 막지 않는다. 본인/게스트 소유권은 DB에서 검증한다.
async function call(client, name, args, timeoutMs = 1500) {
  if (!client) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(timeoutMs));
      if (!error) return data;
      if (['42501', 'PGRST202'].includes(error.code)) return null;
    } catch { /* 짧은 재시도 후 사용자 흐름을 계속한다. */ }
  }
  return null;
}
export async function attachGaCheckoutContext({ client, orderNumber, guestPhone = null, context }) {
  if (!context?.clientId || !orderNumber) return false;
  const data = await call(client, 'attach_ga_checkout_context', {
    p_order_number: orderNumber, p_guest_phone: guestPhone, p_client_id: context.clientId,
    p_session_id: context.sessionId, p_experiment_variant: context.experimentVariant,
  });
  return data?.recorded === true;
}
export async function isGaPurchaseServerOwned({ client, orderNumber, guestPhone = null }) {
  const data = await call(client, 'ga_purchase_delivery_status', { p_order_number: orderNumber, p_guest_phone: guestPhone });
  return data?.server_owned === true;
}
export async function enrichGaOrderItems(client, items) {
  if (!client || !items.length) return items;
  const ids = [...new Set(items.map((item) => Number(item.productId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return items;
  try {
    const { data, error } = await client.from('products').select('id, brand, subject').in('id', ids).abortSignal(AbortSignal.timeout(2000));
    if (error) return items;
    const byId = new Map((data ?? []).map((item) => [String(item.id), item]));
    return items.map((item) => ({ ...item, brand: byId.get(String(item.productId))?.brand || item.brand, subject: byId.get(String(item.productId))?.subject || item.subject }));
  } catch { return items; }
}
