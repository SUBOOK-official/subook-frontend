// 회원 포인트 — Supabase RPC 연동
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { normalizeMyPoints } from "./publicPointsUtils";

export async function fetchMyPoints({ limit = 50 } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { points: normalizeMyPoints(null), error: null };
  }

  const { data, error } = await supabase.rpc("get_my_points", { p_limit: limit });
  if (error) {
    const next = new Error(error.message || "포인트를 불러오지 못했어요.");
    next.code = error.code;
    return { points: normalizeMyPoints(null), error: next };
  }

  return { points: normalizeMyPoints(data), error: null };
}
