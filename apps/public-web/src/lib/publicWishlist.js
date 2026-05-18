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
const WISHLIST_GUEST_STORAGE_KEY = `${WISHLIST_STORAGE_PREFIX}:guest`;
const WISHLIST_TABLE = "wishlist_items";
const DEFAULT_WISHLIST_LIMIT = 50;

function hasWindowStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

function getWishlistStorageKey(userId) {
  return `${WISHLIST_STORAGE_PREFIX}:${userId}`;
}

// 비로그인 사용자의 임시 위시리스트(guest). 로그인 시 user wishlist에 merge.
function readGuestWishlistProductIds() {
  if (!hasWindowStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(WISHLIST_GUEST_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }
    return normalizeWishlistProductIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function writeGuestWishlistProductIds(productIds) {
  if (!hasWindowStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(
      WISHLIST_GUEST_STORAGE_KEY,
      JSON.stringify(normalizeWishlistProductIds(productIds)),
    );
  } catch {
    // ignore quota / private mode failures
  }
}

function clearGuestWishlistProductIds() {
  if (!hasWindowStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(WISHLIST_GUEST_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function toggleGuestWishlistProductId(productId, nextActive = null) {
  const current = readGuestWishlistProductIds();
  const next = mergeWishlistProductIds(current, productId, nextActive);
  writeGuestWishlistProductIds(next);
  return next;
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
  // 로그인 직후 비로그인 상태에서 모아둔 guest wishlist를 한 번 병합한다.
  // 병합 후에는 guest store를 비워, 추후 다른 사용자가 같은 브라우저로
  // 로그인할 때 위시리스트가 섞이지 않도록 한다.
  const guestIds = readGuestWishlistProductIds();

  if (!isSupabaseConfigured || !supabase) {
    const mergedLocal = normalizeWishlistProductIds([...storedIds, ...guestIds]);
    if (guestIds.length > 0) {
      writeStoredWishlistProductIds(user.id, mergedLocal);
      clearGuestWishlistProductIds();
    }
    return {
      productIds: mergedLocal,
      source: "local",
      error: null,
    };
  }

  // 1) guest wishlist를 user wishlist로 server-side upsert (RPC가 없으므로 client에서 처리)
  //    실패해도 client 정렬은 그대로 진행. 다음 fetch 때 다시 시도.
  if (guestIds.length > 0) {
    const guestUpsertPayload = guestIds
      .map((productId) => normalizeNumericWishlistProductId(productId))
      .filter((value) => value !== null)
      .map((numericProductId) => ({
        user_id: user.id,
        product_id: numericProductId,
      }));

    if (guestUpsertPayload.length > 0) {
      const { error: upsertError } = await supabase
        .from(WISHLIST_TABLE)
        .upsert(guestUpsertPayload, {
          onConflict: "user_id,product_id",
          ignoreDuplicates: true,
        });
      // TODO(backend): guest merge용 RPC가 생기면 단일 RPC 호출로 대체.
      if (!upsertError || shouldUseLocalWishlistFallback(upsertError)) {
        clearGuestWishlistProductIds();
      }
    } else {
      // numeric으로 변환 안 되는 ID는 server에 못 넘기지만 local에는 유지.
      clearGuestWishlistProductIds();
    }
  }

  const { data, error } = await supabase
    .from(WISHLIST_TABLE)
    .select("product_id, created_at, id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    if (shouldUseLocalWishlistFallback(error)) {
      const mergedLocal = normalizeWishlistProductIds([...storedIds, ...guestIds]);
      if (guestIds.length > 0) {
        writeStoredWishlistProductIds(user.id, mergedLocal);
      }
      return {
        productIds: mergedLocal,
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
  // remoteIds는 created_at DESC 순. guestIds(numeric으로 변환 안 된 mock 등)도
  // 뒤에 붙여 local 캐시에 보관.
  const mergedIds = normalizeWishlistProductIds([...remoteIds, ...storedIds, ...guestIds]);

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
  clearGuestWishlistProductIds,
  fetchWishlistProducts,
  loadWishlistProductIds,
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  normalizeWishlistProductIds,
  readGuestWishlistProductIds,
  readStoredWishlistProductIds,
  setWishlistItemActive,
  sortWishlistProductsByIds,
  toggleGuestWishlistProductId,
  writeGuestWishlistProductIds,
  writeStoredWishlistProductIds,
};
