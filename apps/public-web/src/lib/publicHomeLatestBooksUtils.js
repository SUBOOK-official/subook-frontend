import { sortStorefrontProducts } from "./publicStoreSorting.js";

export const HOME_LATEST_BOOKS_CACHE_TTL_MS = 30 * 60 * 1000;
export const HOME_LATEST_BOOKS_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function getProductTimestamp(productOrDateValue) {
  const candidateValue =
    typeof productOrDateValue === "object" && productOrDateValue !== null
      ? productOrDateValue.createdAt ?? productOrDateValue.created_at ?? null
      : productOrDateValue;

  const timestamp = new Date(candidateValue ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isHomeLatestBooksCacheStale(fetchedAt, now = Date.now()) {
  const normalizedFetchedAt = normalizeNonNegativeInteger(fetchedAt);

  if (!normalizedFetchedAt) {
    return true;
  }

  return now - normalizedFetchedAt >= HOME_LATEST_BOOKS_CACHE_TTL_MS;
}

export function normalizeHomeLatestBooks(products) {
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

  return sortStorefrontProducts(safeProducts, "latest").slice(0, 8);
}

export function isNewHomeArrivalBadgeVisible(productOrDateValue, now = Date.now()) {
  const productTimestamp = getProductTimestamp(productOrDateValue);

  if (!productTimestamp) {
    return false;
  }

  return productTimestamp >= now - HOME_LATEST_BOOKS_BADGE_WINDOW_MS;
}
