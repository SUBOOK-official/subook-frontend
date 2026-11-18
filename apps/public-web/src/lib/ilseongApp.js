import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// 일성월심 앱 패키지 — 구매자 화면용 조회.
// 앱 코드는 구매자에게 내려오지 않는다(DB가 상태만 준다). 교재는 구매한 수북 계정으로 앱에 로그인하면 등록된다.

// 주문의 앱 이용 상태. 본인 주문이 아니거나 앱 패키지 주문이 아니면 data = null(화면에 아무것도 그리지 않음).
//   state: waiting(로그인하면 등록됨) | registered(앱에 등록됨) | ended(환불로 끝남)
export async function fetchMyOrderAppAccess(orderId) {
  const id = Number(orderId);
  if (!isSupabaseConfigured || !supabase || !Number.isInteger(id) || id <= 0) {
    return { data: null, error: null };
  }
  const { data, error } = await supabase.rpc("get_my_order_app_access", { p_order_id: id });
  if (error || !data || typeof data !== "object" || typeof data.state !== "string") {
    return { data: null, error: error ?? null };
  }
  const url = typeof data.app_download_url === "string" && data.app_download_url.startsWith("https://")
    ? data.app_download_url
    : null;
  return { data: { state: data.state, appDownloadUrl: url }, error: null };
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
