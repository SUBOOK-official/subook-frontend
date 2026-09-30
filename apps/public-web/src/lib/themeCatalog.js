// Load the entire theme before filtering so matches on later pages are included.
export async function loadThemeCatalog(loadPage) {
  const products = new Map();
  let theme = null;
  let offset = 0;
  while (true) {
    const data = await loadPage({ limit: 100, offset });
    if (!data?.theme) return { theme: null, products: [] };
    theme = data.theme;
    const rows = data.products ?? [];
    if (!rows.length) break;
    const previousSize = products.size;
    rows.forEach((row) => products.set(String(row.id), row));
    if (products.size === previousSize) throw new Error("테마 교재를 불러오지 못했어요.");
    offset += rows.length;
    if (Number.isFinite(data.total_count) && offset >= data.total_count) break;
  }
  return { theme, products: [...products.values()] };
}
