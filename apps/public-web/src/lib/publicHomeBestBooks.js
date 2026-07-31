import { fetchStorefrontProducts } from "./storefront";
import {
  HOME_BEST_BOOKS_CACHE_TTL_MS,
  isHomeBestBooksCacheStale,
  normalizeHomeBestBooks,
} from "./publicHomeBestBooksUtils";

// v4: isPublic 강제 false 버그로 빈 배열이 캐시된 이력이 있어 키를 올려 즉시 무효화
const HOME_BEST_BOOKS_CACHE_KEY = "subook.public.home.best-books.v4";
const HOME_BEST_BOOK_LIMIT = 12;

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

function readHomeBestBooksCacheValue() {
  if (!hasWindowStorage()) {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(HOME_BEST_BOOKS_CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeHomeBestBooksCacheValue(cacheValue) {
  if (!hasWindowStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(HOME_BEST_BOOKS_CACHE_KEY, JSON.stringify(cacheValue));
  } catch {
    // Ignore storage write failures and keep the network response in memory only.
  }
}

export function getCachedHomeBestBooks(now = Date.now()) {
  const cacheValue = readHomeBestBooksCacheValue();
  const products = normalizeHomeBestBooks(cacheValue?.products);
  const fetchedAt = normalizeNonNegativeInteger(cacheValue?.fetchedAt);

  if (!fetchedAt) {
    return null;
  }

  return {
    products,
    fetchedAt,
    isStale: isHomeBestBooksCacheStale(fetchedAt, now),
  };
}

export async function fetchHomeBestBooks() {
  const result = await fetchStorefrontProducts({
    limit: HOME_BEST_BOOK_LIMIT,
    sort: "popular",
  });

  if (result.error) {
    throw result.error;
  }

  // 실제 재고가 0건이거나 어떤 이유로 mock 카탈로그로 폴백된 경우에는
  // 목업 데이터를 노출하지 않는다 — 빈 배열로 처리하고 캐시도 쓰지 않음.
  const isMockSource = result.source === "mock";
  const rawProducts = isMockSource ? [] : (result.products ?? result.books ?? []);
  const products = normalizeHomeBestBooks(rawProducts);
  const fetchedAt = Date.now();

  if (!isMockSource) {
    writeHomeBestBooksCacheValue({
      products,
      fetchedAt,
    });
  }

  return {
    products,
    fetchedAt,
    source: result.source ?? "",
  };
}

export {
  HOME_BEST_BOOKS_CACHE_TTL_MS,
  isHomeBestBooksCacheStale,
  normalizeHomeBestBooks,
};
