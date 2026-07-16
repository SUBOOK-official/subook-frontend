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

// 키워드 입고 알림 구독 — 아직 입고된 적 없는 교재를 기다리는 수요용.
// 신규 입고 시 서버 트리거가 products.search_text 매칭으로 인앱 알림을 보낸다.
export async function subscribeRestockKeyword(keyword) {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "서비스 연결이 준비되지 않았어요." };
  }
  const { data, error } = await supabase.rpc("subscribe_restock_keyword", {
    p_keyword: keyword,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, keyword: data?.keyword ?? keyword };
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
