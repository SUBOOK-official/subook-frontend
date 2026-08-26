// 카카오톡 채널 친구추가 3,000원 쿠폰 발급 (public-web /api/event/kakao-coupon-claim)
//
// 검증 체인:
//   1) Bearer 토큰의 회원 확인 (auth REST) + 카카오 identity(회원번호) 확보
//   2) 카카오 "채널 관계 확인" API(어드민 키)로 relation=ADDED 검증
//      GET kapi.kakao.com/v2/api/talk/channels?target_id=..&target_id_type=user_id
//   3) service_role로 claim_kakao_channel_coupon RPC 호출 (RPC는 service_role 전용 —
//      클라이언트 직접 호출로 친추 검증을 우회할 수 없게 하는 핵심 구조)
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api로 복사되어 npm import가
//   런타임에 해결되지 않는다 (send-phone-otp.js와 동일 제약).
//
// env: KAKAO_ADMIN_KEY(필수 · 카카오 디벨로퍼스 앱의 Admin 키). 미설정이면
//   NOT_CONFIGURED를 돌려주고 페이지가 "준비 중" 안내를 띄운다(배포 순서 안전).

const KAKAO_CHANNELS_URL = "https://kapi.kakao.com/v2/api/talk/channels";
// 수북 카카오톡 채널 프로필 ID — src/lib/supportChannels.js(KAKAO_CHANNEL_URL)와 동일 채널.
const KAKAO_CHANNEL_PUBLIC_ID = "_xdhxdyn";
const KAKAO_REQUEST_TIMEOUT_MS = 5_000;

function jsonError(res, status, code, error) {
  return res.status(status).json({ success: false, code, error });
}

// 유저의 카카오 회원번호 — identities에서 provider='kakao'의 id (10자리 숫자 문자열).
// GoTrue user 응답에 identities가 없으면 admin 단건 조회로 폴백.
function pickKakaoProviderId(identities) {
  if (!Array.isArray(identities)) return null;
  const kakao = identities.find((identity) => identity?.provider === "kakao");
  if (!kakao) return null;
  const raw = kakao.id ?? kakao.identity_data?.provider_id ?? kakao.identity_data?.sub;
  const digits = String(raw ?? "").trim();
  return /^\d+$/.test(digits) ? digits : null;
}

async function fetchKakaoRelation({ adminKey, kakaoUserId }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KAKAO_REQUEST_TIMEOUT_MS);
  try {
    const query = new URLSearchParams({
      target_id: kakaoUserId,
      target_id_type: "user_id",
      channel_ids: KAKAO_CHANNEL_PUBLIC_ID,
      channel_id_type: "channel_public_id",
    });
    const response = await fetch(`${KAKAO_CHANNELS_URL}?${query.toString()}`, {
      headers: { Authorization: `KakaoAK ${adminKey}` },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, kakaoCode: body?.code ?? null, message: body?.msg || `HTTP ${response.status}` };
    }
    const channel = Array.isArray(body?.channels)
      ? body.channels.find((item) => item?.channel_public_id === KAKAO_CHANNEL_PUBLIC_ID)
      : null;
    return { ok: true, relation: channel?.relation ?? "NONE" };
  } catch (err) {
    return { ok: false, kakaoCode: null, message: err.name === "AbortError" ? "카카오 응답 시간 초과" : err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_PUBLIC_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const kakaoAdminKey = process.env.KAKAO_ADMIN_KEY;

  if (!supabaseUrl || !serviceKey) {
    return jsonError(res, 500, "CONFIG_MISSING", "Server misconfigured");
  }
  if (!kakaoAdminKey) {
    // 카카오 어드민 키 미설정 — 코드만 먼저 배포된 상태. 페이지는 "준비 중"으로 안내.
    return jsonError(res, 503, "NOT_CONFIGURED", "이벤트 준비 중입니다. 잠시 후 다시 시도해 주세요.");
  }

  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // 1) 회원 인증 — Bearer 토큰의 유저를 auth REST로 확인
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonError(res, 401, "MISSING_AUTH_TOKEN", "로그인이 필요합니다.");
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json().catch(() => ({}));
  const userId = userData?.id;
  if (!userRes.ok || !userId) {
    return jsonError(res, 401, "INVALID_AUTH_TOKEN", "로그인이 필요합니다.");
  }

  // 카카오 identity — /auth/v1/user 응답에 없으면 admin 단건 조회로 폴백
  let kakaoUserId = pickKakaoProviderId(userData?.identities);
  if (!kakaoUserId) {
    const adminUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      headers: serviceHeaders,
    });
    const adminUserData = await adminUserRes.json().catch(() => ({}));
    kakaoUserId = pickKakaoProviderId(adminUserData?.identities);
  }
  if (!kakaoUserId) {
    return jsonError(res, 200, "KAKAO_LINK_REQUIRED", "카카오 계정 연결이 필요합니다.");
  }

  // 2) 채널 친구추가 여부 확인
  const relationResult = await fetchKakaoRelation({ adminKey: kakaoAdminKey, kakaoUserId });
  if (!relationResult.ok) {
    // -402: 동의항목(plusfriends) 미동의 / -101: 앱 미연결 카카오 계정
    if (relationResult.kakaoCode === -402) {
      return jsonError(res, 200, "CONSENT_REQUIRED", "카카오톡 채널 추가 상태 확인 동의가 필요합니다.");
    }
    if (relationResult.kakaoCode === -101) {
      return jsonError(res, 200, "KAKAO_LINK_REQUIRED", "카카오 계정 연결이 필요합니다.");
    }
    console.error("Kakao channel relation check failed:", relationResult.kakaoCode, relationResult.message);
    return jsonError(res, 502, "KAKAO_ERROR", "카카오 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (relationResult.relation !== "ADDED") {
    return res.status(200).json({ success: false, code: "NOT_ADDED", relation: relationResult.relation });
  }

  // 3) 발급 RPC (service_role 전용)
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_kakao_channel_coupon`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ p_user_id: userId }),
  });
  const rpcData = await rpcRes.json().catch(() => ({}));
  if (!rpcRes.ok) {
    console.error("claim_kakao_channel_coupon RPC failed:", rpcRes.status, JSON.stringify(rpcData).slice(0, 300));
    return jsonError(res, 500, "CLAIM_FAILED", "쿠폰 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (rpcData?.success) {
    return res.status(200).json({
      success: true,
      code: "ISSUED",
      expiresAt: rpcData.expires_at ?? null,
    });
  }
  return res.status(200).json({ success: false, code: rpcData?.code || "CLAIM_FAILED" });
}
