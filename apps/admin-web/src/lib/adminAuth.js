import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 관리자 화면 권한.
//  - "admin"  : 전체 관리자 (모든 메뉴)
//  - "intake" : 교재 등록 담당 — 상품 등록 화면만 (서버가 허용한 등록 요청만 통과한다)
// 화면에서 메뉴를 숨기는 것은 안내일 뿐이고, 실제 차단은 DB의 is_admin_user()가 한다.
export const ADMIN_ROLE = "admin";
export const INTAKE_ROLE = "intake";

// 등록 담당이 로그인하면 바로 보내는 화면
export const INTAKE_HOME_PATH = "/admin/register";

export function homePathForRole(role) {
  return role === INTAKE_ROLE ? INTAKE_HOME_PATH : "/admin";
}

export async function getAdminAccessState() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      isAdmin: false,
      role: null,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
    };
  }

  const { data, error } = await supabase.rpc("get_admin_access");
  if (error) {
    return {
      isAdmin: false,
      role: null,
      error: "관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const role = data?.role === ADMIN_ROLE || data?.role === INTAKE_ROLE ? data.role : null;
  return {
    // isAdmin = 관리자 화면에 들어올 수 있는 계정 (전체 관리자 + 등록 담당)
    isAdmin: role !== null,
    role,
    error: "",
  };
}

export async function checkIsAdminUser() {
  const { isAdmin } = await getAdminAccessState();
  return isAdmin;
}
