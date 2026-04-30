import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentContainer from "../ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../ProductCard";
import { STORE_SORT_OPTIONS } from "../../lib/publicStoreNavigation";
import { fetchStorefrontProducts, sortStorefrontProducts } from "../../lib/storefront";

const ITEMS_PER_PAGE = 28;
const SKELETON_COUNT = 8;

function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push("ellipsis-start");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push("ellipsis-end");
  }

  items.push(totalPages);
  return items;
}

function HomeStoreGrid({ favoriteIds = [], onToggleFavorite }) {
  const navigate = useNavigate();
  const sortMenuRef = useRef(null);
  const sectionTopRef = useRef(null);
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOption, setSortOption] = useState("latest");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  useEffect(() => {
    let isActive = true;

    const boot = async () => {
      try {
        setIsLoading(true);
        const result = await fetchStorefrontProducts({ limit: 500, sort: "latest" });
        if (!isActive) {
          return;
        }
        setCatalog(result.products ?? result.books ?? []);
      } catch {
        if (isActive) {
          setCatalog([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void boot();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSortMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSortMenuOpen]);

  const sortedProducts = useMemo(
    () => sortStorefrontProducts(catalog, sortOption),
    [catalog, sortOption],
  );

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const displayedProducts = sortedProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const paginationItems = getPaginationItems(safeCurrentPage, totalPages);

  const currentSortLabel =
    STORE_SORT_OPTIONS.find((option) => option.value === sortOption)?.label ?? "최신순";

  const scrollToTop = () => {
    if (sectionTopRef.current) {
      sectionTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSort = (nextValue) => {
    setIsSortMenuOpen(false);
    if (nextValue === sortOption) {
      return;
    }
    setSortOption(nextValue);
    setCurrentPage(1);
  };

  const handleChangePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) {
      return;
    }
    setCurrentPage(nextPage);
    scrollToTop();
  };

  return (
    <section className="public-home-store-grid" aria-label="전체 교재 목록" ref={sectionTopRef}>
      <ContentContainer>
        <div className="public-home-store-grid__header">
          <div className="public-home-store-grid__title-row">
            <h2 className="public-home-store-grid__title">전체 교재</h2>
            <span className="public-home-store-grid__count">
              총 {sortedProducts.length.toLocaleString("ko-KR")}권
            </span>
          </div>
          <div className="public-home-store-grid__sort-wrap" ref={sortMenuRef}>
            <button
              aria-expanded={isSortMenuOpen}
              aria-haspopup="menu"
              className="public-home-store-grid__sort-button"
              onClick={() => setIsSortMenuOpen((current) => !current)}
              type="button"
            >
              <span>{currentSortLabel}</span>
              <span aria-hidden="true">▾</span>
            </button>

            {isSortMenuOpen ? (
              <div className="public-home-store-grid__sort-menu" role="menu">
                {STORE_SORT_OPTIONS.map((option) => (
                  <button
                    aria-checked={sortOption === option.value}
                    className={`public-home-store-grid__sort-option ${sortOption === option.value ? "is-active" : ""}`}
                    key={option.value}
                    onClick={() => handleSelectSort(option.value)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {sortOption === option.value ? (
                      <span aria-hidden="true">✓</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="public-home-store-grid__list" role="status" aria-live="polite">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ProductCardSkeleton key={`home-store-skeleton-${index}`} />
            ))}
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="public-home-store-grid__empty">
            <strong>표시할 교재가 없어요</strong>
            <button
              className="public-home-store-grid__empty-button"
              onClick={() => navigate("/store")}
              type="button"
            >
              스토어 둘러보기
            </button>
          </div>
        ) : (
          <div className="public-home-store-grid__list">
            {displayedProducts.map((product) => (
              <ProductCard
                isFavorite={favoriteIds.includes(product.id)}
                key={product.id}
                onToggleFavorite={onToggleFavorite}
                product={product}
              />
            ))}
          </div>
        )}

        {!isLoading && totalPages > 1 ? (
          <nav className="public-home-store-grid__pagination" aria-label="페이지 탐색">
            <button
              aria-label="이전 페이지"
              className="public-home-store-grid__pagination-arrow"
              disabled={safeCurrentPage === 1}
              onClick={() => handleChangePage(safeCurrentPage - 1)}
              type="button"
            >
              ‹
            </button>

            <div className="public-home-store-grid__pagination-pages">
              {paginationItems.map((item) =>
                typeof item === "number" ? (
                  <button
                    aria-current={item === safeCurrentPage ? "page" : undefined}
                    className={`public-home-store-grid__pagination-page ${item === safeCurrentPage ? "is-active" : ""}`}
                    key={item}
                    onClick={() => handleChangePage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ) : (
                  <span className="public-home-store-grid__pagination-ellipsis" key={item}>
                    …
                  </span>
                ),
              )}
            </div>

            <button
              aria-label="다음 페이지"
              className="public-home-store-grid__pagination-arrow"
              disabled={safeCurrentPage === totalPages}
              onClick={() => handleChangePage(safeCurrentPage + 1)}
              type="button"
            >
              ›
            </button>
          </nav>
        ) : null}
      </ContentContainer>
    </section>
  );
}

export default HomeStoreGrid;
