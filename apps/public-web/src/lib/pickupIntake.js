import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// 수거 신청 받기/중단 상태 — 관리자 화면(수거·검수)의 스위치가 바꾼다.
// 응답을 읽지 못하면 '받는 중'으로 본다. 중단 중의 신청은 서버가 거절하므로
// 조회 실패 때문에 평소의 신청 화면까지 닫히지 않게 한다.
export function parsePickupIntakeStatus(data) {
  return { paused: data?.paused === true };
}

export async function fetchPickupIntakeStatus() {
  if (!isSupabaseConfigured || !supabase) return parsePickupIntakeStatus(null);

  try {
    const { data, error } = await supabase.rpc("get_pickup_intake_status");
    return parsePickupIntakeStatus(error ? null : data);
  } catch {
    return parsePickupIntakeStatus(null);
  }
}
