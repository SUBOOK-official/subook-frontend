import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { fetchStorefrontProducts } from "./storefront";
import {
  HOME_SUBJECT_COUNT_CACHE_TTL_MS,
  createEmptyHomeSubjectCounts,
  normalizeHomeSubjectCountRows,
  aggregateHomeSubjectCountsFromProducts,
  getTotalHomeSubjectCount,
  isHomeSubjectCountCacheStale,
} from "./publicHomeSubjectCountUtils";

export {
  HOME_SUBJECT_COUNT_CACHE_TTL_MS,
  createEmptyHomeSubjectCounts,
  normalizeHomeSubjectCountRows,
  aggregateHomeSubjectCountsFromProducts,
  getTotalHomeSubjectCount,
  isHomeSubjectCountCacheStale,
};

const HOME_SUBJECT_COUNT_CACHE_KEY = "subook.public.home.subject-counts.v1";
const HOME_SUBJECT_COUNT_RPC_NAME = "get_public_store_subject_counts";
const SUBJECT_COUNT_FALLBACK_PAGE_SIZE = 500;
const SUBJECT_COUNT_FALLBACK_PAGE_LIMIT = 20;

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.trunc(numericValue);
}

function hasWindowStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

function readSubjectCountCacheValue() {
  if (!hasWindowStorage()) {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(HOME_SUBJECT_COUNT_CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeSubjectCountCacheValue(cacheValue) {
  if (!hasWindowStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(HOME_SUBJECT_COUNT_CACHE_KEY, JSON.stringify(cacheValue));
  } catch {
    // Ignore storage write failures and continue with the in-memory response.
  }
}

export function getCachedHomeSubjectCounts(now = Date.now()) {
  const cacheValue = readSubjectCountCacheValue();
  const normalizedCounts = normalizeHomeSubjectCountRows(cacheValue?.counts);
  const fetchedAt = normalizeNonNegativeInteger(cacheValue?.fetchedAt);

  if (!fetchedAt) {
    return null;
  }

  return {
    counts: normalizedCounts,
    fetchedAt,
    isStale: isHomeSubjectCountCacheStale(fetchedAt, now),
  };
}

async function fetchSubjectCountsViaRpc() {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc(HOME_SUBJECT_COUNT_RPC_NAME);

  if (error) {
    throw error;
  }

  return normalizeHomeSubjectCountRows(Array.isArray(data) ? data : []);
}

async function fetchAllStorefrontProductsForSubjectCounts() {
  const aggregatedProducts = [];

  for (let pageIndex = 0; pageIndex < SUBJECT_COUNT_FALLBACK_PAGE_LIMIT; pageIndex += 1) {
    const offset = pageIndex * SUBJECT_COUNT_FALLBACK_PAGE_SIZE;
    const result = await fetchStorefrontProducts({
      limit: SUBJECT_COUNT_FALLBACK_PAGE_SIZE,
      offset,
      sort: "popular",
    });

    if (result.error) {
      throw result.error;
    }

    const products = result.products ?? result.books ?? [];
    aggregatedProducts.push(...products);

    if (products.length < SUBJECT_COUNT_FALLBACK_PAGE_SIZE) {
      break;
    }
  }

  return aggregatedProducts;
}

async function fetchSubjectCountsViaStorefront() {
  const products = await fetchAllStorefrontProductsForSubjectCounts();
  return aggregateHomeSubjectCountsFromProducts(products);
}

export async function fetchHomeSubjectCounts() {
  let latestError = null;

  try {
    const rpcCounts = await fetchSubjectCountsViaRpc();

    if (rpcCounts) {
      const cachedValue = {
        counts: rpcCounts,
        fetchedAt: Date.now(),
      };
      writeSubjectCountCacheValue(cachedValue);

      return {
        counts: rpcCounts,
        fetchedAt: cachedValue.fetchedAt,
        source: "rpc",
      };
    }
  } catch (error) {
    latestError = error;
  }

  try {
    const storefrontCounts = await fetchSubjectCountsViaStorefront();
    const cachedValue = {
      counts: storefrontCounts,
      fetchedAt: Date.now(),
    };
    writeSubjectCountCacheValue(cachedValue);

    return {
      counts: storefrontCounts,
      fetchedAt: cachedValue.fetchedAt,
      source: "storefront",
    };
  } catch (error) {
    latestError = error;
  }

  throw latestError ?? new Error("과목별 교재 수를 불러오지 못했습니다.");
}
