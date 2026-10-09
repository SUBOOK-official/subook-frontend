import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

function buildFallbackProfile(user) {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  const fallbackName =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : user.email?.split("@")[0] ?? "";
  const fallbackNickname =
    typeof metadata.nickname === "string" && metadata.nickname.trim()
      ? metadata.nickname.trim()
      : fallbackName;
  const fallbackPhone =
    typeof metadata.phone === "string" && metadata.phone.trim() ? metadata.phone.trim() : "";

  return {
    user_id: user.id,
    email: user.email ?? "",
    name: fallbackName,
    nickname: fallbackNickname,
    phone: fallbackPhone,
    marketing_opt_in: Boolean(metadata.marketing_opt_in),
    email_verified_at: null,
    terms_agreed_at: null,
    privacy_agreed_at: null,
  };
}

function normalizeAccountRole(value) {
  if (
    value === "admin" ||
    value === "member" ||
    value === "guest" ||
    value === "withdrawal_pending" ||
    value === "withdrawn" ||
    value === "blocked"
  ) {
    return value;
  }

  return "unknown";
}

function buildProfileFromAccessRow(row) {
  if (!row?.user_id) {
    return null;
  }

  return {
    user_id: row.user_id,
    email: row.email ?? "",
    name: row.name ?? "",
    nickname: row.nickname ?? row.name ?? "",
    phone: row.phone ?? "",
    marketing_opt_in: Boolean(row.marketing_opt_in),
    email_verified_at: row.email_verified_at ?? null,
    terms_agreed_at: row.terms_agreed_at ?? null,
    privacy_agreed_at: row.privacy_agreed_at ?? null,
    withdrawal_requested_at: row.withdrawal_requested_at ?? null,
    withdrawal_scheduled_at: row.withdrawal_scheduled_at ?? null,
    personal_data_erased_at: row.personal_data_erased_at ?? null,
  };
}

function isMissingRpcError(error, functionName) {
  const rawMessage = error?.message?.toLowerCase?.() ?? "";
  return error?.code === "PGRST202" || rawMessage.includes(functionName.toLowerCase());
}

async function getLegacyAccessState(user, signal) {
  const [profileResult, adminResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("user_id, email, name, nickname, phone, marketing_opt_in, email_verified_at, terms_agreed_at, privacy_agreed_at")
      .eq("user_id", user.id)
      .abortSignal(signal)
      .maybeSingle(),
    supabase.rpc("is_admin_user").abortSignal(signal),
  ]);

  const memberProfile = profileResult.data ?? null;
  const memberProfileError = profileResult.error ?? null;
  const isAdmin = Boolean(adminResult.data);
  const adminError = isMissingRpcError(adminResult.error, "is_admin_user") ? null : adminResult.error;

  if (isAdmin) {
    return {
      accountRole: "admin",
      profile: null,
      error: adminError ?? memberProfileError,
    };
  }

  if (memberProfile) {
    return {
      accountRole: "member",
      profile: memberProfile,
      error: adminError,
    };
  }

  if (memberProfileError) {
    return {
      accountRole: "member",
      profile: buildFallbackProfile(user),
      error: memberProfileError,
    };
  }

  return {
    accountRole: "unknown",
    profile: null,
    error: adminError,
  };
}

export async function getPublicAccountAccessState(user, { signal } = {}) {
  if (!isSupabaseConfigured || !supabase || !user) {
    return {
      accountRole: "guest",
      profile: null,
      error: null,
    };
  }

  const [{ data, error }, identityResult] = await Promise.all([
    supabase.rpc("get_current_auth_account_role").abortSignal(signal),
    supabase.rpc("get_my_member_identity").abortSignal(signal),
  ]);
  // 이전 DB 버전만 호환. 네트워크 오류는 인증 완료로 간주하지 않는다.
  const identity = identityResult.error?.code === "PGRST202" ? { enabled: false, status: "legacy" }
    : identityResult.error || !identityResult.data ? { enabled: true, status: "error" } : identityResult.data;

  if (error) {
    if (!isMissingRpcError(error, "get_current_auth_account_role")) {
      return {
        ...(await getLegacyAccessState(user, signal)),
        identity,
        error,
      };
    }

    return { ...(await getLegacyAccessState(user, signal)), identity };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const role = normalizeAccountRole(row?.account_role);
  // 소셜 인증 콜백의 임시 Auth 레코드는 번호 인증 전까지 회원 프로필이 없다.
  // 현행 RPC는 Auth만 있고 프로필이 없는 사용자에게 unknown을 반환한다.
  // 회원 이용 권한은 별도의 번호/약관 인증 조건으로 계속 제한한다.
  const isPendingMember = ["guest", "unknown"].includes(role) && identity?.enabled
    && ["unverified", "existing_account", "verified", "merged"].includes(identity.status) && user.id;
  const accountRole = isPendingMember ? "member" : role;

  return {
    accountRole,
    profile: accountRole === "member" ? buildProfileFromAccessRow(row) ?? buildFallbackProfile(user) : null,
    identity,
    error: null,
  };
}
