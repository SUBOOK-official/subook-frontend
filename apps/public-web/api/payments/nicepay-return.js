// 나이스페이먼츠 결제창(Server 승인 모델) returnUrl 수신 서버리스
// (public-web · subook.kr/api/payments/nicepay-return)
//
// 흐름(2026-08-03 개편 — 카드 '선주문 생성' 폐지): 주문 페이지는 주문 대신
//   결제 세션(create_pg_checkout_session — 재고 미선점)만 만들고 AUTHNICE.requestPay(결제창)
//   → 카드 인증 완료 → 나이스페이가 이 엔드포인트로 인증 결과를 **POST**(form-urlencoded) →
//   (1) signature(sha256) 위변조 검증
//   (2) finalize_pg_checkout_session RPC(service_role) — **이때 비로소 주문 생성**
//       (재고·쿠폰·금액 전부 재검증. 실패하면 승인을 안 하므로 청구 없음)
//   (3) 나이스페이 승인 API POST /v1/payments/{tid} 호출 (Basic clientKey:secretKey)
//   (4) confirm_pg_payment RPC(service_role)로 pending→preparing + books=reserved 전이
//   (5) order_confirmed 알림톡 발사 (best-effort)
//   (6) 브라우저를 /order/complete/:id 로 303 리다이렉트
//   실패 시 /order/payment/fail?message=&code= 으로 리다이렉트.
//
// 결제창을 그냥 닫고 이탈하면 세션만 남는다 — 주문·입금대기·재고 선점·카트 비움이
//   전혀 없다(과거엔 pending 주문이 30분간 책을 품절로 만들던 문제의 근본 수리).
// 구플로우 호환: 배포 직전 구코드로 열린 결제창(주문 선생성)은 세션이 없으므로,
//   기존 주문이 존재하면 예전 방식(승인→confirm)으로 그대로 이어간다.
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

function failRedirect(res, message, code, orderNumber) {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  if (code) params.set("code", String(code));
  // orderNumber가 있으면 fail 페이지가 본인 pending 카드 주문을 자동 취소한다(재고 해제)
  if (orderNumber) params.set("orderId", String(orderNumber));
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

// 결제 세션 → 주문 실체화 (카드 인증 성공·서명 검증 후에만 호출).
// 성공 시 pending 주문이 생성되고(재고 선점 시작), 실패 시 주문이 없으므로
// 호출자는 승인 API를 호출하지 않는다(= 청구 없음).
async function finalizeCheckoutSession({ supabaseUrl, serviceKey, orderNumber, amount }) {
  const resp = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/finalize_pg_checkout_session`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_order_number: orderNumber, p_amount: amount }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    // RPC exception (재고 선점 충돌·쿠폰 사용 불가·금액 불일치 등) — message에 원인
    return { ok: false, reason: "rpc_error", message: body?.message || `finalize http ${resp.status}` };
  }
  const result = Array.isArray(body) ? body[0] : body;
  if (!result?.success) {
    return { ok: false, reason: result?.reason || "unknown", message: null };
  }
  return { ok: true, ...result };
}

// 구플로우 호환 — 세션이 없을 때, 배포 전 구코드가 선생성한 pending 주문이 있는지 확인
async function findExistingOrder({ supabaseUrl, serviceKey, orderNumber }) {
  const resp = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderNumber)}` +
      `&select=id,status,payment_status`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => null);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}

// finalize 실패 사유 → 사용자 친화 문구 (승인 미진행 = 청구 없음이 핵심 안내)
function toFriendlyFinalizeMessage(finalize) {
  const raw = (finalize?.message || "").toLowerCase();
  if (raw.includes("not available") || raw.includes("already reserved")) {
    return "결제 진행 중에 다른 분이 먼저 구매한 교재가 있어 결제를 진행하지 않았어요. 카드 청구는 발생하지 않았습니다.";
  }
  if (finalize?.reason === "amount_mismatch" || raw.includes("금액")) {
    return "주문 금액이 변경되어 결제를 진행하지 않았어요. 장바구니에서 다시 시도해 주세요.";
  }
  if (finalize?.reason === "session_expired") {
    return "결제 세션이 만료되었어요. 장바구니에서 다시 시도해 주세요.";
  }
  if (finalize?.message && /[가-힣]/.test(finalize.message)) return finalize.message;
  return "주문 처리에 실패해 결제를 진행하지 않았어요. 잠시 후 다시 시도해 주세요.";
}

// 미결제 pending 주문 즉시 취소 → 재고(books) 선점 해제 (트리거가 릴리스).
// ⚠ 서명이 검증된 실패 분기에서만 호출할 것 — 인증실패(authResultCode≠0000) POST는
//   서명이 없어 위조 가능하므로 여기서 취소하면 임의 주문 취소 공격이 가능해진다.
//   (그 케이스는 fail 페이지가 본인 인증된 cancel_member_order로 처리 + 30분 자동만료 백스톱)
async function cancelUnpaidOrder({ supabaseUrl, serviceKey, orderNumber }) {
  const resp = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/cancel_unpaid_order`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_order_number: orderNumber }),
  });
  const body = await resp.json().catch(() => null);
  return Boolean(resp.ok && body?.success);
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

  // 인증 실패/이탈 — 신플로우에선 아직 주문이 없으므로 정리할 것도 없다(세션만 잔류).
  // orderId는 구플로우(선생성 주문) 호환용으로만 fail 페이지에 넘긴다 — 본인 인증된
  // cancel_member_order로 정리(신플로우 세션 번호는 주문 조회에 안 걸려 자연 무시).
  if (authResultCode !== "0000") {
    return failRedirect(
      res,
      authResultMsg || "카드 인증이 완료되지 않았습니다.",
      authResultCode || "AUTH_FAILED",
      orderId,
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

  // ── 2) 결제 세션 → 주문 실체화 ───────────────────────────────────────────────
  // 카드 주문은 결제창 오픈 시점에 만들어지지 않는다(2026-08-03 — 이탈 시 입금대기
  // 주문·재고 선점이 남던 문제 제거). 인증이 성공한 지금 주문을 생성하고, 주문 생성이
  // 성공한 경우에만 승인 API를 호출한다. 실패하면 승인 자체를 안 하므로 청구가 없다.
  const finalize = await finalizeCheckoutSession({
    supabaseUrl,
    serviceKey,
    orderNumber: orderId,
    amount: amountNum,
  }).catch((err) => ({ ok: false, reason: "network", message: err?.message }));

  if (finalize.ok && finalize.already_completed && finalize.payment_status === "paid") {
    // 중복 POST(새로고침 등) — 이미 결제 확정까지 끝난 주문 → 완료 페이지로
    return redirectTo(res, `/order/complete/${finalize.order_id}`);
  }
  if (!finalize.ok) {
    if (finalize.reason === "session_not_found") {
      // 배포 전 구플로우(선생성 주문)로 열린 결제창 — 주문이 이미 있으면 기존 방식으로 진행
      const existing = await findExistingOrder({ supabaseUrl, serviceKey, orderNumber: orderId }).catch(
        () => null,
      );
      if (!existing) {
        console.error("[nicepay-return] checkout session not found", { orderId, tid });
        return failRedirect(
          res,
          "결제 세션을 찾을 수 없어 결제를 진행하지 않았어요. 장바구니에서 다시 시도해 주세요.",
          "SESSION_NOT_FOUND",
        );
      }
      // existing 주문으로 아래 승인 → confirm_pg_payment 진행 (구플로우와 동일)
    } else {
      // 재고 선점 충돌·쿠폰 사용 불가·금액 불일치 등 — 승인 미진행 = 청구 없음.
      // 주문이 만들어지지 않았으므로(전체 롤백) 정리할 것도 없다.
      console.error("[nicepay-return] finalize failed — approval skipped", {
        orderId,
        tid,
        reason: finalize.reason,
        message: finalize.message,
      });
      return failRedirect(
        res,
        toFriendlyFinalizeMessage(finalize),
        finalize.reason === "rpc_error" ? "ORDER_CREATE_FAILED" : String(finalize.reason || "").toUpperCase(),
      );
    }
  }

  // ── 3) 승인 API — POST /v1/payments/{tid} ────────────────────────────────────
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
    const netCancelResult = await netCancel({ apiBase, authHeader, orderId }).catch((e) => {
      console.error("[nicepay-return] netcancel failed", { orderId, error: e?.message });
      return null;
    });
    if (netCancelResult?.resultCode === "0000") {
      // 망취소로 결제가 확실히 원복됨 → 주문도 취소해 재고를 즉시 푼다
      await cancelUnpaidOrder({ supabaseUrl, serviceKey, orderNumber: orderId }).catch(() => {});
    }
    return failRedirect(
      res,
      "결제 승인 응답이 지연되었습니다. 잠시 후 마이페이지에서 주문 상태를 확인해 주세요.",
      "APPROVE_TIMEOUT",
    );
  }

  // 성공 판정: resultCode 0000 + status paid
  if (approve.resultCode !== "0000" || approve.status !== "paid") {
    // 승인 실패 확정(서명 검증된 요청) → 주문 취소로 재고 즉시 해제
    await cancelUnpaidOrder({ supabaseUrl, serviceKey, orderNumber: orderId }).catch(() => {});
    return failRedirect(
      res,
      approve.resultMsg || "결제 승인에 실패했습니다.",
      approve.resultCode || "APPROVE_FAILED",
      orderId,
    );
  }

  // 나이스페이가 실제 승인한 금액 — confirm_pg_payment 금액검증의 기준으로 사용 (이중 방어)
  const approvedAmount = Number.isInteger(Number(approve.amount))
    ? Number(approve.amount)
    : amountNum;

  // ── 4) DB 결제 확정 전이 — pending→preparing (confirm_pg_payment RPC, service_role) ──
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
    if (cancelled) {
      // 결제가 전액취소됐으니 주문도 취소해 재고를 즉시 푼다.
      // (⚠ 결제취소 실패 시엔 주문을 pending으로 남긴다 — 수동 환불 처리의 앵커)
      await cancelUnpaidOrder({ supabaseUrl, serviceKey, orderNumber: orderId }).catch(() => {});
    } else {
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

  // ── 5) order_confirmed 알림 (best-effort) ───────────────────────────────────
  await fireOrderConfirmedNotification({
    supabaseUrl,
    serviceKey,
    orderNumber: confirm?.order_number ?? orderId,
  }).catch((err) => console.error("[nicepay-return] notification error", err?.message));

  // ── 6) 주문완료 페이지로 복귀 (state 없이 진입해도 RPC로 재조회하는 페이지) ───
  const destination = confirm?.order_id ? `/order/complete/${confirm.order_id}` : "/mypage";
  return redirectTo(res, destination);
}
