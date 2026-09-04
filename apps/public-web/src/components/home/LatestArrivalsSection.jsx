import { useEffect, useState } from "react";
import {
  fetchHomeLatestBooks,
  getCachedHomeLatestBooks,
} from "../../lib/publicHomeLatestBooks";
import { trackException } from "../../lib/analytics";
import ProductCarouselSection from "./ProductCarouselSection";

function LatestArrivalsSection({ favoriteIds, onToggleFavorite }) {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const cachedProducts = getCachedHomeLatestBooks();

    if (cachedProducts) {
      setProducts(cachedProducts.products);
      setIsLoading(false);
      setHasFatalError(false);

      if (!cachedProducts.isStale) {
        return undefined;
      }
    }

    const loadLatestBooks = async () => {
      try {
        const result = await fetchHomeLatestBooks();

        if (isCancelled) {
          return;
        }

        setProducts(result.products);
        setIsLoading(false);
        setHasFatalError(false);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        // GA4 exception — 캐시로 가려지는 실패까지 포함해 신규 입고 레일 조회 실패를 남긴다.
        trackException("home_latest_books_fetch_failed", {
          hadCache: Boolean(cachedProducts),
          errorMessage: error?.message,
        });

        if (!cachedProducts) {
          setHasFatalError(true);
          setIsLoading(false);
        }
      }
    };

    loadLatestBooks();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <ProductCarouselSection
      backgroundTone="surface"
      badgeType="new"
      favoriteIds={favoriteIds}
      hasFatalError={hasFatalError}
      isLoading={isLoading}
      onToggleFavorite={onToggleFavorite}
      products={products}
      subtitle="방금 들어온 따끈따끈한 교재"
      title="신규 입고"
      titleId="public-home-latest-books-title"
    />
  );
}

export default LatestArrivalsSection;
