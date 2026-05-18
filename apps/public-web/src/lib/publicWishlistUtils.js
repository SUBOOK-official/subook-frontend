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

// P1: 토글 시 새 ID를 맨 앞에 push하지 않는다.
// 정렬은 백엔드 query의 created_at DESC가 source of truth이며, 토글 직후 UI에서는
// 기존 위치를 유지(이미 있던 ID는 그 자리, 신규 ID는 맨 끝으로 append). 다음 fetch에서
// 정확한 순서로 재정렬된다. 이렇게 해야 "찜 해제 → 다시 찜" 시 카드가 점프하지 않는다.
function mergeWishlistProductIds(currentIds = [], productId, nextActive = null) {
  const normalizedProductId = normalizeWishlistProductId(productId);

  if (!normalizedProductId) {
    return normalizeWishlistProductIds(currentIds);
  }

  const normalizedCurrentIds = normalizeWishlistProductIds(currentIds);
  const alreadyFavorite = normalizedCurrentIds.includes(normalizedProductId);
  const shouldBeFavorite = typeof nextActive === "boolean" ? nextActive : !alreadyFavorite;

  if (shouldBeFavorite) {
    // 이미 있으면 위치 유지(no-op). 신규 ID는 맨 끝에 append.
    if (alreadyFavorite) {
      return normalizedCurrentIds;
    }
    return [...normalizedCurrentIds, normalizedProductId];
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
