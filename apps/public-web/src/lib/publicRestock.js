import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// 재입고 알림 구독 헬퍼 — 찜 목록(마이페이지)의 품절 카드에서 바로 신청/해제할 때 사용.
// 상품 상세 페이지는 자체 인라인 호출을 유지하고 있으므로 여기 로직과 RPC 이름을 맞출 것.

// 내 활성 구독 product_id 집합. 버튼의 신청됨/미신청 상태 표시용.
export async function fetchMyRestockSubscribedProductIds() {
  if (!isSupabaseConfigured || !supabase) {
    return { productIds: new Set(), error: null };
  }

  const { data, error } = await supabase.rpc("list_my_restock_subscriptions");

  if (error) {
    return { productIds: new Set(), error };
  }

  const productIds = new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => String(row?.product_id ?? ""))
      .filter(Boolean),
  );

  return { productIds, error: null };
}

export async function subscribeRestock(productId) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("Supabase가 설정되지 않았습니다.") };
  }

  const { error } = await supabase.rpc("subscribe_restock", {
    p_product_id: Number(productId),
  });
  return { error };
}

export async function unsubscribeRestock(productId) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("Supabase가 설정되지 않았습니다.") };
  }

  const { error } = await supabase.rpc("unsubscribe_restock", {
    p_product_id: Number(productId),
  });
  return { error };
}
