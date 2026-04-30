import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isNewHomeArrivalBadgeVisible } from "../../lib/publicHomeLatestBooksUtils";
import ContentContainer from "../ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../ProductCard";

const MOBILE_BREAKPOINT_PX = 767;
const MOBILE_SKELETON_CARD_COUNT = 4;
const DESKTOP_SKELETON_CARD_COUNT = 12;
const SCROLL_EDGE_THRESHOLD_PX = 4;

function getRankTone(rank) {
  if (rank === 1) {
    return "gold";
  }

  if (rank === 2) {
    return "silver";
  }

  if (rank === 3) {
    return "bronze";
  }

  return "default";
}


function getCarouselBadge(badgeType, rank, product = null) {
  if (badgeType === "new") {
    if (!product || !isNewHomeArrivalBadgeVisible(product.createdAt ?? product.created_at)) {
      return null;
    }

    return {
      label: "N",
      tone: "new",
    };
  }

  return {
    label: String(rank),
    tone: getRankTone(rank),
  };
}

function ProductCarouselSkeletonCard({ badgeType, index }) {
  return (
    <ProductCardSkeleton
      badge={
        badgeType === "new"
          ? { label: "N", tone: "new" }
          : { label: String(index + 1), tone: getRankTone(index + 1) }
      }
      className="public-home-best-books__card public-home-best-books__card--skeleton"
    />
  );
}

function ProductCarouselCard({ badgeType, isFavorite, onToggleFavorite, product, rank }) {
  return (
    <ProductCard
      badge={getCarouselBadge(badgeType, rank, product)}
      className="public-home-best-books__card"
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      product={product}
    />
  );
}

function ProductCarouselSection({
  badgeType = "rank",
  backgroundTone = "background",
  favoriteIds = [],
  hasFatalError = false,
  isLoading = false,
  linkHref,
  onLinkClick,
  onToggleFavorite,
  products = [],
  subtitle,
  title,
  titleId,
}) {
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false,
  );
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const railRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const syncViewport = (event) => {
      setIsMobileViewport(event.matches);
    };

    syncViewport(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return undefined;
    }

    const syncEdges = () => {
      const { scrollLeft, scrollWidth, clientWidth } = rail;
      const overflow = scrollWidth - clientWidth > SCROLL_EDGE_THRESHOLD_PX;
      setHasOverflow(overflow);
      setCanScrollPrev(scrollLeft > SCROLL_EDGE_THRESHOLD_PX);
      setCanScrollNext(overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE_THRESHOLD_PX);
    };

    syncEdges();

    rail.addEventListener("scroll", syncEdges, { passive: true });

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncEdges);
      resizeObserver.observe(rail);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", syncEdges);
    }

    return () => {
      rail.removeEventListener("scroll", syncEdges);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (typeof window !== "undefined") {
        window.removeEventListener("resize", syncEdges);
      }
    };
  }, [products.length, isLoading]);

  const handleScrollByDirection = (direction) => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }

    const firstCard = rail.querySelector(".public-home-best-books__card");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 220;
    const visibleCards = Math.max(1, Math.floor(rail.clientWidth / (cardWidth + 16)));
    const distance = (cardWidth + 16) * Math.max(1, visibleCards - 1) * direction;
    rail.scrollBy({ left: distance, behavior: "smooth" });
  };

  if (hasFatalError) {
    return null;
  }

  if (!isLoading && products.length === 0) {
    return null;
  }

  const skeletonCount = isMobileViewport ? MOBILE_SKELETON_CARD_COUNT : DESKTOP_SKELETON_CARD_COUNT;
  const showNavButtons = !isMobileViewport && hasOverflow;

  return (
    <section
      aria-busy={isLoading && products.length === 0}
      aria-labelledby={titleId}
      className={`public-home-best-books public-home-best-books--${backgroundTone}`}
    >
      <ContentContainer className="public-home-best-books__shell">
        <div className="public-home-best-books__header">
          <div className="public-home-best-books__header-copy">
            <h2 className="public-home-best-books__title" id={titleId}>
              {title}
            </h2>
            <p className="public-home-best-books__subtitle">{subtitle}</p>
          </div>

          <Link className="public-home-best-books__link" onClick={onLinkClick} to={linkHref}>
            전체보기 &gt;&gt;          </Link>
        </div>

        <div className="public-home-best-books__rail-wrap">
          {showNavButtons ? (
            <button
              aria-label="이전 교재 보기"
              className="public-home-best-books__nav public-home-best-books__nav--prev"
              disabled={!canScrollPrev}
              onClick={() => handleScrollByDirection(-1)}
              type="button"
            >
              <span aria-hidden="true">‹</span>
            </button>
          ) : null}

          <div className="public-home-best-books__rail" ref={railRef} role="list">
            {isLoading && products.length === 0
              ? Array.from({ length: skeletonCount }, (_, index) => (
                  <ProductCarouselSkeletonCard badgeType={badgeType} index={index} key={`${titleId}-skeleton-${index}`} />
                ))
              : products.map((product, index) => (
                  <ProductCarouselCard
                    badgeType={badgeType}
                    isFavorite={favoriteIds.includes(product.id)}
                    key={product.id}
                    onToggleFavorite={onToggleFavorite}
                    product={product}
                    rank={index + 1}
                  />
                ))}
          </div>

          {showNavButtons ? (
            <button
              aria-label="다음 교재 보기"
              className="public-home-best-books__nav public-home-best-books__nav--next"
              disabled={!canScrollNext}
              onClick={() => handleScrollByDirection(1)}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>
      </ContentContainer>
    </section>
  );
}

export default ProductCarouselSection;
