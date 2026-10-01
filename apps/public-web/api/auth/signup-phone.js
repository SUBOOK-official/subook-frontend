import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { sendSolapiMessage } from "./send-phone-otp.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (code, error) => res.status(code).json({ error, code });
  if (req.method !== "POST") return fail(405, "POST required");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return fail(503, "인증 서비스를 준비 중입니다.");
  const rpc = async (name, body) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return response.json();
  };
  try {
    if (req.body?.action === "send") {
      const email = String(req.body.email || "").trim().toLowerCase();
      const phone = String(req.body.phone || "").replace(/\D/g, "");
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^010\d{8}$/.test(phone)) return fail(400, "이메일과 휴대폰 번호를 확인해 주세요.");
      const { SOLAPI_API_KEY: apiKey, SOLAPI_API_SECRET: apiSecret, SOLAPI_FROM: from } = process.env;
      if (!apiKey || !apiSecret || !from) return fail(503, "인증 서비스를 준비 중입니다.");
      const id = randomUUID(); const secret = randomBytes(32).toString("hex"); const code = String(randomInt(100000, 1000000));
      // Vercel이 덮어쓰는 IP 헤더만 사용하고 원문 IP는 저장하지 않는다.
      const ip = req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown";
      const codeHash = createHmac("sha256", key).update(`${id}:${code}`).digest("hex");
      const result = await rpc("reserve_signup_phone_challenge", {
        p_id: id, p_email: email, p_phone: phone, p_secret_hash: hash(secret), p_code_hash: codeHash,
        p_ip_hash: createHmac("sha256", key).update(String(ip)).digest("hex"),
      });
      if (!result.success) return fail(429, result.error);
      const sent = await sendSolapiMessage({ message: { to: phone, from, text: `[수북] 휴대폰 인증번호는 [${code}] 입니다. 5분 안에 입력해 주세요.` }, apiKey, apiSecret });
      if (!sent.success) return fail(502, "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return res.status(200).json({ success: true, id, secret });
    }
    if (req.body?.action === "verify") {
      const { id, secret, code } = req.body;
      if (!/^[a-f0-9-]{36}$/.test(id || "") || !/^[a-f0-9]{64}$/.test(secret || "") || !/^\d{6}$/.test(code || "")) return fail(400, "인증번호를 확인해 주세요.");
      const result = await rpc("verify_signup_phone_challenge", {
        p_id: id, p_secret_hash: hash(secret), p_code_hash: createHmac("sha256", key).update(`${id}:${code}`).digest("hex"),
      });
      if (!result.success) return fail(400, result.error);
      return res.status(200).json(result);
    }
    return fail(400, "올바르지 않은 요청입니다.");
  } catch { return fail(503, "인증 서비스 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."); }
}
