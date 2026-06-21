import { createClient } from "@supabase/supabase-js";

// 관리자 환불 — PG(토스) 주문은 결제 취소 API를 먼저 호출하고, 그 다음 DB 환불(admin_refund_order).
// 계좌이체 주문은 토스 취소를 건너뛰고 기존처럼 admin_refund_order만 (운영자가 수동 송금).
//
// 순서(토스 취소 우선)의 이유: 토스 취소가 실패하면 DB는 건드리지 않아 "환불됐다는데 돈은 안 옴"
// 같은 구매자 불리 상태를 피한다. 토스 취소 성공 후 admin_refund_order가 RECOVERY_REQUIRED_ACK로
// 막혀도(셀러 정산 이미 송금), 손실확인 후 재호출 시 토스 취소는 멱등(이미취소=성공)이라 안전하다.

const TOSS_CANCEL_BASE = "https://api.tosspayments.com/v1/payments";
const TOSS_TIMEOUT_MS = 10_000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL;
  const anonKey = process.env.SUPABASE_ADMIN_ANON_KEY || process.env.VITE_SUPABASE_ADMIN_ANON_KEY;
  return { url, anonKey };
}

function parseBearerToken(authHeader) {
  const raw = String(authHeader || "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function makeErrorResponse({ error, code, detail }) {
  const payload = { error: String(error || "Request failed."), code: String(code || "UNKNOWN") };
  if (detail) payload.detail = String(detail);
  return payload;
}

async function assertAdminUser(accessToken) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    const error = new Error("SUPABASE_CONFIG_MISSING");
    error.statusCode = 500;
    throw error;
  }
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userResult?.user) {
    const error = new Error("UNAUTHORIZED");
    error.statusCode = 401;
    throw error;
  }
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin_user");
  if (adminError || !isAdmin) {
    const error = new Error("FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }
  return supabase;
}

async function fetchWithTimeout(url, options, timeoutMs = TOSS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 토스 결제 취소. 이미 취소된 건은 멱등 성공으로 간주.
async function cancelTossPayment({ paymentKey, reason }) {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return { ok: false, code: "TOSS_CONFIG_MISSING", message: "결제 취소 설정이 누락되었습니다." };
  }
  try {
    const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
    const resp = await fetchWithTimeout(`${TOSS_CANCEL_BASE}/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "Idempotency-Key": `subook-cancel-${paymentKey}`,
      },
      body: JSON.stringify({ cancelReason: (reason && String(reason).slice(0, 200)) || "관리자 환불" }),
    });
    const body = await resp.json();
    if (resp.ok) return { ok: true, body };
    // 이미 취소된 결제 → 멱등 성공 (재시도/중복 호출 방어)
    if (body?.code === "ALREADY_CANCELED_PAYMENT") return { ok: true, body, alreadyCanceled: true };
    return { ok: false, code: body?.code || "TOSS_CANCEL_FAILED", message: body?.message || "결제 취소에 실패했습니다." };
  } catch (err) {
    return {
      ok: false,
      code: "TOSS_CANCEL_ERROR",
      message: err?.name === "AbortError" ? "결제 취소 응답이 지연되었습니다." : "결제 취소 중 오류가 발생했습니다.",
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json(makeErrorResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }));
  }

  const accessToken = parseBearerToken(req.headers.authorization);
  if (!accessToken) {
    return res.status(401).json(makeErrorResponse({ error: "Missing auth token", code: "MISSING_AUTH_TOKEN" }));
  }

  let supabase;
  try {
    supabase = await assertAdminUser(accessToken);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json(makeErrorResponse({ error: err.message, code: err.message }));
  }

  const { orderId, reason, acknowledgeRecovery } = req.body || {};
  if (!orderId) {
    return res.status(400).json(makeErrorResponse({ error: "orderId is required", code: "MISSING_ORDER_ID" }));
  }

  // 주문 조회 — 결제수단/토스 paymentKey 확인 (admin RLS로 조회 가능)
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_method, payment_key, total_amount")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) {
    return res.status(404).json(makeErrorResponse({ error: "주문을 찾을 수 없습니다.", code: "ORDER_NOT_FOUND" }));
  }

  // 1) PG 주문이면 토스 결제 취소 먼저. 계좌이체(payment_key 없음)는 건너뜀.
  let pgCancelled = false;
  if (order.payment_key) {
    const cancelRes = await cancelTossPayment({ paymentKey: order.payment_key, reason });
    if (!cancelRes.ok) {
      // 토스 취소 실패 → DB는 건드리지 않고 종료 (구매자 불리 상태 방지)
      return res.status(502).json(makeErrorResponse({ error: cancelRes.message, code: cancelRes.code }));
    }
    pgCancelled = true;
  }

  // 2) DB 환불 (정산 취소/회수 표시 · reserved 재고 복원 · 쿠폰 복구). admin 권한으로 호출.
  const { data, error } = await supabase.rpc("admin_refund_order", {
    p_order_id: orderId,
    p_reason: reason ?? null,
    p_acknowledge_recovery: Boolean(acknowledgeRecovery),
  });
  if (error) {
    // RECOVERY_REQUIRED_ACK 등은 메시지를 그대로 전달 → 프론트가 손실확인 모달로 분기.
    // (이 시점 토스 취소는 이미 됐고 멱등이라, 손실확인 후 재호출해도 안전)
    return res.status(409).json(makeErrorResponse({ error: error.message, code: "REFUND_RPC_ERROR" }));
  }

  return res.status(200).json({ success: true, data, pg_cancelled: pgCancelled });
}
