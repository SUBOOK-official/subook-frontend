import { fetchFeaturedProducts } from "./publicFeaturedProductsApi";
import { fetchStorefrontProducts } from "./storefront";
import {
  HOME_LATEST_BOOKS_CACHE_TTL_MS,
  isHomeLatestBooksCacheStale,
  normalizeHomeLatestBooks,
} from "./publicHomeLatestBooksUtils";

// v2: isPublic 강제 false 버그로 빈 배열이 캐시된 이력이 있어 키를 올려 즉시 무효화
// v3: 콜라보 고정 상품 도입 — 기존 캐시(고정 전 순서)를 즉시 버리기 위해 키를 올림
const HOME_LATEST_BOOKS_CACHE_KEY = "subook.public.home.latest-books.v3";
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
  // 고정 상품은 입고일이 오래되면 최신 8건 밖으로 밀려나므로 따로 받아 와 합친다.
  // 고정 조회가 실패해도 신규 입고 자체는 살린다.
  const [result, featuredProducts] = await Promise.all([
    fetchStorefrontProducts({
      limit: HOME_LATEST_BOOK_LIMIT,
      sort: "latest",
    }),
    fetchFeaturedProducts().catch(() => []),
  ]);

  if (result.error) {
    throw result.error;
  }

  const latestProducts = result.products ?? result.books ?? [];
  const seenIds = new Set(latestProducts.map((product) => String(product.id)));
  const products = normalizeHomeLatestBooks([
    ...latestProducts,
    ...featuredProducts.filter((product) => !seenIds.has(String(product.id))),
  ]);
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
