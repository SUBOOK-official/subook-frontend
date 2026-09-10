// 주문/PG 세션 생성 뒤 호출하는 보조 RPC. 본인 확인은 DB에서 다시 수행한다.
// 결제는 계측 실패와 무관하게 진행하며, 각 시도는 짧게 제한한다.
export async function attachMetaCheckoutContext({ client, orderNumber, guestPhone = null, fbp = null, fbc = null, timeoutMs = 1500 }) {
  if (!client || !orderNumber) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { data, error } = await client.rpc("attach_meta_checkout_context", {
        p_order_number: orderNumber,
        p_guest_phone: guestPhone,
        p_fbp: fbp,
        p_fbc: fbc,
      }).abortSignal(controller.signal);
      if (!error) return data?.recorded === true;
      if (error.code === "42501" || error.code === "PGRST202") return false;
    } catch { /* 네트워크 실패는 한 번만 재시도하고 결제를 계속한다. */ }
    finally { clearTimeout(timer); }
  }
  return false;
}
