import { sortStorefrontProducts } from "./publicStoreSorting.js";

export const HOME_BEST_BOOKS_CACHE_TTL_MS = 60 * 60 * 1000;

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

  return now - normalizedFetchedAt >= HOME_BEST_BOOKS_CACHE_TTL_MS;
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

        return String(product.status ?? "").toLowerCase() !== "hidden";
      })
    : [];

  return sortStorefrontProducts(safeProducts, "popular").slice(0, 8);
}
