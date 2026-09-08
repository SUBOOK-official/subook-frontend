// 캐시는 초기 표시용이다. 홈 진입 시 항상 재검증하고, 재고를 1분마다 갱신한다.
export const HOME_BEST_BOOKS_CACHE_TTL_MS = 60 * 1000;

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numericValue =
    typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.trunc(numericValue);
}

export function isHomeBestBooksCacheStale(fetchedAt, now = Date.now()) {
  const normalizedFetchedAt = normalizeNonNegativeInteger(fetchedAt);

  if (!normalizedFetchedAt) {
    return true;
  }

  return normalizedFetchedAt > now || now - normalizedFetchedAt >= HOME_BEST_BOOKS_CACHE_TTL_MS;
}

export function normalizeHomeBestBooks(products) {
  const safeProducts = Array.isArray(products)
    ? products.filter((product) => {
        if (!product || !product.id) {
          return false;
        }

        if (product.isPublic === false) {
          return false;
        }

        return (
          !["hidden", "sold_out"].includes(String(product.status ?? "").toLowerCase()) &&
          product.isSoldOut !== true &&
          product.availableCount !== 0
        );
      })
    : [];

  // 서버가 모든 동점 기준과 페이지네이션을 결정한다. 검수일 등으로 재정렬하지 않는다.
  return safeProducts.slice(0, 8);
}
