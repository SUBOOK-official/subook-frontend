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

export async function loadStorePopularity(loadPage) {
  const ranks = new Map();
  let offset = 0;
  while (true) {
    const rows = await loadPage({ limit: 500, offset });
    if (!rows?.length) break;
    const previousSize = ranks.size;
    for (const row of rows) {
      const id = String(row.id);
      if (!ranks.has(id)) ranks.set(id, ranks.size);
    }
    if (ranks.size === previousSize) throw new Error("인기순을 불러오지 못했어요.");
    offset += rows.length;
    if (Number.isFinite(rows[0].total_count) && offset >= rows[0].total_count) break;
  }
  return ranks;
}

export function orderThemeProductsByPopularity(products, ranks) {
  // 점수를 다시 계산하지 않고 메인 서버의 순서를 그대로 적용한다.
  // 조회 사이 신규 입고된 교재도 누락시키지 않고 목록 뒤에 보존한다.
  return [...products].sort((left, right) =>
    (ranks.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER)
    - (ranks.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER));
}
