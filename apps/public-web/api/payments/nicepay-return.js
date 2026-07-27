// 나이스페이먼츠 결제창(Server 승인 모델) returnUrl 수신 서버리스
// (public-web · subook.kr/api/payments/nicepay-return)
//
// 흐름: 주문 페이지 AUTHNICE.requestPay(결제창) → 카드 인증 완료 → 나이스페이가 이
//   엔드포인트로 인증 결과를 **POST**(form-urlencoded) →
//   (1) signature(sha256) 위변조 검증
//   (2) 나이스페이 승인 API POST /v1/payments/{tid} 호출 (Basic clientKey:secretKey)
//   (3) confirm_pg_payment RPC(service_role)로 pending→preparing + books=reserved 전이
//   (4) order_confirmed 알림톡 발사 (best-effort)
//   (5) 브라우저를 /order/complete/:id 로 303 리다이렉트
//   실패 시 /order/payment/fail?message=&code= 으로 리다이렉트.
//
// 토스(confirm.js)와의 차이: 토스는 successUrl(GET)로 복귀한 SPA가 승인을 요청하지만,
//   나이스페이는 returnUrl로 서버에 직접 POST가 온다(PC 레이어/모바일 리다이렉트 동일).
//
// ⚠ 의존성 없음(global fetch / Buffer / node:crypto만). deploy_public_web.ps1가 이 폴더를
//   스테이징 루트 /api로 복사하므로 npm import는 런타임에 해결되지 않는다.
//
// ⚠ 승인 이후 DB 확정(RPC)이 실패하면 결제를 즉시 전액취소한다(토스 confirm.js와 다른 점).
//   금액 불일치·주문 상태 충돌·재고 충돌 등 어떤 실패에서도 고객 돈이 묶이지 않게 하는
//   방어이며, 취소마저 실패하면 CRITICAL 로그를 남기고 고객센터 안내로 빠진다.

import { createHash } from "node:crypto";

const REQUEST_TIMEOUT_MS = 10_000;
const PROD_API_BASE = "https://api.nicepay.co.kr";
const SANDBOX_API_BASE = "https://sandbox-api.nicepay.co.kr";

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function getNicepayConfig() {
  const clientKey = process.env.NICEPAY_CLIENT_KEY || "";
  const secretKey = process.env.NICEPAY_SECRET_KEY || "";
  // 샌드박스 키(S2_ 접두사)면 샌드박스 API로 자동 라우팅. 명시 override도 지원.
  const apiBase =
    process.env.NICEPAY_API_BASE ||
    (clientKey.startsWith("S2_") ? SANDBOX_API_BASE : PROD_API_BASE);
  return { clientKey, secretKey, apiBase };
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

function redirectTo(res, location) {
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function failRedirect(res, message, code) {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  if (code) params.set("code", String(code));
  const qs = params.toString();
  return redirectTo(res, `/order/payment/fail${qs ? `?${qs}` : ""}`);
}

// 나이스페이는 form-urlencoded POST로 보낸다. Vercel이 req.body를 객체로 파싱해 주지만,
// 문자열로 오는 런타임 변형(로컬 셔틀 등)도 방어적으로 처리한다.
function parseBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "object") return body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  return {};
}

// 승인 타임아웃 등 결과 불확실 시 원복 — 망취소(요청 후 1시간 내 유효)
async function netCancel({ apiBase, authHeader, orderId }) {
  const resp = await fetchWithTimeout(`${apiBase}/v1/payments/netcancel`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({ orderId }),
  });
  return resp.json().catch(() => null);
}

// 승인 후 주문 확정 실패 시 전액취소
async function cancelPayment({ apiBase, authHeader, tid, orderId, reason }) {
  const resp = await fetchWithTimeout(
    `${apiBase}/v1/payments/${encodeURIComponent(tid)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({ reason, orderId }),
    },
  );
  return resp.json().catch(() => null);
}

// order_confirmed 알림 (구매자) — 토스 confirm.js의 fireOrderConfirmedNotification과 동일.
// best-effort: CRON_SECRET 미설정이거나 실패해도 throw하지 않고 조용히 넘어간다.
async function fireOrderConfirmedNotification({ supabaseUrl, serviceKey, orderNumber }) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !orderNumber) return;
  const notifyUrl =
    process.env.NOTIFY_ENDPOINT_URL ||
    "https://admin.subook.kr/api/admin/send-notification";

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
  const itemSummary = extraCount > 0 ? `${firstItemTitle} 외 ${extraCount}건` : firstItemTitle;

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
        itemSummary,
        totalAmount: Number(order.total_amount ?? 0).toLocaleString("ko-KR"),
      },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // 결제창 복귀 외의 직접 접근(GET 등)은 홈으로 돌려보낸다.
    return redirectTo(res, "/");
  }

  const { clientKey, secretKey, apiBase } = getNicepayConfig();
  const { url: supabaseUrl, serviceKey } = getSupabaseConfig();
  if (!clientKey || !secretKey || !supabaseUrl || !serviceKey) {
    console.error("[nicepay-return] config missing", {
      hasClientKey: Boolean(clientKey),
      hasSecretKey: Boolean(secretKey),
      hasSupabase: Boolean(supabaseUrl && serviceKey),
    });
    return failRedirect(res, "결제 설정이 누락되었습니다. 잠시 후 다시 시도해 주세요.", "CONFIG_MISSING");
  }

  const body = parseBody(req);
  const authResultCode = String(body.authResultCode ?? "");
  const authResultMsg = String(body.authResultMsg ?? "");
  const tid = String(body.tid ?? "");
  const orderId = String(body.orderId ?? ""); // = 우리 order_number (requestPay에 넘긴 값)
  const amountRaw = String(body.amount ?? "");
  const authToken = String(body.authToken ?? "");
  const signature = String(body.signature ?? "");
  const bodyClientId = String(body.clientId ?? "");

  // 인증 실패/이탈 — 주문은 pending으로 남아 24시간 뒤 자동 취소된다.
  if (authResultCode !== "0000") {
    return failRedirect(
      res,
      authResultMsg || "카드 인증이 완료되지 않았습니다.",
      authResultCode || "AUTH_FAILED",
    );
  }
  if (!tid || !orderId || !amountRaw || !authToken || !signature) {
    return failRedirect(res, "결제 정보가 올바르지 않습니다.", "MISSING_PARAMS");
  }
  const amountNum = Number(amountRaw);
  if (!Number.isInteger(amountNum) || amountNum <= 0) {
    return failRedirect(res, "결제 금액이 올바르지 않습니다.", "INVALID_AMOUNT");
  }
  if (bodyClientId && bodyClientId !== clientKey) {
    console.error("[nicepay-return] clientId mismatch", { orderId, bodyClientId });
    return failRedirect(res, "결제 정보 검증에 실패했습니다.", "CLIENT_MISMATCH");
  }

  // ── 1) 위변조 검증: hex(sha256(authToken + clientId + amount + secretKey)) ────
  const expectedSignature = sha256Hex(`${authToken}${clientKey}${amountRaw}${secretKey}`);
  if (expectedSignature !== signature) {
    console.error("[nicepay-return] signature mismatch", { orderId, tid });
    return failRedirect(res, "결제 정보 검증에 실패했습니다.", "SIGNATURE_MISMATCH");
  }

  // ── 2) 승인 API — POST /v1/payments/{tid} ────────────────────────────────────
  const authHeader = "Basic " + Buffer.from(`${clientKey}:${secretKey}`).toString("base64");
  let approve;
  try {
    const ediDate = new Date().toISOString();
    const signData = sha256Hex(`${tid}${amountRaw}${ediDate}${secretKey}`);
    const resp = await fetchWithTimeout(`${apiBase}/v1/payments/${encodeURIComponent(tid)}`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({ amount: amountNum, ediDate, signData }),
    });
    approve = await resp.json().catch(() => null);
    if (!approve || typeof approve.resultCode === "undefined") {
      throw new Error(`approve response invalid (http ${resp.status})`);
    }
  } catch (err) {
    // 타임아웃/네트워크 오류 — 승인 결과 불확실 → 망취소로 원복 시도
    console.error("[nicepay-return] approve error", { orderId, tid, error: err?.message });
    await netCancel({ apiBase, authHeader, orderId }).catch((e) =>
      console.error("[nicepay-return] netcancel failed", { orderId, error: e?.message }),
    );
    return failRedirect(
      res,
      "결제 승인 응답이 지연되었습니다. 잠시 후 마이페이지에서 주문 상태를 확인해 주세요.",
      "APPROVE_TIMEOUT",
    );
  }

  // 성공 판정: resultCode 0000 + status paid
  if (approve.resultCode !== "0000" || approve.status !== "paid") {
    return failRedirect(
      res,
      approve.resultMsg || "결제 승인에 실패했습니다.",
      approve.resultCode || "APPROVE_FAILED",
    );
  }

  // 나이스페이가 실제 승인한 금액 — confirm_pg_payment 금액검증의 기준으로 사용 (이중 방어)
  const approvedAmount = Number.isInteger(Number(approve.amount))
    ? Number(approve.amount)
    : amountNum;

  // ── 3) DB 결제 확정 전이 — pending→preparing (confirm_pg_payment RPC, service_role) ──
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
        p_payment_key: tid,
        p_amount: approvedAmount,
        p_provider: "nicepay",
        p_raw: approve ?? null,
      }),
    });
    const rpcBody = await rpcResp.json().catch(() => null);
    if (!rpcResp.ok) {
      throw new Error(rpcBody?.message || `confirm_pg_payment http ${rpcResp.status}`);
    }
    confirm = Array.isArray(rpcBody) ? rpcBody[0] : rpcBody;
  } catch (err) {
    // 승인은 났는데 주문 확정 실패(금액 불일치·상태 충돌·재고 충돌 등) →
    // 고객 돈이 묶이지 않도록 즉시 전액취소를 시도한다.
    console.error("[nicepay-return] confirm_pg_payment failed — auto-cancel", {
      orderId,
      tid,
      approvedAmount,
      error: err?.message,
    });
    const cancelResult = await cancelPayment({
      apiBase,
      authHeader,
      tid,
      orderId,
      reason: "주문 확정 실패 자동취소",
    }).catch(() => null);
    const cancelled = cancelResult?.resultCode === "0000";
    if (!cancelled) {
      console.error("[nicepay-return] CRITICAL: 승인 후 확정·취소 모두 실패 — 수동 환불 필요", {
        orderId,
        tid,
        cancelResult,
      });
    }
    return failRedirect(
      res,
      cancelled
        ? "주문 처리에 실패해 결제를 자동 취소했습니다. 다른 분이 먼저 구매했을 수 있으니 장바구니를 확인해 주세요."
        : "결제는 승인되었으나 주문 처리에 실패했습니다. 고객센터로 문의해 주세요.",
      "ORDER_CONFIRM_FAILED",
    );
  }

  // ── 4) order_confirmed 알림 (best-effort) ───────────────────────────────────
  await fireOrderConfirmedNotification({
    supabaseUrl,
    serviceKey,
    orderNumber: confirm?.order_number ?? orderId,
  }).catch((err) => console.error("[nicepay-return] notification error", err?.message));

  // ── 5) 주문완료 페이지로 복귀 (state 없이 진입해도 RPC로 재조회하는 페이지) ───
  const destination = confirm?.order_id ? `/order/complete/${confirm.order_id}` : "/mypage";
  return redirectTo(res, destination);
}
