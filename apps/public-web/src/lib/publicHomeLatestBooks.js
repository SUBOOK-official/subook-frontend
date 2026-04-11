import { fetchStorefrontProducts } from "./storefront";
import {
  HOME_LATEST_BOOKS_CACHE_TTL_MS,
  isHomeLatestBooksCacheStale,
  normalizeHomeLatestBooks,
} from "./publicHomeLatestBooksUtils";

const HOME_LATEST_BOOKS_CACHE_KEY = "subook.public.home.latest-books.v1";
const HOME_LATEST_BOOK_LIMIT = 8;

function hasWindowStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

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

function readHomeLatestBooksCacheValue() {
  if (!hasWindowStorage()) {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(HOME_LATEST_BOOKS_CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeHomeLatestBooksCacheValue(cacheValue) {
  if (!hasWindowStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(HOME_LATEST_BOOKS_CACHE_KEY, JSON.stringify(cacheValue));
  } catch {
    // Ignore storage write failures and keep the network response in memory only.
  }
}

export function getCachedHomeLatestBooks(now = Date.now()) {
  const cacheValue = readHomeLatestBooksCacheValue();
  const products = normalizeHomeLatestBooks(cacheValue?.products);
  const fetchedAt = normalizeNonNegativeInteger(cacheValue?.fetchedAt);

  if (!fetchedAt) {
    return null;
  }

  return {
    products,
    fetchedAt,
    isStale: isHomeLatestBooksCacheStale(fetchedAt, now),
  };
}

export async function fetchHomeLatestBooks() {
  const result = await fetchStorefrontProducts({
    limit: HOME_LATEST_BOOK_LIMIT,
    sort: "latest",
  });

  if (result.error) {
    throw result.error;
  }

  const products = normalizeHomeLatestBooks(result.products ?? result.books ?? []);
  const fetchedAt = Date.now();

  writeHomeLatestBooksCacheValue({
    products,
    fetchedAt,
  });

  return {
    products,
    fetchedAt,
    source: result.source ?? "",
  };
}

export {
  HOME_LATEST_BOOKS_CACHE_TTL_MS,
  isHomeLatestBooksCacheStale,
  normalizeHomeLatestBooks,
};
