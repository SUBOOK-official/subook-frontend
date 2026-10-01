// Supabase Send SMS Hook. Web Request로 원문을 읽어 서명 검증 전 JSON 재직렬화를 피한다.
// https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
// https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendSolapiMessage } from "./send-phone-otp.js";

export function verifySmsHook(raw, headers, secret, now = Date.now()) {
  const id = headers.get("webhook-id") || "";
  const timestamp = headers.get("webhook-timestamp") || "";
  if (!/^[\w-]{1,200}$/.test(id) || !/^\d{10}$/.test(timestamp)
    || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(String(secret || "").replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  if (key.length < 24) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
  return (headers.get("webhook-signature") || "").split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const actual = Buffer.from(signature, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

const failure = (status, message) => Response.json({ error: { http_code: status, message } }, { status });

export async function handleSmsHook(request) {
  if (request.method !== "POST") return failure(405, "POST required");
  const raw = await request.text();
  if (raw.length > 32768) return failure(413, "Payload too large");
  const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
  if (!secret) return failure(503, "인증 서비스 준비 중입니다.");
  if (!verifySmsHook(raw, request.headers, secret)) return failure(401, "Invalid webhook signature");
  let payload;
  try { payload = JSON.parse(raw); } catch { return failure(400, "Invalid JSON"); }
  const phone = String(payload.user?.phone || "").replace(/^\+?82/, "0");
  const code = String(payload.sms?.otp || "");
  if (!/^010\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return failure(400, "국내 휴대폰 번호를 확인해 주세요.");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_FROM;
  if (!url || !key || !apiKey || !apiSecret || !from) return failure(503, "인증 서비스 준비 중입니다.");
  const rpc = async (name, body, timeout = 1000) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error("SMS reservation failed");
    // returns void RPC는 PostgREST가 204/빈 본문을 보낸다. 기록 성공을 JSON 오류로 뒤집지 않는다.
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const hookId = request.headers.get("webhook-id");
  try {
    const reserved = await rpc("reserve_member_auth_sms_hook", { p_phone: phone, p_hook_id: hookId });
    if (reserved.sent) return Response.json({});
    if (!reserved.success) return failure(429, reserved.error || "잠시 후 다시 시도해 주세요.");
    // Supabase HTTP hook의 5초 제한 내 단일 발송. 접수 여부 불명인 timeout은 자동 재발송하지 않는다.
    const result = await sendSolapiMessage({ apiKey, apiSecret, timeoutMs: 2600, message: {
      to: phone, from, text: `[수북] 인증번호 [${code}]를 5분 안에 입력해 주세요. 본인이 요청한 경우에만 입력하세요.`,
    } });
    if (!result.success) return failure(502, "문자 발송에 실패했습니다. 1분 후 다시 요청해 주세요.");
    await rpc("complete_member_auth_sms_hook", { p_hook_id: hookId }, 700);
    return Response.json({});
  } catch {
    return failure(503, "인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export default { fetch: handleSmsHook };
