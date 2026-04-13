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
  };
}

function normalizeAccountRole(value) {
  if (
    value === "admin" ||
    value === "member" ||
    value === "guest" ||
    value === "withdrawal_pending" ||
    value === "withdrawn"
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
    withdrawal_requested_at: row.withdrawal_requested_at ?? null,
    withdrawal_scheduled_at: row.withdrawal_scheduled_at ?? null,
    personal_data_erased_at: row.personal_data_erased_at ?? null,
  };
}

function isMissingRpcError(error, functionName) {
  const rawMessage = error?.message?.toLowerCase?.() ?? "";
  return error?.code === "PGRST202" || rawMessage.includes(functionName.toLowerCase());
}

async function getLegacyAccessState(user) {
  const [profileResult, adminResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("user_id, email, name, nickname, phone, marketing_opt_in, email_verified_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("is_admin_user"),
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

export async function getPublicAccountAccessState(user) {
  if (!isSupabaseConfigured || !supabase || !user) {
    return {
      accountRole: "guest",
      profile: null,
      error: null,
    };
  }

  const { data, error } = await supabase.rpc("get_current_auth_account_role");

  if (error) {
    if (!isMissingRpcError(error, "get_current_auth_account_role")) {
      return {
        ...(await getLegacyAccessState(user)),
        error,
      };
    }

    return getLegacyAccessState(user);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const accountRole = normalizeAccountRole(row?.account_role);

  return {
    accountRole,
    profile: accountRole === "member" ? buildProfileFromAccessRow(row) ?? buildFallbackProfile(user) : null,
    error: null,
  };
}
