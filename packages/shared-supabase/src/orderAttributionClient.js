// 주문/PG 세션 생성 뒤 호출하는 출처 문맥 RPC. 실패해도 결제 흐름은 계속한다.
export async function attachOrderAttributionContext({
  client,
  orderNumber,
  guestPhone = null,
  attribution,
  timeoutMs = 1500,
}) {
  if (!client || !orderNumber || !attribution) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { data, error } = await client.rpc("attach_order_attribution_context", {
        p_order_number: orderNumber,
        p_guest_phone: guestPhone,
        p_attribution: attribution,
      }).abortSignal(controller.signal);
      if (!error) return data?.recorded === true;
      if (error.code === "42501" || error.code === "PGRST202") return false;
    } catch {
      // 네트워크 실패는 한 번 재시도하고 주문/결제는 그대로 진행한다.
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}
