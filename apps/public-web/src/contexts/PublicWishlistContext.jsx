import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePublicAuth } from "./PublicAuthContext";
import {
  loadWishlistProductIds,
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  readGuestWishlistProductIds,
  setWishlistItemActive,
  toggleGuestWishlistProductId,
} from "../lib/publicWishlist";

const PublicWishlistContext = createContext(null);

function PublicWishlistProvider({ children }) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = usePublicAuth();
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [pendingProductIds, setPendingProductIds] = useState([]);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [wishlistError, setWishlistError] = useState(null);
  const favoriteIdsRef = useRef(favoriteIds);
  const pendingProductIdsRef = useRef(pendingProductIds);

  useEffect(() => {
    favoriteIdsRef.current = favoriteIds;
  }, [favoriteIds]);

  useEffect(() => {
    pendingProductIdsRef.current = pendingProductIds;
  }, [pendingProductIds]);

  useEffect(() => {
    let isActive = true;

    if (isAuthLoading) {
      return undefined;
    }

    if (!isAuthenticated || !user?.id) {
      // 비로그인 사용자도 guest wishlist를 사용할 수 있게 한다.
      // 로그인 시 loadWishlistProductIds가 guest store를 user store에 merge하고 비운다.
      setFavoriteIds(readGuestWishlistProductIds());
      setPendingProductIds([]);
      setWishlistError(null);
      setIsWishlistLoading(false);
      return undefined;
    }

    const loadWishlist = async () => {
      setIsWishlistLoading(true);

      const result = await loadWishlistProductIds({ user });

      if (!isActive) {
        return;
      }

      setFavoriteIds(result.productIds);
      setWishlistError(result.error ?? null);
      setIsWishlistLoading(false);
    };

    void loadWishlist();

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, isAuthLoading, user]);

  const refreshWishlist = async () => {
    if (!user?.id || !isAuthenticated) {
      setFavoriteIds([]);
      return {
        productIds: [],
        source: "empty",
        error: null,
      };
    }

    setIsWishlistLoading(true);
    const result = await loadWishlistProductIds({ user });
    setFavoriteIds(result.productIds);
    setWishlistError(result.error ?? null);
    setIsWishlistLoading(false);
    return result;
  };

  const toggleFavorite = async (productId) => {
    const normalizedProductId = normalizeWishlistProductId(productId);

    if (!normalizedProductId) {
      return {
        isFavorite: false,
        source: "validation",
        error: new Error("찜할 상품을 찾지 못했어요."),
      };
    }

    // P1: 비로그인 사용자도 guest localStorage에 임시 저장.
    // 멤버 게이트 다이얼로그 카피는 다른 에이전트가 별도 처리하므로,
    // 여기서는 데이터 보존만 책임진다. 로그인 시 user wishlist에 merge.
    if (!isAuthenticated || !user?.id) {
      const currentGuestIds = favoriteIdsRef.current;
      const wasFavoriteGuest = currentGuestIds.includes(normalizedProductId);
      const nextGuestIds = toggleGuestWishlistProductId(
        normalizedProductId,
        !wasFavoriteGuest,
      );
      setFavoriteIds(nextGuestIds);
      return {
        isFavorite: !wasFavoriteGuest,
        source: "guest",
        error: null,
      };
    }

    if (pendingProductIdsRef.current.includes(normalizedProductId)) {
      return {
        isFavorite: favoriteIdsRef.current.includes(normalizedProductId),
        source: "pending",
        error: null,
      };
    }

    const currentIds = favoriteIdsRef.current;
    const wasFavorite = currentIds.includes(normalizedProductId);
    const nextIds = mergeWishlistProductIds(currentIds, normalizedProductId, !wasFavorite);

    setFavoriteIds(nextIds);
    setPendingProductIds((currentValue) => [...currentValue, normalizedProductId]);
    setWishlistError(null);

    const result = await setWishlistItemActive({
      currentIds,
      nextActive: !wasFavorite,
      productId: normalizedProductId,
      user,
    });

    setPendingProductIds((currentValue) =>
      currentValue.filter((currentProductId) => currentProductId !== normalizedProductId),
    );

    if (result.error) {
      setFavoriteIds(currentIds);
      setWishlistError(result.error);
      return {
        isFavorite: wasFavorite,
        source: result.source,
        error: result.error,
      };
    }

    setFavoriteIds(result.productIds);

    return {
      isFavorite: !wasFavorite,
      source: result.source,
      error: null,
    };
  };

  const value = {
    favoriteCount: favoriteIds.length,
    favoriteIds,
    isFavorite(productId) {
      const normalizedProductId = normalizeWishlistProductId(productId);
      return normalizedProductId ? favoriteIds.includes(normalizedProductId) : false;
    },
    isFavoritePending(productId) {
      const normalizedProductId = normalizeWishlistProductId(productId);
      return normalizedProductId ? pendingProductIds.includes(normalizedProductId) : false;
    },
    isWishlistLoading,
    pendingProductIds,
    refreshWishlist,
    toggleFavorite,
    wishlistError,
  };

  return <PublicWishlistContext.Provider value={value}>{children}</PublicWishlistContext.Provider>;
}

function usePublicWishlist() {
  const context = useContext(PublicWishlistContext);

  if (!context) {
    throw new Error("usePublicWishlist must be used inside PublicWishlistProvider.");
  }

  return context;
}

export { PublicWishlistProvider, usePublicWishlist };
