import { useEffect, useState } from "react";
import {
  fetchHomeBestBooks,
  getCachedHomeBestBooks,
  HOME_BEST_BOOKS_CACHE_TTL_MS,
  isHomeBestBooksCacheStale,
} from "../../lib/publicHomeBestBooks";
import { trackException } from "../../lib/analytics";
import ProductCarouselSection from "./ProductCarouselSection";

function BestBooksSection({ favoriteIds, onToggleFavorite }) {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let isFetching = false;
    const cachedProducts = getCachedHomeBestBooks();
    let lastFetchedAt = cachedProducts?.fetchedAt ?? 0;

    if (cachedProducts && !cachedProducts.isStale) {
      setProducts(cachedProducts.products);
      setIsLoading(false);
      setHasFatalError(false);
    }

    const loadBestBooks = async () => {
      if (isFetching || document.visibilityState === "hidden") return;
      isFetching = true;
      try {
        const result = await fetchHomeBestBooks();

        if (isCancelled) {
          return;
        }

        setProducts(result.products);
        lastFetchedAt = result.fetchedAt;
        setIsLoading(false);
        setHasFatalError(false);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        // GA4 exception — 캐시로 가려지는 실패까지 포함해 BEST 레일 조회 실패를 남긴다.
        trackException("home_best_books_fetch_failed", {
          hadCache: Boolean(cachedProducts),
          errorMessage: error?.message,
        });

        if (isHomeBestBooksCacheStale(lastFetchedAt)) {
          setProducts([]);
          setHasFatalError(true);
          setIsLoading(false);
        }
      } finally {
        isFetching = false;
      }
    };

    // 순위 캐시가 있어도 실제 판매 가능 재고를 즉시 재검증한다.
    loadBestBooks();
    const intervalId = window.setInterval(loadBestBooks, HOME_BEST_BOOKS_CACHE_TTL_MS);
    window.addEventListener("focus", loadBestBooks);
    document.addEventListener("visibilitychange", loadBestBooks);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadBestBooks);
      document.removeEventListener("visibilitychange", loadBestBooks);
    };
  }, []);

  return (
    <ProductCarouselSection
      backgroundTone="background"
      badgeType="rank"
      favoriteIds={favoriteIds}
      hasFatalError={hasFatalError}
      isLoading={isLoading}
      onToggleFavorite={onToggleFavorite}
      products={products}
      subtitle="최근 30일, 가장 많은 주문에서 선택한 교재"
      title="BEST 교재"
      titleId="public-home-best-books-title"
    />
  );
}

export default BestBooksSection;
