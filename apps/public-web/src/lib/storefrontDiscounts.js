export function productDiscountRate(product) {
  const price = product.price;
  const original = product.originalPrice;
  if (Number.isFinite(price) && Number.isFinite(original) && original > 0 && price >= 0) {
    return Math.max(0, Math.min(100, (original - price) / original * 100));
  }
  return Number.isFinite(product.discountRate) ? Math.max(0, Math.min(100, product.discountRate)) : 0;
}
export function selectDiscountProducts(products, filters = {}) {
  let rows = filters.discounts?.includes("sale") ? products.filter((row) => productDiscountRate(row) > 0) : [...products];
  if (filters.sort === "discount_asc" || filters.sort === "discount_desc") {
    const direction = filters.sort === "discount_asc" ? 1 : -1;
    rows.sort((a, b) => direction * (productDiscountRate(a) - productDiscountRate(b)) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }
  return rows;
}

// Some catalog RPCs cap p_limit. Continue with the actual returned count, not the requested size.
export async function loadCompleteDiscountCatalog(loadPage, filters) {
  const products = new Map();
  let offset = 0;
  let source;
  while (true) {
    const result = await loadPage({ ...filters, limit: 100, offset });
    if (result.error || result.source === "unavailable") throw new Error("할인 교재를 불러오지 못했어요.");
    source = result.source;
    const rows = result.products ?? [];
    if (!rows.length) break;
    const before = products.size;
    for (const row of rows) products.set(String(row.id), row);
    if (products.size === before) throw new Error("교재 목록 페이지를 확인하지 못했어요.");
    offset += rows.length;
    // Confirm with an empty page: legacy totalCount may represent only the current page.
  }
  return { products: [...products.values()], source };
}
