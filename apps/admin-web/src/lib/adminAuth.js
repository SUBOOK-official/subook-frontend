import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

export async function getAdminAccessState() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      isAdmin: false,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
    };
  }

  const { data, error } = await supabase.rpc("is_admin_user");
  if (error) {
    return {
      isAdmin: false,
      error: "관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    isAdmin: Boolean(data),
    error: "",
  };
}

export async function checkIsAdminUser() {
  const { isAdmin } = await getAdminAccessState();
  return isAdmin;
}
