export function rankRecommendedProducts(products, recommendations) {
  const ranks = new Map(recommendations.filter((row) => row.is_enabled).map((row) => [String(row.product_id), Number(row.sort_order)]));
  return products.map((product, index) => ({ product, index })).sort((a, b) =>
    (ranks.get(String(a.product.id)) ?? Infinity) - (ranks.get(String(b.product.id)) ?? Infinity)
      || (ranks.has(String(a.product.id)) && ranks.has(String(b.product.id)) ? Number(a.product.id) - Number(b.product.id) : 0)
      || a.index - b.index,
  ).map(({ product }) => product);
}

export function rankPersonalizedProducts(products, signals, excludedIds = []) {
  const excluded = new Set(excludedIds.map(String));
  const scores = (product) => signals.reduce((score, signal, index) => score +
    (signal.subject === product.subject ? 3 : 0) / (index + 1) +
    (signal.bookType && signal.bookType === product.bookType ? 1 : 0) / (index + 1), 0);
  return products.filter((product) => !product.isSoldOut && product.isPublic !== false && !excluded.has(String(product.id)))
    .map((product, index) => ({ product, index, score: scores(product) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ product }) => product);
}
