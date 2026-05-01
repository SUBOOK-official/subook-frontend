import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ContentContainer from "../ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../ProductCard";
import {
  STORE_DEFAULT_SUBJECT,
  STORE_FILTER_GROUPS,
  STORE_SORT_OPTIONS,
  STORE_SUBJECTS,
  clearStoreFilterGroup,
  cloneStoreFilters,
  countSelectedStoreFilters,
  createStoreInitialFilters,
  parseStorefrontQuery,
  serializeStorefrontQuery,
  toggleStoreFilterSelection,
} from "../../lib/publicStoreNavigation";
import {
  fetchStorefrontProducts,
  filterStorefrontProducts,
  sortStorefrontProducts,
} from "../../lib/storefront";

const ITEMS_PER_PAGE = 28;
const SKELETON_COUNT = 8;

function getFilterOptionLabel(option) {
  return typeof option === "string" ? option : option.label;
}

function getSortOptionLabel(sortValue) {
  return STORE_SORT_OPTIONS.find((option) => option.value === sortValue)?.label ?? "최신순";
}

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
  const location = useLocation();
  const sortMenuRef = useRef(null);
  const sectionTopRef = useRef(null);

  const initialQueryState = useMemo(
    () => parseStorefrontQuery(location.search),
    [location.search],
  );

  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(initialQueryState.selectedSubject);
  const [selectedFilters, setSelectedFilters] = useState(initialQueryState.selectedFilters);
  const [sortOption, setSortOption] = useState(initialQueryState.sortOption);
  const [currentPage, setCurrentPage] = useState(initialQueryState.page);
  const [searchKeyword, setSearchKeyword] = useState(initialQueryState.searchKeyword);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // 카탈로그 로딩 (한 번만)
  useEffect(() => {
    let isActive = true;

    const boot = async () => {
      try {
        setIsLoading(true);
        const result = await fetchStorefrontProducts({ limit: 500, sort: "latest" });
        if (!isActive) return;
        setCatalog(result.products ?? result.books ?? []);
      } catch {
        if (isActive) setCatalog([]);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void boot();
    return () => {
      isActive = false;
    };
  }, []);

  // URL 쿼리 → 상태 동기화 (브라우저 뒤로가기 등)
  useEffect(() => {
    const next = parseStorefrontQuery(location.search);
    setSelectedSubject((current) => (current === next.selectedSubject ? current : next.selectedSubject));
    setSelectedFilters((current) =>
      JSON.stringify(current) === JSON.stringify(next.selectedFilters)
        ? current
        : cloneStoreFilters(next.selectedFilters),
    );
    setSortOption((current) => (current === next.sortOption ? current : next.sortOption));
    setCurrentPage((current) => (current === next.page ? current : next.page));
    setSearchKeyword((current) => (current === next.searchKeyword ? current : next.searchKeyword));
  }, [location.search]);

  // 상태 → URL 동기화
  useEffect(() => {
    const nextSearch = serializeStorefrontQuery({
      selectedSubject,
      selectedFilters,
      sortOption,
      searchKeyword,
      currentPage,
    });
    const currentSearch = location.search.startsWith("?") ? location.search.slice(1) : location.search;
    if (nextSearch !== currentSearch) {
      navigate(
        { pathname: "/", search: nextSearch ? `?${nextSearch}` : "" },
        { replace: true },
      );
    }
  }, [selectedSubject, selectedFilters, sortOption, searchKeyword, currentPage, location.search, navigate]);

  // 정렬 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!isSortMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsSortMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSortMenuOpen]);

  const visibleBooks = useMemo(() => {
    const filtered = filterStorefrontProducts(catalog, {
      subject: selectedSubject,
      types: selectedFilters.types,
      brands: selectedFilters.brands,
      years: selectedFilters.years,
      conditionGrades: selectedFilters.conditionGrades,
      search: searchKeyword,
    });
    return sortStorefrontProducts(filtered, sortOption);
  }, [catalog, selectedSubject, selectedFilters, searchKeyword, sortOption]);

  const totalPages = Math.max(1, Math.ceil(visibleBooks.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const displayedProducts = visibleBooks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const paginationItems = getPaginationItems(safeCurrentPage, totalPages);
  const selectedFilterCount = countSelectedStoreFilters(selectedFilters);

  const scrollToTop = () => {
    if (sectionTopRef.current) {
      sectionTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSubject = (subject) => {
    if (subject === selectedSubject) return;
    setSelectedSubject(subject);
    setCurrentPage(1);
  };

  const handleToggleFilter = (groupKey, optionValue) => {
    setSelectedFilters((current) => toggleStoreFilterSelection(current, groupKey, optionValue));
    setCurrentPage(1);
  };

  const handleClearGroup = (groupKey) => {
    setSelectedFilters((current) => clearStoreFilterGroup(current, groupKey));
    setCurrentPage(1);
  };

  const handleResetAllFilters = () => {
    setSelectedFilters(createStoreInitialFilters());
    setCurrentPage(1);
  };

  const handleSelectSort = (nextValue) => {
    setIsSortMenuOpen(false);
    if (nextValue === sortOption) return;
    setSortOption(nextValue);
    setCurrentPage(1);
  };

  const handleSearchChange = (event) => {
    setSearchKeyword(event.target.value);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchKeyword("");
    setCurrentPage(1);
  };

  const handleChangePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) return;
    setCurrentPage(nextPage);
    scrollToTop();
  };

  const isEmpty = !isLoading && displayedProducts.length === 0;

  return (
    <section className="public-home-store-grid" aria-label="전체 교재" ref={sectionTopRef}>
      <ContentContainer>
        <div className="public-home-store-grid__layout">
          {/* 좌측 세로 사이드바 (PC) — 모바일에선 그리드 위로 떨어짐 */}
          <aside className="public-home-store-grid__sidebar" aria-label="필터">
            {STORE_FILTER_GROUPS.map((group) => {
              const hasSelected = selectedFilters[group.key].length > 0;
              return (
                <div className="public-home-store-grid__sidebar-group" key={group.key}>
                  <h3 className="public-home-store-grid__sidebar-label">{group.label}</h3>
                  <ul className="public-home-store-grid__sidebar-list" role="list">
                    <li>
                      <button
                        aria-pressed={!hasSelected}
                        className={`public-home-store-grid__sidebar-option ${!hasSelected ? "is-active" : ""}`}
                        onClick={() => handleClearGroup(group.key)}
                        type="button"
                      >
                        전체
                      </button>
                    </li>
                    {group.options.map((option) => {
                      const optionValue = typeof option === "string" ? option : option.value;
                      const optionLabel = getFilterOptionLabel(option);
                      const isActive = selectedFilters[group.key].includes(optionValue);
                      return (
                        <li key={optionValue}>
                          <button
                            aria-pressed={isActive}
                            className={`public-home-store-grid__sidebar-option ${isActive ? "is-active" : ""}`}
                            onClick={() => handleToggleFilter(group.key, optionValue)}
                            type="button"
                          >
                            {optionLabel}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </aside>

          {/* 우측 메인 — 과목 탭 + 툴바 + 그리드 + 페이지네이션 */}
          <div className="public-home-store-grid__main">
            <div className="public-home-store-grid__tabs" role="tablist" aria-label="과목">
              {STORE_SUBJECTS.map((subject) => {
                const isActive = selectedSubject === subject;
                return (
                  <button
                    aria-selected={isActive}
                    className={`public-home-store-grid__tab ${isActive ? "is-active" : ""}`}
                    key={subject}
                    onClick={() => handleSelectSubject(subject)}
                    role="tab"
                    type="button"
                  >
                    {subject}
                  </button>
                );
              })}
            </div>

            {/* 툴바: 검색 + 결과수 + 정렬 */}
            <div className="public-home-store-grid__toolbar">
          <div className="public-home-store-grid__toolbar-left">
            <input
              aria-label="교재 검색"
              className="public-home-store-grid__search-input"
              onChange={handleSearchChange}
              placeholder="교재명, 강사명으로 검색"
              type="search"
              value={searchKeyword}
            />
            {searchKeyword ? (
              <button
                aria-label="검색어 지우기"
                className="public-home-store-grid__search-clear"
                onClick={handleClearSearch}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="public-home-store-grid__toolbar-right">
            <span className="public-home-store-grid__count">
              총 {visibleBooks.length.toLocaleString("ko-KR")}권
            </span>
            <div className="public-home-store-grid__sort-wrap" ref={sortMenuRef}>
              <button
                aria-expanded={isSortMenuOpen}
                aria-haspopup="menu"
                className="public-home-store-grid__sort-button"
                onClick={() => setIsSortMenuOpen((open) => !open)}
                type="button"
              >
                <span>{getSortOptionLabel(sortOption)}</span>
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
                      {sortOption === option.value ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 활성 필터 요약 (있을 때만) */}
        {selectedFilterCount > 0 ? (
          <div className="public-home-store-grid__active-filters">
            <span className="public-home-store-grid__active-label">적용 필터 {selectedFilterCount}개</span>
            <button
              className="public-home-store-grid__reset"
              onClick={handleResetAllFilters}
              type="button"
            >
              전체 초기화
            </button>
          </div>
        ) : null}

        {/* 카드 그리드 */}
        {isLoading ? (
          <div className="public-home-store-grid__list" role="status" aria-live="polite">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ProductCardSkeleton key={`home-store-skeleton-${index}`} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="public-home-store-grid__empty">
            <strong>조건에 맞는 교재가 없어요</strong>
            <p>필터를 줄이거나 다른 과목을 선택해 보세요.</p>
            {selectedFilterCount > 0 ? (
              <button
                className="public-home-store-grid__empty-button"
                onClick={handleResetAllFilters}
                type="button"
              >
                필터 초기화
              </button>
            ) : (
              <button
                className="public-home-store-grid__empty-button"
                onClick={() => handleSelectSubject(STORE_DEFAULT_SUBJECT)}
                type="button"
              >
                전체 보기
              </button>
            )}
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

        {/* 페이지네이션 */}
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
          </div>
        </div>
      </ContentContainer>
    </section>
  );
}

export default HomeStoreGrid;
