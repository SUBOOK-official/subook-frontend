import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePublicAuth } from "./PublicAuthContext";
import {
  trackAddToWishlist,
  trackEvent,
  trackException,
  trackRemoveFromWishlist,
} from "../lib/analytics";
import {
  loadWishlistProductIds,
  mergeWishlistProductIds,
  normalizeWishlistProductId,
  setWishlistItemActive,
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
      // 비로그인 상태에서는 찜 상태를 저장하거나 표시하지 않는다.
      setFavoriteIds([]);
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
      // GA4 exception — 찜 목록 로드 실패(빈 목록으로 위장되는 것을 구분)
      if (result.error) {
        trackException("wishlist_load_failed", {
          errorMessage: result.error?.message,
        });
      }
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
    // GA4 exception — 새로고침 경로의 찜 목록 로드 실패
    if (result.error) {
      trackException("wishlist_load_failed", {
        errorMessage: result.error?.message,
      });
    }
    return result;
  };

  // meta는 선택 — { title, price, brand, subject, uiSurface }. 넘기지 않아도 기존처럼 동작한다.
  const toggleFavorite = async (productId, meta = {}) => {
    const normalizedProductId = normalizeWishlistProductId(productId);

    if (!normalizedProductId) {
      return {
        isFavorite: false,
        source: "validation",
        error: new Error("찜할 상품을 찾지 못했어요."),
      };
    }

    if (!isAuthenticated || !user?.id) {
      // GA4 — 로그인 관문 없이 찜이 막힌 표면(카드 하트 등) 관찰용
      trackEvent("wishlist_blocked", {
        errorReason: "auth_required",
        itemId: String(normalizedProductId),
        ...(meta?.uiSurface ? { uiSurface: meta.uiSurface } : {}),
      });
      return {
        isFavorite: false,
        source: "auth-required",
        error: new Error("로그인이 필요합니다."),
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
      // GA4 exception — 찜 토글 실패(롤백)
      trackException("wishlist_toggle_failed", {
        itemId: String(normalizedProductId),
        uiAction: wasFavorite ? "remove" : "add",
        ...(meta?.uiSurface ? { uiSurface: meta.uiSurface } : {}),
        errorMessage: result.error?.message,
      });
      return {
        isFavorite: wasFavorite,
        source: result.source,
        error: result.error,
      };
    }

    setFavoriteIds(result.productIds);

    // GA4 찜 계측 — 모든 표면(카드·상세·로그인 복귀 재실행)이 이 함수를 거치므로 여기서 1회.
    // meta({ title, price, brand, subject, uiSurface })를 넘긴 호출부는 items·ui_surface까지 남는다.
    if (!wasFavorite) {
      trackAddToWishlist(normalizedProductId, meta ?? {});
    } else {
      trackRemoveFromWishlist(normalizedProductId, meta ?? {});
    }

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
