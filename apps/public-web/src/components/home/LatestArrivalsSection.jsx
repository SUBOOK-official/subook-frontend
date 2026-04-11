import { useEffect, useState } from "react";
import {
  fetchHomeLatestBooks,
  getCachedHomeLatestBooks,
} from "../../lib/publicHomeLatestBooks";
import ProductCarouselSection from "./ProductCarouselSection";

function LatestArrivalsSection({ favoriteIds, onStoreEnter, onToggleFavorite }) {
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
      linkHref="/store?sort=latest"
      onLinkClick={onStoreEnter}
      onToggleFavorite={onToggleFavorite}
      products={products}
      subtitle="방금 들어온 따끈따끈한 교재"
      title="📦 신규 입고"
      titleId="public-home-latest-books-title"
    />
  );
}

export default LatestArrivalsSection;
