import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// 일성월심 앱 코드 — 구매자 조회 RPC 래퍼.
// 코드 원문은 주문 회원 본인(get_my_order_app_codes)과 비회원 주문 조회 인증(get_guest_order_app_codes)으로만 읽는다.
// 앱 패키지 주문이 아니면 빈 목록이 온다(화면에 아무것도 그리지 않음).

export async function fetchMyOrderAppCodes(orderId) {
  const id = Number(orderId);
  if (!isSupabaseConfigured || !supabase || !Number.isInteger(id) || id <= 0) {
    return { data: [], error: null };
  }
  const { data, error } = await supabase.rpc("get_my_order_app_codes", { p_order_id: id });
  return { data: Array.isArray(data) ? data : [], error: error ?? null };
}

export async function fetchGuestOrderAppCodes(orderNumber, phone) {
  if (!isSupabaseConfigured || !supabase || !orderNumber || !phone) {
    return { data: [], error: null };
  }
  const { data, error } = await supabase.rpc("get_guest_order_app_codes", {
    p_order_number: String(orderNumber).trim(),
    p_phone: String(phone).replace(/\D/g, ""),
  });
  return { data: Array.isArray(data?.lines) ? data.lines : [], error: error ?? null };
}

// 상품 id 중 앱 패키지인 것(상품 페이지·주문서 안내 표시용, 공개 읽기)
export async function fetchAppPackageProductIds(productIds) {
  const ids = [...new Set((productIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!isSupabaseConfigured || !supabase || ids.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase.from("ilseong_app_products").select("product_id").in("product_id", ids);
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row) => Number(row.product_id)));
}
