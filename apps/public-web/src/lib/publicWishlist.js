import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import {
  fetchStorefrontProductDetail,
  normalizeStorefrontProductRow,
} from "./storefront";
import {
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  normalizeWishlistProductIds,
  sortWishlistProductsByIds,
} from "./publicWishlistUtils";

const WISHLIST_STORAGE_PREFIX = "subook.public.wishlist.v1";
const WISHLIST_TABLE = "wishlist_items";
const DEFAULT_WISHLIST_LIMIT = 50;

function hasWindowStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

function getWishlistStorageKey(userId) {
  return `${WISHLIST_STORAGE_PREFIX}:${userId}`;
}

function normalizeErrorCode(error) {
  return typeof error?.code === "string" ? error.code.toUpperCase() : "";
}

function normalizeErrorMessage(error) {
  return typeof error?.message === "string" ? error.message.toLowerCase() : "";
}

function normalizeNumericWishlistProductId(value) {
  const normalizedValue = normalizeWishlistProductId(value);

  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : null;
}

function readStoredWishlistProductIds(userId) {
  if (!hasWindowStorage() || !userId) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(getWishlistStorageKey(userId));
    if (!rawValue) {
      return [];
    }

    return normalizeWishlistProductIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function writeStoredWishlistProductIds(userId, productIds) {
  if (!hasWindowStorage() || !userId) {
    return;
  }

  window.localStorage.setItem(
    getWishlistStorageKey(userId),
    JSON.stringify(normalizeWishlistProductIds(productIds)),
  );
}

function shouldUseLocalWishlistFallback(error) {
  const errorCode = normalizeErrorCode(error);
  const errorMessage = normalizeErrorMessage(error);

  return (
    errorCode === "PGRST202" ||
    errorCode === "PGRST205" ||
    errorMessage.includes("schema cache") ||
    errorMessage.includes("could not find the table") ||
    errorMessage.includes("could not find the function") ||
    errorMessage.includes("invalid input syntax for type bigint")
  );
}

async function loadWishlistProductIds({ user }) {
  if (!user?.id) {
    return {
      productIds: [],
      source: "empty",
      error: null,
    };
  }

  const storedIds = readStoredWishlistProductIds(user.id);

  if (!isSupabaseConfigured || !supabase) {
    return {
      productIds: storedIds,
      source: "local",
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(WISHLIST_TABLE)
    .select("product_id, created_at, id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    if (shouldUseLocalWishlistFallback(error)) {
      return {
        productIds: storedIds,
        source: "local",
        error: null,
      };
    }

    return {
      productIds: storedIds,
      source: "fallback",
      error,
    };
  }

  const remoteIds = normalizeWishlistProductIds(
    (Array.isArray(data) ? data : []).map((row) => row.product_id),
  );
  const mergedIds = normalizeWishlistProductIds([...remoteIds, ...storedIds]);

  writeStoredWishlistProductIds(user.id, mergedIds);

  return {
    productIds: mergedIds,
    source: "supabase",
    error: null,
  };
}

async function setWishlistItemActive({ currentIds = [], nextActive, productId, user }) {
  const normalizedProductId = normalizeWishlistProductId(productId);

  if (!user?.id || !normalizedProductId) {
    return {
      productIds: normalizeWishlistProductIds(currentIds),
      source: "validation",
      error: new Error("찜할 상품 정보를 확인할 수 없어요."),
    };
  }

  const nextIds = mergeWishlistProductIds(currentIds, normalizedProductId, nextActive);
  const numericProductId = normalizeNumericWishlistProductId(normalizedProductId);

  if (!isSupabaseConfigured || !supabase || numericProductId === null) {
    writeStoredWishlistProductIds(user.id, nextIds);
    return {
      productIds: nextIds,
      source: "local",
      error: null,
    };
  }

  const query = nextActive
    ? supabase.from(WISHLIST_TABLE).upsert(
        {
          user_id: user.id,
          product_id: numericProductId,
        },
        {
          onConflict: "user_id,product_id",
          ignoreDuplicates: true,
        },
      )
    : supabase
        .from(WISHLIST_TABLE)
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", numericProductId);

  const { error } = await query;

  if (error) {
    if (shouldUseLocalWishlistFallback(error)) {
      writeStoredWishlistProductIds(user.id, nextIds);
      return {
        productIds: nextIds,
        source: "local",
        error: null,
      };
    }

    return {
      productIds: normalizeWishlistProductIds(currentIds),
      source: "fallback",
      error,
    };
  }

  writeStoredWishlistProductIds(user.id, nextIds);

  return {
    productIds: nextIds,
    source: "supabase",
    error: null,
  };
}

async function fetchWishlistProducts({
  user,
  wishlistIds = [],
  limit = DEFAULT_WISHLIST_LIMIT,
  offset = 0,
}) {
  const fallbackIds = user?.id ? readStoredWishlistProductIds(user.id) : [];
  const normalizedWishlistIds = normalizeWishlistProductIds(
    wishlistIds.length > 0 ? wishlistIds : fallbackIds,
  );
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_WISHLIST_LIMIT;
  const normalizedOffset =
    Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0;
  const requestedIds = normalizedWishlistIds.slice(
    normalizedOffset,
    normalizedOffset + normalizedLimit,
  );

  if (!user?.id || requestedIds.length === 0) {
    return {
      products: [],
      source: "empty",
      error: null,
    };
  }

  let source = "local";
  let rpcError = null;
  const productMap = new Map();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("get_my_wishlist_products", {
      p_limit: normalizedLimit,
      p_offset: normalizedOffset,
    });

    if (error) {
      if (!shouldUseLocalWishlistFallback(error)) {
        rpcError = error;
        source = "fallback";
      }
    } else {
      source = "supabase";

      (Array.isArray(data) ? data : [])
        .map((row) => normalizeStorefrontProductRow(row))
        .filter((product) => Boolean(product?.id))
        .forEach((product) => {
          productMap.set(normalizeWishlistProductId(product.id), product);
        });
    }
  }

  const detailFallbackIds =
    source === "supabase"
      ? requestedIds.filter((productId) => !productMap.has(productId))
      : requestedIds;

  if (detailFallbackIds.length > 0) {
    const detailResults = await Promise.all(
      detailFallbackIds.map(async (productId) => {
        const detailResult = await fetchStorefrontProductDetail(productId);
        return detailResult.product ?? null;
      }),
    );

    detailResults.filter(Boolean).forEach((product) => {
      productMap.set(normalizeWishlistProductId(product.id), product);
    });

    if (source !== "supabase" && detailResults.some(Boolean)) {
      source = "detail";
    }
  }

  return {
    products: sortWishlistProductsByIds(Array.from(productMap.values()), requestedIds),
    source,
    error: rpcError,
  };
}

export {
  fetchWishlistProducts,
  loadWishlistProductIds,
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  normalizeWishlistProductIds,
  readStoredWishlistProductIds,
  setWishlistItemActive,
  sortWishlistProductsByIds,
  writeStoredWishlistProductIds,
};
