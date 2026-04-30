import { useEffect, useState } from "react";
import {
  fetchHomeBestBooks,
  getCachedHomeBestBooks,
} from "../../lib/publicHomeBestBooks";
import ProductCarouselSection from "./ProductCarouselSection";

function BestBooksSection({ favoriteIds, onStoreEnter, onToggleFavorite }) {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const cachedProducts = getCachedHomeBestBooks();

    if (cachedProducts) {
      setProducts(cachedProducts.products);
      setIsLoading(false);
      setHasFatalError(false);

      if (!cachedProducts.isStale) {
        return undefined;
      }
    }

    const loadBestBooks = async () => {
      try {
        const result = await fetchHomeBestBooks();

        if (isCancelled) {
          return;
        }

        setProducts(result.products);
        setIsLoading(false);
        setHasFatalError(false);
      } catch {
        if (isCancelled) {
          return;
        }

        if (!cachedProducts) {
          setHasFatalError(true);
          setIsLoading(false);
        }
      }
    };

    loadBestBooks();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <ProductCarouselSection
      backgroundTone="background"
      badgeType="rank"
      favoriteIds={favoriteIds}
      hasFatalError={hasFatalError}
      isLoading={isLoading}
      linkHref="/?sort=popular"
      onLinkClick={onStoreEnter}
      onToggleFavorite={onToggleFavorite}
      products={products}
      subtitle="지금 가장 많이 팔리는 교재"
      title="🏆 BEST 교재"
      titleId="public-home-best-books-title"
    />
  );
}

export default BestBooksSection;
