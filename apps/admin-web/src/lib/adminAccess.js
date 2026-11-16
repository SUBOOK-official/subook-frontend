import { createContext, useContext } from "react";
import { ADMIN_ROLE, INTAKE_ROLE } from "./adminAuth";

// AdminRoute가 확인한 권한을 화면 전체(셸·페이지)에 내려준다.
export const AdminAccessContext = createContext({ role: ADMIN_ROLE });

/** @returns {{ role: string, isIntake: boolean }} isIntake — 교재 등록 담당 계정 */
export function useAdminAccess() {
  const { role } = useContext(AdminAccessContext);
  return { role, isIntake: role === INTAKE_ROLE };
}
