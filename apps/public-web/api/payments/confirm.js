// 토스페이먼츠 결제 승인 서버리스 (public-web · subook.kr/api/payments/confirm)
//
// 흐름: 결제위젯 requestPayment 성공 → successUrl(/order/payment/success)로 리다이렉트
//   → 그 페이지가 이 엔드포인트에 { paymentKey, orderId, amount } POST
//   → (1) 토스 POST /v1/payments/confirm 로 "서버에서" 승인 검증 (secretKey)
//   → (2) confirm_pg_payment RPC(service_role)로 pending→paid + books=reserved 전이
//   → (3) order_confirmed 알림톡 발사 (best-effort — 실패해도 결제는 성공으로 본다)
//
// ⚠ 의존성 없음(global fetch / Buffer만). 이 함수는 배포 스테이징 루트의 /api로 복사되어
//   frontend 워크스페이스 node_modules와 분리되므로, npm import는 런타임에 해결되지 않는다.
//   (deploy_public_web.ps1가 apps/public-web/api → 스테이징 루트 /api로 복사)
//
// ⚠ 보안 신뢰점: orderId·amount는 URL 쿼리로 넘어와 위변조 가능하지만,
//   토스 /confirm이 paymentKey↔orderId↔amount 일치를 검증하고,
//   confirm_pg_payment가 다시 amount==total_amount + pending 상태를 검증한다(이중 방어).
//   confirm_pg_payment는 authenticated에 grant되지 않아 service_role(이 함수)만 호출 가능.

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const REQUEST_TIMEOUT_MS = 10_000;

function sendError(res, status, code, message, detail) {
  const payload = { error: String(message || code), code: String(code) };
  if (detail) payload.detail = String(detail);
  return res.status(status).json(payload);
}

function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return { url, serviceKey };
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// order_confirmed 알림 (구매자) — 계좌이체 admin 흐름의 notifyOrderConfirmed와 parity.
// best-effort: CRON_SECRET 미설정이거나 실패해도 throw하지 않고 조용히 넘어간다.
async function fireOrderConfirmedNotification({ supabaseUrl, serviceKey, orderNumber }) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !orderNumber) return;
  const notifyUrl =
    process.env.NOTIFY_ENDPOINT_URL ||
    "https://admin.subook.kr/api/admin/send-notification";

  // 주문 + 첫 상품 제목 조회 (PostgREST embed)
  const query =
    `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderNumber)}` +
    `&select=id,order_number,total_amount,shipping_recipient_phone,shipping_recipient_name,user_id,order_items(title)`;
  const orderResp = await fetchWithTimeout(query, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!orderResp.ok) return;
  const rows = await orderResp.json();
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order || !order.shipping_recipient_phone) return;

  const items = order.order_items || [];
  const firstItemTitle = items[0]?.title ?? "교재";
  const extraCount = Math.max(0, items.length - 1);

  await fetchWithTimeout(notifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      notificationType: "order_confirmed",
      recipientPhone: order.shipping_recipient_phone,
      recipientName: order.shipping_recipient_name,
      recipientUserId: order.user_id,
      refType: "order",
      refId: order.id,
      templateVariables: {
        orderNumber: order.order_number,
        firstItemTitle,
        extraCount,
        totalAmount: Number(order.total_amount ?? 0).toLocaleString("ko-KR"),
      },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return sendError(res, 500, "TOSS_CONFIG_MISSING", "결제 설정이 누락되었습니다. 잠시 후 다시 시도해 주세요.");
  }

  const { url: supabaseUrl, serviceKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceKey) {
    return sendError(res, 500, "SUPABASE_CONFIG_MISSING", "서버 설정이 누락되었습니다.");
  }

  // orderId = 우리 order_number (requestPayment에 넘긴 값)
  const { paymentKey, orderId, amount } = req.body || {};
  if (!paymentKey || !orderId || amount === undefined || amount === null) {
    return sendError(res, 400, "MISSING_PARAMS", "결제 정보가 올바르지 않습니다.");
  }
  const amountNum = Number(amount);
  if (!Number.isInteger(amountNum) || amountNum < 0) {
    return sendError(res, 400, "INVALID_AMOUNT", "결제 금액이 올바르지 않습니다.");
  }

  // ── 1) 토스 결제 승인 (secretKey Basic auth) ────────────────────────────────
  let toss;
  try {
    const authHeader = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
    const tossResp = await fetchWithTimeout(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        // 멱등키: 같은 주문에 대한 중복 승인 요청을 토스 측에서 안전 처리
        "Idempotency-Key": `subook-confirm-${orderId}`,
      },
      body: JSON.stringify({ paymentKey, orderId, amount: amountNum }),
    });
    toss = await tossResp.json();
    if (!tossResp.ok) {
      // 토스 표준 에러 { code, message }
      return sendError(
        res,
        402,
        toss?.code || "TOSS_CONFIRM_FAILED",
        toss?.message || "결제 승인에 실패했습니다.",
      );
    }
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "결제 승인 응답이 지연되었습니다. 마이페이지에서 주문 상태를 확인해 주세요."
        : "결제 승인 중 오류가 발생했습니다.";
    return sendError(res, 502, "TOSS_CONFIRM_ERROR", msg, err?.message);
  }

  // 토스가 실제 승인한 금액 — confirm_pg_payment 금액검증의 기준으로 사용 (이중 방어)
  const approvedAmount = Number.isInteger(Number(toss?.totalAmount))
    ? Number(toss.totalAmount)
    : amountNum;

  // ── 2) DB paid 전이 (confirm_pg_payment RPC, service_role) ───────────────────
  let confirm;
  try {
    const rpcResp = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/confirm_pg_payment`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_order_number: orderId,
        p_payment_key: paymentKey,
        p_amount: approvedAmount,
        p_provider: "toss",
        p_raw: toss ?? null,
      }),
    });
    const rpcBody = await rpcResp.json();
    if (!rpcResp.ok) {
      // RPC 실패: 금액불일치 / 책충돌 / pending 아님 등.
      // ⚠ 토스는 이미 승인된 상태인데 DB 전이가 실패한 케이스 → 운영 개입 필요(환불 대상).
      //   명시적 로깅 후 에러 반환. (멱등 재호출 시 이미 paid면 RPC가 성공 반환)
      console.error("[payments/confirm] confirm_pg_payment failed", {
        orderId,
        paymentKey,
        approvedAmount,
        rpcBody,
      });
      return sendError(
        res,
        409,
        "ORDER_CONFIRM_FAILED",
        rpcBody?.message || "결제는 승인되었으나 주문 처리에 실패했습니다. 고객센터로 문의해 주세요.",
        rpcBody?.message,
      );
    }
    // PostgREST는 jsonb 반환값을 그대로(객체 또는 [객체])로 돌려준다.
    confirm = Array.isArray(rpcBody) ? rpcBody[0] : rpcBody;
  } catch (err) {
    console.error("[payments/confirm] rpc error", { orderId, error: err?.message });
    return sendError(res, 502, "ORDER_CONFIRM_ERROR", "주문 처리 중 오류가 발생했습니다.", err?.message);
  }

  // ── 3) order_confirmed 알림 (best-effort) ───────────────────────────────────
  await fireOrderConfirmedNotification({
    supabaseUrl,
    serviceKey,
    orderNumber: confirm?.order_number ?? orderId,
  }).catch((err) => console.error("[payments/confirm] notification error", err?.message));

  return res.status(200).json({
    success: true,
    orderId: confirm?.order_id ?? null,
    orderNumber: confirm?.order_number ?? orderId,
    status: confirm?.new_status ?? "paid",
    idempotent: Boolean(confirm?.idempotent),
  });
}
