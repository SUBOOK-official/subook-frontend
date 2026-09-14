// B2B 교재 공급 문의 접수 (public-web /api/b2b-inquiry)
//
// 브라우저 입력을 검증한 뒤 service_role 전용 RPC로 넘겨 주문·수거 알림과 같은
// 팀 운영 Slack 채널에 전달한다. 동일 referenceId 재시도는 DB RPC가 중복 큐잉을 막는다.
// 외부 입력을 Slack 웹훅에 직접 보내거나 service_role 키를 브라우저에 노출하지 않는다.

import { randomBytes } from "node:crypto";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 16_000;
const PHONE_PATTERN = /^01[016789][0-9]{7,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorBody(error, code) {
  return { success: false, error, code };
}

function readBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body === "string") return JSON.parse(body);
  return {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}

export function validateB2bInquiry(body) {
  const organization = cleanText(body.organization);
  const contactName = cleanText(body.contactName);
  const phone = cleanText(body.phone).replace(/\D/g, "");
  const email = cleanText(body.email).toLowerCase();
  const interests = cleanText(body.interests);
  const requestDetails = cleanText(body.requestDetails);
  const quantity = Number(body.quantity);

  if (!organization || organization.length > 100) {
    return { error: "학원 또는 기관명을 확인해 주세요.", code: "INVALID_ORGANIZATION" };
  }
  if (!contactName || contactName.length > 50) {
    return { error: "담당자명을 확인해 주세요.", code: "INVALID_CONTACT_NAME" };
  }
  if (!PHONE_PATTERN.test(phone)) {
    return { error: "올바른 휴대전화번호를 입력해 주세요.", code: "INVALID_PHONE" };
  }
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    return { error: "이메일 주소를 확인해 주세요.", code: "INVALID_EMAIL" };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    return { error: "예상 주문 수량을 확인해 주세요.", code: "INVALID_QUANTITY" };
  }
  if (interests.length > 500 || requestDetails.length > 2_000) {
    return { error: "문의 내용이 너무 깁니다.", code: "DETAILS_TOO_LONG" };
  }
  if (body.privacyConsent !== true) {
    return { error: "개인정보 수집·이용 동의가 필요합니다.", code: "PRIVACY_CONSENT_REQUIRED" };
  }

  return {
    value: {
      organization,
      contactName,
      phone,
      email,
      quantity,
      interests,
      requestDetails,
      privacyConsent: true,
    },
  };
}

function createReferenceId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `B2B-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function queueSlackInquiry({ supabaseUrl, serviceKey, inquiry }) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/queue_b2b_inquiry_slack`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_inquiry: inquiry }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result?.queued === true) {
        return result;
      }

      const error = new Error(`Slack queue failed (${response.status})`);
      error.status = response.status;
      error.code = result?.code || result?.message || "RPC_FAILED";
      lastError = error;

      // 검증·권한 오류는 같은 요청을 반복해도 달라지지 않는다.
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Slack queue failed");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json(errorBody("Method not allowed", "METHOD_NOT_ALLOWED"));
  }

  if (req.headers?.["sec-fetch-site"] === "cross-site") {
    return res.status(403).json(errorBody("요청을 처리할 수 없습니다.", "CROSS_SITE_REQUEST"));
  }

  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json(errorBody("문의 내용이 너무 깁니다.", "BODY_TOO_LARGE"));
  }

  let body;
  try {
    body = readBody(req.body);
  } catch {
    return res.status(400).json(errorBody("요청 형식이 올바르지 않습니다.", "INVALID_JSON"));
  }

  // 보이지 않는 필드를 자동 입력한 봇에는 성공처럼 응답하되 운영 채널에는 보내지 않는다.
  if (cleanText(body.website)) {
    return res.status(200).json({ success: true, referenceId: createReferenceId() });
  }

  const validation = validateB2bInquiry(body);
  if (validation.error) {
    return res.status(400).json(errorBody(validation.error, validation.code));
  }

  const supabaseUrl = process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_PUBLIC_URL
    || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json(errorBody("문의 접수 시스템을 준비 중입니다.", "CONFIG_MISSING"));
  }

  const referenceId = createReferenceId();
  try {
    const result = await queueSlackInquiry({
      supabaseUrl: supabaseUrl.replace(/\/$/, ""),
      serviceKey,
      inquiry: { ...validation.value, referenceId },
    });
    return res.status(200).json({ success: true, referenceId: result.referenceId || referenceId });
  } catch (error) {
    console.error("[b2b-inquiry] Slack queue failed", {
      status: error?.status || 0,
      code: String(error?.code || error?.name || "UNKNOWN").slice(0, 120),
    });
    return res.status(502).json(errorBody(
      "문의 접수가 지연되고 있습니다. 잠시 후 다시 시도하거나 이메일로 문의해 주세요.",
      "DELIVERY_FAILED",
    ));
  }
}
