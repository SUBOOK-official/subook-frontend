import { useEffect, useRef, useState } from "react";
import { isNewHomeArrivalBadgeVisible } from "../../lib/publicHomeLatestBooksUtils";
import {
  trackCarouselNavigate,
  trackEmptyState,
  trackException,
  trackViewItemList,
} from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";
import ContentContainer from "../ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../ProductCard";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

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

function ProductCarouselCard({
  analyticsIndex,
  analyticsListName,
  badgeType,
  isFavorite,
  onToggleFavorite,
  product,
  rank,
}) {
  return (
    <ProductCard
      analyticsIndex={analyticsIndex}
      analyticsListName={analyticsListName}
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
  const sectionRef = useRef(null);
  // 레일 가로 스와이프 1회 계측 가드 (마운트당 1회)
  const railSwipeTrackedRef = useRef(false);

  // GA4 view_item_list — 레일이 실제로 화면에 들어온 시점 1회 (title이 목록명, index=레일 내 순위).
  useInViewOnce(
    sectionRef,
    () => {
      trackViewItemList(
        title,
        products.map((product, index) => ({
          productId: product.id,
          title: product.title,
          brand: product.brand,
          subject: product.subject,
          price: product.price,
          quantity: 1,
          index,
        })),
      );
    },
    { enabled: !hasFatalError && products.length > 0 },
  );

  // GA4 exception — 캐러셀은 실패해도 조용히 사라져서(return null) 아무 신호가 남지 않는다.
  const fatalTrackedRef = useRef(false);
  useEffect(() => {
    if (!hasFatalError || fatalTrackedRef.current) return;
    fatalTrackedRef.current = true;
    trackException("home_carousel_load_failed", { listName: title });
  }, [hasFatalError, title]);

  // GA4 empty_state_view — 로딩이 끝났는데 0건(레일 자체가 홈에서 사라지는 상태)
  const emptyTrackedRef = useRef(false);
  useEffect(() => {
    if (isLoading || hasFatalError || products.length > 0 || emptyTrackedRef.current) return;
    emptyTrackedRef.current = true;
    trackEmptyState("home_carousel", { listName: title });
  }, [hasFatalError, isLoading, products.length, title]);

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

    // GA4 carousel_navigate — 화살표로 레일을 넘긴 횟수(캐러셀 탐색 깊이)
    trackCarouselNavigate(title, "arrow", direction > 0 ? "next" : "prev");

    const firstCard = rail.querySelector(".public-home-best-books__card");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 220;
    const visibleCards = Math.max(1, Math.floor(rail.clientWidth / (cardWidth + 16)));
    const distance = (cardWidth + 16) * Math.max(1, visibleCards - 1) * direction;
    rail.scrollBy({ left: distance, behavior: "smooth" });
  };

  // GA4 carousel_navigate(swipe) — 터치로 레일을 실제로 가로 이동시킨 첫 순간만 1회.
  // (세로 페이지 스크롤과 구분하려고 scrollLeft가 움직였는지 확인한다)
  const handleRailTouchMove = () => {
    if (railSwipeTrackedRef.current) return;
    const rail = railRef.current;
    if (!rail || rail.scrollLeft <= SCROLL_EDGE_THRESHOLD_PX) return;
    railSwipeTrackedRef.current = true;
    trackCarouselNavigate(title, "swipe", "next");
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
      ref={sectionRef}
    >
      <ContentContainer className="public-home-best-books__shell">
        <div className="public-home-best-books__header">
          <div className="public-home-best-books__header-copy">
            <h2 className="public-home-best-books__title" id={titleId}>
              {title}
            </h2>
            <p className="public-home-best-books__subtitle">{subtitle}</p>
          </div>

          <div className="public-home-best-books__header-actions">
            {showNavButtons ? (
              <div className="public-home-best-books__nav-group" role="group" aria-label="가로 스크롤">
                <button
                  aria-label="이전 교재 보기"
                  className="public-home-best-books__nav public-home-best-books__nav--prev"
                  disabled={!canScrollPrev}
                  onClick={() => handleScrollByDirection(-1)}
                  type="button"
                >
                  <ChevronLeftIcon size={18} />
                </button>
                <button
                  aria-label="다음 교재 보기"
                  className="public-home-best-books__nav public-home-best-books__nav--next"
                  disabled={!canScrollNext}
                  onClick={() => handleScrollByDirection(1)}
                  type="button"
                >
                  <ChevronRightIcon size={18} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="public-home-best-books__rail-wrap">
          <div
            className="public-home-best-books__rail"
            onTouchMove={handleRailTouchMove}
            ref={railRef}
            role="list"
          >
            {isLoading && products.length === 0
              ? Array.from({ length: skeletonCount }, (_, index) => (
                  <ProductCarouselSkeletonCard badgeType={badgeType} index={index} key={`${titleId}-skeleton-${index}`} />
                ))
              : products.map((product, index) => (
                  <ProductCarouselCard
                    analyticsIndex={index}
                    analyticsListName={title}
                    badgeType={badgeType}
                    isFavorite={favoriteIds.includes(product.id)}
                    key={product.id}
                    onToggleFavorite={onToggleFavorite}
                    product={product}
                    rank={index + 1}
                  />
                ))}
          </div>
        </div>
      </ContentContainer>
    </section>
  );
}

export default ProductCarouselSection;
