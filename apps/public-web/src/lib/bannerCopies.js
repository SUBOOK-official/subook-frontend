// 공개 API는 저장된 문구만 읽는다. 생성용 refresh 쿼리는 방문자에게 사용하지 않는다.
export async function fetchBannerCopies({ fetchImpl = fetch } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl("/api/banner-copy", { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error("BANNER_COPY_READ_FAILED");
      const data = await response.json();
      return Array.isArray(data.copies) ? data.copies : [];
    } catch {
      if (attempt === 1) return [];
    }
  }
  return [];
}

export function bannerCopyMap(rows = []) {
  return new Map(rows.flatMap((row) => {
    const copy = typeof row.copy === "string" ? row.copy.trim() : "";
    return row.product_id && copy && [...copy].length <= 20 && !/[\r\n<>]/.test(copy)
      ? [[String(row.product_id), copy]] : [];
  }));
}
