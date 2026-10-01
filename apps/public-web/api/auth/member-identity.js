// DB에서 확인된 번호만 Auth에 연결한다. raw profile/요청 body의 번호는 절대 신뢰하지 않는다.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (code, error) => res.status(code).json({ error, code });
  if (req.method !== "POST") return fail(405, "POST required");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!token) return fail(401, "로그인이 필요합니다.");
  if (!url || !key) return fail(503, "인증 서비스를 준비 중입니다.");
  const call = async (path, body, asService = false, method = "POST") => {
    const response = await fetch(`${url}${path}`, {
      method, headers: { apikey: key, Authorization: `Bearer ${asService ? key : token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(path.startsWith("/rest/") ? data?.message || "계정 정보를 확인하지 못했습니다." : "휴대폰 로그인 연결을 완료하지 못했습니다. 다시 시도해 주세요.");
    return data;
  };
  try {
    const user = await call("/auth/v1/user", undefined, false, "GET");
    if (!user?.id) return fail(401, "로그인이 필요합니다.");
    if (req.body?.action === "merge") {
      await call("/rest/v1/rpc/complete_member_account_merge", {
        p_id: req.body.id, p_secret: req.body.secret, p_target: user.id,
      });
    } else if (req.body?.action !== "bind") return fail(400, "올바르지 않은 요청입니다.");
    const binding = await call("/rest/v1/rpc/get_member_phone_binding", { p_user_id: user.id }, true);
    // 통합은 이미 DB에 원자적으로 보존됨. Auth 연결 실패 시 같은 대표 계정에서 bind를 재시도한다.
    if (binding.previous_user_id) {
      await call(`/auth/v1/admin/users/${binding.previous_user_id}`, { phone: "" }, true, "PUT");
    }
    if (user.phone !== binding.phone || !user.phone_confirmed_at) {
      await call(`/auth/v1/admin/users/${user.id}`, { phone: binding.phone, phone_confirm: true }, true, "PUT");
    }
    return res.status(200).json({ success: true });
  } catch (error) { return fail(400, error.message || "요청을 처리하지 못했습니다. 다시 시도해 주세요."); }
}
