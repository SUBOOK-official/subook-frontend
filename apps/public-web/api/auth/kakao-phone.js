// 클라이언트의 phone/user_metadata를 인증 근거로 사용하지 않는다.
// Supabase JWT의 Kakao identity와 Kakao UserInfo의 sub를 서버에서 대조한다.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (code, error) => res.status(code).json({ error, code });
  if (req.method !== "POST") return fail(405, "POST required");
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const providerToken = req.body?.providerToken;
  if (!token) return fail(401, "로그인이 필요합니다.");
  if (typeof providerToken !== "string" || !providerToken || providerToken.length > 8192) return res.status(200).json({ success: true, status: "sms_required" });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return fail(503, "인증 서비스를 준비 중입니다.");
  try {
    const auth = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!auth.ok) return fail(401, "다시 로그인해 주세요.");
    const user = await auth.json();
    const identity = user.identities?.find((item) => item.provider === "kakao");
    if (!identity || !user.email) return fail(400, "이메일이 있는 카카오 계정으로 로그인해 주세요.");
    let response;
    // 읽기 전용 조회만 일시적인 연결 실패 시 한 번 재시도한다.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch("https://kapi.kakao.com/v1/oidc/userinfo", { headers: { Authorization: `Bearer ${providerToken}` }, signal: AbortSignal.timeout(5000) });
        if (response.status < 500 || attempt === 1) break;
      } catch (error) { if (attempt === 1) throw error; }
    }
    if (!response.ok) return res.status(200).json({ success: true, status: "sms_required" });
    const info = await response.json();
    const subject = String(identity.identity_data?.sub || identity.id || "");
    if (!subject || String(info.sub) !== subject) return fail(403, "카카오 계정 정보가 일치하지 않습니다. 다시 로그인해 주세요.");
    const phone = String(info.phone_number || "").replace(/\D/g, "").replace(/^820?10/, "010");
    if (info.phone_number_verified !== true || !/^010\d{8}$/.test(phone)) return res.status(200).json({ success: true, status: "sms_required" });
    const claimed = await fetch(`${url}/rest/v1/rpc/claim_kakao_member_phone`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: user.id, p_phone: phone }), signal: AbortSignal.timeout(5000),
    });
    if (!claimed.ok) return fail(400, "계정 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
    return res.status(200).json(await claimed.json());
  } catch { return res.status(200).json({ success: true, status: "sms_required" }); }
}
