import { useEffect, useState } from "react";
import { usePublicAuth } from "../../contexts/PublicAuthContext";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { fetchStorefrontProducts } from "../../lib/storefront";
import { requestCuratedContent } from "@shared-supabase/curatedContentClient";
import { loadMemberRecommendations } from "../../lib/memberRecommendations";
import BestBooksSection from "./BestBooksSection";
import ProductCarouselSection from "./ProductCarouselSection";

export default function MemberRecommendations({ favoriteIds = [], onToggleFavorite }) {
  const { user, isAuthenticated } = usePublicAuth();
  const [result, setResult] = useState(null);
  const favoriteKey = favoriteIds.join(",");
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (!isAuthenticated || !supabase) return undefined;
    (async () => {
      const orders = await requestCuratedContent((signal) => supabase.rpc("get_my_orders", { p_limit: 20, p_offset: 0 }).abortSignal(signal)).catch(() => []);
      const recommendations = await loadMemberRecommendations({
        orders: orders ?? [], favoriteIds: favoriteKey.split(",").filter(Boolean),
        loadSignals: (ids) => requestCuratedContent((signal) => supabase.from("products").select("id,subject,book_type").in("id", ids).abortSignal(signal)),
        loadProducts: fetchStorefrontProducts,
      });
      if (!cancelled) setResult({ userId: user.id, ...recommendations });
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, isAuthenticated, favoriteKey]);
  if (!isAuthenticated || result?.userId !== user?.id) return <BestBooksSection favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />;
  const isBest = result.source === "best";
  return <ProductCarouselSection title={isBest ? "BEST 교재" : "나를 위한 맞춤 교재"} titleId="member-recommendations"
    subtitle={isBest ? "최근 30일, 가장 많은 주문에서 선택한 교재" : `${result.source === "recent" ? "최근 구매한 교재" : "찜한 교재"}의 과목·유형을 바탕으로 골랐어요`}
    products={result.products} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />;
}
