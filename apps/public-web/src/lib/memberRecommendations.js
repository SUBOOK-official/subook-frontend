import { rankPersonalizedProducts } from "../../../../packages/shared-domain/src/recommendations.js";

export async function loadMemberRecommendations({ orders = [], favoriteIds = [], loadSignals, loadProducts }) {
  const boughtIds = [...new Set(orders.filter((order) => ["paid", "preparing", "shipping", "shipped", "delivered", "confirmed"].includes(order.status))
    .flatMap((order) => (order.items ?? []).filter((item) => !item.refunded_at).map((item) => item.product_id)).filter(Boolean))];
  for (const [source, ids] of [["recent", boughtIds], ["wishlist", favoriteIds]]) {
    if (!ids.length) continue;
    try {
      const signals = await loadSignals(ids.slice(0, 30));
      const ordered = ids.map((id) => signals.find((row) => String(row.id) === String(id))).filter(Boolean);
      const subjects = [...new Set(ordered.map((row) => row.subject).filter(Boolean))].slice(0, 3);
      const groups = await Promise.all(subjects.map((subject) => loadProducts({ subject, sort: "popular", limit: Math.min(100, 24 + boughtIds.length) })));
      if (groups.some((group) => group.error)) continue;
      const unique = [...new Map(groups.flatMap((group) => group.products).map((product) => [String(product.id), product])).values()];
      const products = rankPersonalizedProducts(unique, ordered.map((row) => ({ subject: row.subject, bookType: row.book_type })), boughtIds).slice(0, 12);
      if (products.length) return { source, products };
    } catch { /* 구매 신호가 없거나 조회 실패면 찜, 다음으로 BEST를 확인한다. */ }
  }
  const best = await loadProducts({ sort: "popular", limit: Math.min(500, 12 + boughtIds.length) });
  if (best.error) throw best.error;
  return { source: "best", products: rankPersonalizedProducts(best.products, [], boughtIds).slice(0, 12) };
}
