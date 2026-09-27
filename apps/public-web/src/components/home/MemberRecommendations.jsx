import { useEffect, useState } from "react";
import { usePublicAuth } from "../../contexts/PublicAuthContext";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { fetchStorefrontProducts } from "../../lib/storefront";
import { rankPersonalizedProducts } from "@shared-domain/recommendations";
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
      const { data: orders, error } = await supabase.rpc("get_my_orders", { p_limit: 20, p_offset: 0 });
      if (error) return;
      const boughtIds = [...new Set((orders ?? []).filter((order) => ["paid", "preparing", "shipping", "shipped", "delivered", "confirmed"].includes(order.status)).flatMap((order) => (order.items ?? []).filter((item) => !item.refunded_at).map((item) => item.product_id)).filter(Boolean))];
      const ids = boughtIds.length ? boughtIds : favoriteKey.split(",").filter(Boolean);
      if (!ids.length) return;
      const { data: signals, error: signalError } = await supabase.from("products").select("id,subject,book_type").in("id", ids.slice(0, 30));
      if (signalError || !signals?.length) return;
      const ordered = ids.map((id) => signals.find((row) => String(row.id) === String(id))).filter(Boolean);
      const subjects = [...new Set(ordered.map((row) => row.subject).filter(Boolean))].slice(0, 3);
      const groups = await Promise.all(subjects.map((subject) => fetchStorefrontProducts({ subject, sort: "popular", limit: 24 })));
      const unique = [...new Map(groups.flatMap((group) => group.products).map((product) => [product.id, product])).values()];
      const products = rankPersonalizedProducts(unique, ordered.map((row) => ({ subject: row.subject, bookType: row.book_type })), boughtIds).slice(0, 12);
      if (!cancelled && products.length) setResult({ userId: user.id, products, source: boughtIds.length ? "최근 구매한 교재" : "찜한 교재" });
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, isAuthenticated, favoriteKey]);
  if (!isAuthenticated || result?.userId !== user?.id) return <BestBooksSection favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />;
  return <ProductCarouselSection title="나를 위한 맞춤 교재" titleId="member-recommendations" subtitle={`${result.source}의 과목·유형을 바탕으로 골랐어요`} products={result.products} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />;
}
