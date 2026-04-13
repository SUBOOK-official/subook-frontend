function normalizeWishlistProductId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue ? normalizedValue : null;
}

function normalizeWishlistProductIds(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeWishlistProductId(value))
        .filter(Boolean),
    ),
  );
}

function mergeWishlistProductIds(currentIds = [], productId, nextActive = null) {
  const normalizedProductId = normalizeWishlistProductId(productId);

  if (!normalizedProductId) {
    return normalizeWishlistProductIds(currentIds);
  }

  const normalizedCurrentIds = normalizeWishlistProductIds(currentIds);
  const alreadyFavorite = normalizedCurrentIds.includes(normalizedProductId);
  const shouldBeFavorite = typeof nextActive === "boolean" ? nextActive : !alreadyFavorite;

  if (shouldBeFavorite) {
    return [normalizedProductId, ...normalizedCurrentIds.filter((id) => id !== normalizedProductId)];
  }

  return normalizedCurrentIds.filter((id) => id !== normalizedProductId);
}

function sortWishlistProductsByIds(products = [], wishlistIds = []) {
  const orderMap = new Map(
    normalizeWishlistProductIds(wishlistIds).map((productId, index) => [productId, index]),
  );

  return [...products].sort((left, right) => {
    const leftOrder = orderMap.get(normalizeWishlistProductId(left?.id)) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderMap.get(normalizeWishlistProductId(right?.id)) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export {
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  normalizeWishlistProductIds,
  sortWishlistProductsByIds,
};
