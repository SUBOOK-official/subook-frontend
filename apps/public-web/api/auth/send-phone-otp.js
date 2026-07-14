// 휴대폰 SMS 인증번호 발송 (회원 전용 · public-web /api/auth/send-phone-otp)
//
// 가입 쿠폰 어뷰징 방어 기반: 인증번호는 해시로만 저장(phone_verification_codes),
// 검증은 DB RPC verify_phone_otp. 발송 채널은 솔라피 SMS 단문.
//
// ⚠ 의존성 없음(global fetch + node crypto만). 이 함수는 배포 스테이징 루트의 /api로
//   복사되어 frontend 워크스페이스 node_modules와 분리되므로, npm import는 런타임에
//   해결되지 않는다 (payments/confirm.js와 동일 제약). Supabase 접근은 REST 직접 호출.
//
// 레이트리밋 (어뷰징 1차 방어):
//   - 유저당 재발송 쿨다운 60초
//   - 유저당 24시간 5회
//   - 번호당 24시간 8회 (여러 계정이 같은 번호를 두드리는 시그널 차단)

import { createHash, createHmac, randomBytes, randomInt } from "crypto";

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";
const SOLAPI_REQUEST_TIMEOUT_MS = 5_000;

const CODE_TTL_SEC = 300; // 5분
const RESEND_COOLDOWN_SEC = 60;
const MAX_PER_USER_PER_DAY = 5;
const MAX_PER_PHONE_PER_DAY = 8;

function makeErrorResponse({ error, code }) {
  return { success: false, error, code };
}

// 솔라피 HMAC-SHA256 인증 헤더 (admin send-notification.js와 동일 방식)
function buildSolapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendSms({ to, from, text, apiKey, apiSecret }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SOLAPI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SOLAPI_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: buildSolapiAuthHeader(apiKey, apiSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { to, from, text } }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    const failed = Array.isArray(result?.failedMessageList) && result.failedMessageList.length > 0;
    const statusCode = result?.statusCode || "";
    const ok =
      response.ok &&
      !failed &&
      !result?.errorCode &&
      (statusCode === "" || String(statusCode).startsWith("2"));

    if (ok) {
      return { success: true, messageId: result?.messageId || null };
    }
    const errorMsg =
      result?.failedMessageList?.[0]?.statusMessage ||
      result?.statusMessage ||
      result?.errorMessage ||
      `HTTP ${response.status}`;
    return { success: false, error: errorMsg };
  } catch (err) {
    return {
      success: false,
      error: err.name === "AbortError" ? "SMS 발송 시간 초과" : err.message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json(makeErrorResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }));
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_PUBLIC_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = String(process.env.SOLAPI_FROM || "").replace(/\D/g, "");

  if (!supabaseUrl || !serviceKey || !apiKey || !apiSecret || !from) {
    return res.status(500).json(makeErrorResponse({ error: "Server misconfigured", code: "CONFIG_MISSING" }));
  }

  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // 회원 인증 — Bearer 토큰의 유저를 auth REST로 확인
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json(makeErrorResponse({ error: "로그인이 필요합니다.", code: "MISSING_AUTH_TOKEN" }));
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json().catch(() => ({}));
  const userId = userData?.id;
  if (!userRes.ok || !userId) {
    return res.status(401).json(makeErrorResponse({ error: "로그인이 필요합니다.", code: "INVALID_AUTH_TOKEN" }));
  }

  // 번호 정규화·검증 (국내 휴대폰)
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
    return res.status(400).json(makeErrorResponse({ error: "올바른 휴대폰 번호를 입력해 주세요.", code: "INVALID_PHONE" }));
  }

  // 레이트리밋 (PostgREST 직접 조회 — 행 수가 상한 이하라 배열 길이로 판정)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cooldownAfter = new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000).toISOString();
  const table = `${supabaseUrl}/rest/v1/phone_verification_codes`;

  const [recentRes, userDayRes, phoneDayRes] = await Promise.all([
    fetch(`${table}?select=id&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(cooldownAfter)}&limit=1`, { headers: serviceHeaders }),
    fetch(`${table}?select=id&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(dayAgo)}&limit=${MAX_PER_USER_PER_DAY}`, { headers: serviceHeaders }),
    fetch(`${table}?select=id&phone=eq.${phone}&created_at=gte.${encodeURIComponent(dayAgo)}&limit=${MAX_PER_PHONE_PER_DAY}`, { headers: serviceHeaders }),
  ]);
  const [recent, userDay, phoneDay] = await Promise.all([
    recentRes.json().catch(() => []),
    userDayRes.json().catch(() => []),
    phoneDayRes.json().catch(() => []),
  ]);

  if (Array.isArray(recent) && recent.length > 0) {
    return res.status(429).json(makeErrorResponse({
      error: "잠시 후 다시 시도해 주세요. (재발송은 1분 간격)",
      code: "RESEND_COOLDOWN",
    }));
  }
  if (Array.isArray(userDay) && userDay.length >= MAX_PER_USER_PER_DAY) {
    return res.status(429).json(makeErrorResponse({
      error: "인증번호 발송 한도를 초과했습니다. 내일 다시 시도해 주세요.",
      code: "USER_DAILY_LIMIT",
    }));
  }
  if (Array.isArray(phoneDay) && phoneDay.length >= MAX_PER_PHONE_PER_DAY) {
    return res.status(429).json(makeErrorResponse({
      error: "해당 번호로의 인증 요청이 너무 많습니다. 내일 다시 시도해 주세요.",
      code: "PHONE_DAILY_LIMIT",
    }));
  }

  // 코드 생성·해시 저장 (평문 미저장 — verify_phone_otp RPC가 동일 해시로 비교)
  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash("sha256").update(code + userId).digest("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();

  const insertRes = await fetch(table, {
    method: "POST",
    headers: { ...serviceHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, phone, code_hash: codeHash, expires_at: expiresAt }),
  });

  if (!insertRes.ok) {
    const insertError = await insertRes.text().catch(() => "");
    console.error("Failed to store verification code:", insertRes.status, insertError.slice(0, 200));
    return res.status(500).json(makeErrorResponse({ error: "인증번호 생성에 실패했습니다.", code: "STORE_FAILED" }));
  }

  const smsResult = await sendSms({
    to: phone,
    from,
    text: `[수북] 휴대폰 인증번호는 [${code}] 입니다. 5분 안에 입력해 주세요.`,
    apiKey,
    apiSecret,
  });

  if (!smsResult.success) {
    console.error("Failed to send verification SMS:", smsResult.error);
    return res.status(502).json(makeErrorResponse({ error: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.", code: "SMS_FAILED" }));
  }

  return res.status(200).json({ success: true, expiresInSec: CODE_TTL_SEC });
}
