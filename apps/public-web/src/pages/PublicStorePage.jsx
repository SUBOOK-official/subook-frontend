import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import searchIconImage from "../assets/search-icon.svg";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { getStoreDisplayProducts } from "../lib/publicStoreCards";
import {
  STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH,
  STORE_RECENT_SEARCH_STORAGE_KEY,
  addRecentSearchTerm,
  buildStoreAutocomplete,
  hasAutocompleteResults,
  normalizeRecentSearches,
  removeRecentSearchTerm,
} from "../lib/publicStoreSearch";
import {
  SEARCH_DEBOUNCE_MS,
  STORE_DEFAULT_SUBJECT,
  STORE_FILTER_GROUPS,
  STORE_SORT_OPTIONS,
  STORE_SUBJECTS,
  areSelectedFiltersEqual,
  clearStoreFilterGroup,
  cloneStoreFilters,
  countSelectedStoreFilters,
  createStoreInitialFilters,
  parseStorefrontQuery,
  serializeStorefrontQuery,
  toggleStoreFilterSelection,
} from "../lib/publicStoreNavigation";
import {
  filterStorefrontProducts,
  fetchStorefrontProducts,
  sortStorefrontProducts,
} from "../lib/storefront";

const BOOKS_PER_PAGE = 20;
const MOBILE_BREAKPOINT_PX = 767;
const SUBJECT_TRANSITION_DELAY_MS = 180;
const STORE_SKELETON_CARD_COUNT = 8;
const MOBILE_APPEND_SKELETON_CARD_COUNT = 4;
const MOBILE_FILTER_SHEET_CLOSE_THRESHOLD_PX = 96;
const MOBILE_SORT_SHEET_CLOSE_THRESHOLD_PX = 96;
const MOBILE_INFINITE_SCROLL_ROOT_MARGIN = "0px 0px 20% 0px";
const MOBILE_INFINITE_SCROLL_DELAY_MS = 160;
const SEARCH_BLUR_CLOSE_DELAY_MS = 120;

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

function StoreAppliedFilterChip({ label, onRemove }) {
  return (
    <button
      aria-label={`${label} 필터 제거`}
      className="public-store-filter__active-chip"
      onClick={onRemove}
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}


function SearchSuggestionItem({ icon, label, meta, onSelect }) {
  return (
    <button
      className="public-store-search-item"
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span aria-hidden="true" className="public-store-search-item__icon">
        {icon}
      </span>
      <span className="public-store-search-item__content">
        <strong>{label}</strong>
        {meta ? <span>{meta}</span> : null}
      </span>
    </button>
  );
}

function SearchSection({ icon, title, children }) {
  return (
    <section className="public-store-search-layer__section">
      <header className="public-store-search-layer__section-header">
        <span aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
      </header>
      <div className="public-store-search-layer__section-body">{children}</div>
    </section>
  );
}

function RecentSearchChip({ label, onRemove, onSelect }) {
  return (
    <div className="public-store-recent-chip">
      <button className="public-store-recent-chip__label" onClick={onSelect} type="button">
        {label}
      </button>
      <button
        aria-label={`${label} 최근 검색어 제거`}
        className="public-store-recent-chip__remove"
        onClick={onRemove}
        type="button"
      >
        ×
      </button>
    </div>
  );
}


function StoreCard({ product, isFavorite, onToggleFavorite }) {
  return (
    <ProductCard
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      product={product}
    />
  );
}

function StoreSkeletonCard() {
  return <ProductCardSkeleton />;
}

function PublicStorePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  const pageTopRef = useRef(null);
  const searchInputRef = useRef(null);
  const subjectButtonRefs = useRef({});
  const sortMenuRef = useRef(null);
  const mobileFilterDragStateRef = useRef(null);
  const mobileSortDragStateRef = useRef(null);
  const mobileInfiniteScrollSentinelRef = useRef(null);
  const mobileAppendTimerRef = useRef(null);
  const navigationModeRef = useRef("replace");
  const previousSubjectRef = useRef(null);
  const initialQueryState = useMemo(
    () => parseStorefrontQuery(location.search),
    [location.search],
  );
  const initialMobileViewport =
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false;
  const [selectedSubject, setSelectedSubject] = useState(initialQueryState.selectedSubject);
  const [selectedFilters, setSelectedFilters] = useState(initialQueryState.selectedFilters);
  const [debouncedDesktopFilters, setDebouncedDesktopFilters] = useState(() =>
    cloneStoreFilters(initialQueryState.selectedFilters),
  );
  const [draftMobileFilters, setDraftMobileFilters] = useState(() =>
    cloneStoreFilters(initialQueryState.selectedFilters),
  );
  const [sortOption, setSortOption] = useState(initialQueryState.sortOption);
  const [currentPage, setCurrentPage] = useState(initialQueryState.page);
  const [searchKeyword, setSearchKeyword] = useState(initialQueryState.searchKeyword);
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState(
    initialQueryState.searchKeyword,
  );
  const [recentSearches, setRecentSearches] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogSource, setCatalogSource] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubjectTransitioning, setIsSubjectTransitioning] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(initialMobileViewport);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(Boolean(initialQueryState.searchKeyword));
  const [isMobileFilterSheetOpen, setIsMobileFilterSheetOpen] = useState(false);
  const [mobileFilterSheetOffset, setMobileFilterSheetOffset] = useState(0);
  const [isMobileSortSheetOpen, setIsMobileSortSheetOpen] = useState(false);
  const [mobileSortSheetOffset, setMobileSortSheetOffset] = useState(0);
  const [isMobileAppending, setIsMobileAppending] = useState(false);
  const [error, setError] = useState("");
  const appliedFilters = isMobileViewport ? selectedFilters : debouncedDesktopFilters;

  useEffect(() => {
    return () => {
      if (mobileAppendTimerRef.current) {
        window.clearTimeout(mobileAppendTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mobileAppendTimerRef.current) {
      window.clearTimeout(mobileAppendTimerRef.current);
      mobileAppendTimerRef.current = null;
    }

    setIsMobileAppending(false);
  }, [appliedFilters, debouncedSearchKeyword, selectedSubject, sortOption]);

  useEffect(() => {
    const nextQueryState = parseStorefrontQuery(location.search);

    setSelectedSubject((currentValue) =>
      currentValue === nextQueryState.selectedSubject ? currentValue : nextQueryState.selectedSubject,
    );
    setSelectedFilters((currentValue) =>
      areSelectedFiltersEqual(currentValue, nextQueryState.selectedFilters)
        ? currentValue
        : cloneStoreFilters(nextQueryState.selectedFilters),
    );
    setDebouncedDesktopFilters((currentValue) =>
      areSelectedFiltersEqual(currentValue, nextQueryState.selectedFilters)
        ? currentValue
        : cloneStoreFilters(nextQueryState.selectedFilters),
    );
    setSortOption((currentValue) =>
      currentValue === nextQueryState.sortOption ? currentValue : nextQueryState.sortOption,
    );
    setCurrentPage((currentValue) =>
      currentValue === nextQueryState.page ? currentValue : nextQueryState.page,
    );
    setSearchKeyword((currentValue) =>
      currentValue === nextQueryState.searchKeyword ? currentValue : nextQueryState.searchKeyword,
    );
    setDebouncedSearchKeyword((currentValue) =>
      currentValue === nextQueryState.searchKeyword ? currentValue : nextQueryState.searchKeyword,
    );
  }, [location.search]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedRecentSearches = JSON.parse(
        window.localStorage.getItem(STORE_RECENT_SEARCH_STORAGE_KEY) ?? "[]",
      );
      setRecentSearches(normalizeRecentSearches(storedRecentSearches));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        STORE_RECENT_SEARCH_STORAGE_KEY,
        JSON.stringify(normalizeRecentSearches(recentSearches)),
      );
    } catch {
      // localStorage access can fail in private mode; keep the in-memory state instead.
    }
  }, [recentSearches]);

  useEffect(() => {
    if (isMobileViewport) {
      setDebouncedDesktopFilters(cloneStoreFilters(selectedFilters));
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDebouncedDesktopFilters(cloneStoreFilters(selectedFilters));
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [isMobileViewport, selectedFilters]);

  useEffect(() => {
    if (!isMobileFilterSheetOpen) {
      setDraftMobileFilters(cloneStoreFilters(selectedFilters));
    }
  }, [isMobileFilterSheetOpen, selectedFilters]);

  useEffect(() => {
    const nextSearch = serializeStorefrontQuery({
      selectedSubject,
      selectedFilters: appliedFilters,
      sortOption,
      searchKeyword: debouncedSearchKeyword,
      currentPage,
    });
    const currentSearch = location.search.startsWith("?") ? location.search.slice(1) : location.search;

    if (nextSearch !== currentSearch) {
      const replace = navigationModeRef.current !== "push";
      navigate(
        {
          pathname: "/store",
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace },
      );
      navigationModeRef.current = "replace";
    }
  }, [
    appliedFilters,
    currentPage,
    debouncedSearchKeyword,
    location.search,
    navigate,
    selectedSubject,
    sortOption,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

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
    if (!isMobileViewport) {
      if (mobileAppendTimerRef.current) {
        window.clearTimeout(mobileAppendTimerRef.current);
        mobileAppendTimerRef.current = null;
      }

      setIsMobileAppending(false);
      setIsMobileSearchOpen(false);
      setIsMobileFilterSheetOpen(false);
      setMobileFilterSheetOffset(0);
      setIsMobileSortSheetOpen(false);
      setMobileSortSheetOffset(0);
      return;
    }

    setIsSortMenuOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileFilterSheetOpen) {
      return undefined;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDraftMobileFilters(cloneStoreFilters(selectedFilters));
        setIsMobileFilterSheetOpen(false);
        setMobileFilterSheetOffset(0);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileFilterSheetOpen, selectedFilters]);

  useEffect(() => {
    if (!isMobileSortSheetOpen) {
      return undefined;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMobileSortSheetOpen(false);
        setMobileSortSheetOffset(0);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileSortSheetOpen]);

  useEffect(() => {
    if (!isMobileSearchOpen || !isMobileViewport) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [isMobileSearchOpen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !isMobileSearchOpen) {
      return undefined;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMobileSearchOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileSearchOpen, isMobileViewport]);

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

  const loadCatalog = async () => {
    try {
      setError("");
      const result = await fetchStorefrontProducts({ limit: 500, sort: "popular" });

      setCatalog(result.products ?? result.books ?? []);
      setCatalogSource(result.source ?? "");
      if (result.error) {
        setError("스토어 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setCatalog([]);
      setCatalogSource("");
      setError("스토어 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  useEffect(() => {
    let isActive = true;

    const boot = async () => {
      try {
        setIsLoading(true);
        setError("");
        const result = await fetchStorefrontProducts({ limit: 500, sort: "popular" });
        if (!isActive) {
          return;
        }

        setCatalog(result.products ?? result.books ?? []);
        setCatalogSource(result.source ?? "");
        if (result.error) {
          setError("스토어 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      } catch {
        if (isActive) {
          setCatalog([]);
          setCatalogSource("");
          setError("스토어 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
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
    if (previousSubjectRef.current === null) {
      previousSubjectRef.current = selectedSubject;
      return;
    }

    if (previousSubjectRef.current === selectedSubject) {
      return;
    }

    previousSubjectRef.current = selectedSubject;
    setIsSubjectTransitioning(true);

    const timer = window.setTimeout(() => {
      setIsSubjectTransitioning(false);
    }, SUBJECT_TRANSITION_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [selectedSubject]);

  useEffect(() => {
    const selectedButton = subjectButtonRefs.current[selectedSubject];
    if (!selectedButton) {
      return;
    }

    selectedButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedSubject]);

  const visibleBooks = useMemo(() => {
    const filteredBooks = filterStorefrontProducts(catalog, {
      subject: selectedSubject,
      types: appliedFilters.types,
      brands: appliedFilters.brands,
      years: appliedFilters.years,
      conditionGrades: appliedFilters.conditionGrades,
      search: debouncedSearchKeyword,
    });

    return sortStorefrontProducts(filteredBooks, sortOption);
  }, [appliedFilters, catalog, debouncedSearchKeyword, selectedSubject, sortOption]);

  const mobileFilterPreviewCount = useMemo(
    () =>
      filterStorefrontProducts(catalog, {
        subject: selectedSubject,
        types: draftMobileFilters.types,
        brands: draftMobileFilters.brands,
        years: draftMobileFilters.years,
        conditionGrades: draftMobileFilters.conditionGrades,
        search: debouncedSearchKeyword,
      }).length,
    [catalog, debouncedSearchKeyword, draftMobileFilters, selectedSubject],
  );

  const trimmedSearchKeyword = searchKeyword.trim();
  const autocompleteSuggestions = useMemo(
    () => buildStoreAutocomplete(catalog, debouncedSearchKeyword),
    [catalog, debouncedSearchKeyword],
  );
  const hasSearchAutocomplete = hasAutocompleteResults(autocompleteSuggestions);
  const hasRecentSearches = recentSearches.length > 0;
  const shouldShowAutocompleteResults =
    trimmedSearchKeyword.length >= STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH;
  const shouldShowSearchLayer =
    trimmedSearchKeyword.length === 0 || shouldShowAutocompleteResults || hasRecentSearches;
  const shouldShowSearchRecommendationError =
    shouldShowAutocompleteResults && Boolean(error) && catalog.length === 0;

  const activeFilterChips = useMemo(() => {
    const chips = [];

    STORE_FILTER_GROUPS.forEach((group) => {
      selectedFilters[group.key].forEach((value) => {
        const optionLabel = getFilterOptionLabel(
          group.options.find((option) => (typeof option === "string" ? option : option.value) === value) ?? value,
        );

        chips.push({
          key: `${group.key}-${value}`,
          label: optionLabel,
          onRemove: () => handleToggleCommittedFilter(group.key, value),
        });
      });
    });

    return chips;
  }, [selectedFilters]);

  const hasActiveFilters = activeFilterChips.length > 0;
  const selectedFilterCount = countSelectedStoreFilters(selectedFilters);
  const draftMobileFilterCount = countSelectedStoreFilters(draftMobileFilters);
  const emptyStateAction =
    hasActiveFilters
      ? { label: "필터 초기화", onClick: () => handleResetFilters() }
      : debouncedSearchKeyword.trim()
        ? { label: "검색 초기화", onClick: () => handleClearSearch() }
        : selectedSubject !== STORE_DEFAULT_SUBJECT
          ? {
              label: "전체 과목 보러가기",
              onClick: () => {
                navigationModeRef.current = "push";
                setSelectedSubject(STORE_DEFAULT_SUBJECT);
                setCurrentPage(1);
              },
            }
          : null;
  const { displayedProducts, safeCurrentPage, totalPages } = useMemo(
    () =>
      getStoreDisplayProducts(visibleBooks, currentPage, {
        isMobileViewport,
        pageSize: BOOKS_PER_PAGE,
      }),
    [currentPage, isMobileViewport, visibleBooks],
  );
  const isListLoading = isLoading || isSubjectTransitioning;
  const hasCatalogError = Boolean(error) && catalog.length === 0;
  const hasEmptyResults = !isListLoading && !hasCatalogError && displayedProducts.length === 0;
  const hasMoreMobilePages = isMobileViewport && safeCurrentPage < totalPages;
  const paginationItems = isMobileViewport ? [] : getPaginationItems(safeCurrentPage, totalPages);

  useEffect(() => {
    setCurrentPage((currentValue) => Math.min(currentValue, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (
      !isMobileViewport ||
      isListLoading ||
      hasCatalogError ||
      isMobileAppending ||
      !hasMoreMobilePages ||
      !mobileInfiniteScrollSentinelRef.current
    ) {
      return undefined;
    }

    const sentinelNode = mobileInfiniteScrollSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        observer.disconnect();
        setIsMobileAppending(true);
        mobileAppendTimerRef.current = window.setTimeout(() => {
          mobileAppendTimerRef.current = null;
          navigationModeRef.current = "replace";
          setCurrentPage((currentValue) => Math.min(currentValue + 1, totalPages));
          setIsMobileAppending(false);
        }, MOBILE_INFINITE_SCROLL_DELAY_MS);
      },
      {
        rootMargin: MOBILE_INFINITE_SCROLL_ROOT_MARGIN,
      },
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [
    hasCatalogError,
    hasMoreMobilePages,
    isListLoading,
    isMobileAppending,
    isMobileViewport,
    totalPages,
  ]);

  const handleToggleFavorite = async (productId) => {
    if (!requireMember("favorite")) {
      return;
    }

    await toggleFavorite(productId);
  };

  const handleGoToCart = () => {
    if (!requireMember("cart", "/cart")) {
      return;
    }

    navigate("/cart");
  };

  const handlePickupRequest = () => {
    if (!requireMember("pickupRequest")) {
      return;
    }

    navigate("/mypage#sales");
  };

  const handleSelectSubject = (subject) => {
    if (subject === selectedSubject) {
      return;
    }

    navigationModeRef.current = "push";
    setSelectedSubject(subject);
    setCurrentPage(1);
  };

  const handleToggleCommittedFilter = (groupKey, optionValue) => {
    navigationModeRef.current = "replace";
    setSelectedFilters((currentFilters) => toggleStoreFilterSelection(currentFilters, groupKey, optionValue));
    setCurrentPage(1);
  };

  const handleClearCommittedFilterGroup = (groupKey) => {
    navigationModeRef.current = "replace";
    setSelectedFilters((currentFilters) => clearStoreFilterGroup(currentFilters, groupKey));
    setCurrentPage(1);
  };

  const handleToggleDraftMobileFilter = (groupKey, optionValue) => {
    setDraftMobileFilters((currentFilters) => toggleStoreFilterSelection(currentFilters, groupKey, optionValue));
  };

  const handleOpenMobileFilterSheet = () => {
    setIsSortMenuOpen(false);
    setIsMobileSortSheetOpen(false);
    setMobileSortSheetOffset(0);
    setDraftMobileFilters(cloneStoreFilters(selectedFilters));
    setMobileFilterSheetOffset(0);
    setIsMobileFilterSheetOpen(true);
  };

  const handleCloseMobileFilterSheet = () => {
    setDraftMobileFilters(cloneStoreFilters(selectedFilters));
    setMobileFilterSheetOffset(0);
    setIsMobileFilterSheetOpen(false);
  };

  const handleApplyMobileFilters = () => {
    navigationModeRef.current = "replace";
    setSelectedFilters(cloneStoreFilters(draftMobileFilters));
    setCurrentPage(1);
    setMobileFilterSheetOffset(0);
    setIsMobileFilterSheetOpen(false);
  };

  const handleResetDraftMobileFilters = () => {
    setDraftMobileFilters(createStoreInitialFilters());
  };

  const scrollStorePageToTop = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      if (pageTopRef.current) {
        pageTopRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const focusSearchInput = () => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const rememberRecentSearch = (value) => {
    setRecentSearches((currentValues) => addRecentSearchTerm(currentValues, value));
  };

  const handleSubmitSearch = (keyword = searchKeyword) => {
    const nextKeyword = keyword.trim();

    navigationModeRef.current = "replace";
    setSearchKeyword(nextKeyword);
    setDebouncedSearchKeyword(nextKeyword);
    setCurrentPage(1);

    if (!nextKeyword) {
      setIsSearchFocused(true);
      focusSearchInput();
      return;
    }

    rememberRecentSearch(nextKeyword);
    setIsSearchFocused(false);

    if (isMobileViewport) {
      setIsMobileSearchOpen(false);
    }
  };

  const handleSearchChange = (event) => {
    navigationModeRef.current = "replace";
    setSearchKeyword(event.target.value);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    navigationModeRef.current = "replace";
    setSearchKeyword("");
    setDebouncedSearchKeyword("");
    setCurrentPage(1);
    setIsSearchFocused(true);
    focusSearchInput();
  };

  const handleSelectBookSuggestion = (suggestion) => {
    rememberRecentSearch(suggestion.label);
    setIsSearchFocused(false);

    if (isMobileViewport) {
      setIsMobileSearchOpen(false);
    }

    navigate(`/store/${suggestion.productId}`);
  };

  const handleSelectInstructorSuggestion = (suggestion) => {
    handleSubmitSearch(suggestion.keyword);
  };

  const handleSelectBrandSuggestion = (suggestion) => {
    rememberRecentSearch(suggestion.label);
    navigationModeRef.current = "replace";
    setSearchKeyword("");
    setDebouncedSearchKeyword("");
    setSelectedFilters((currentFilters) => {
      const nextFilters = cloneStoreFilters(currentFilters);
      nextFilters.brands = [suggestion.brand];
      return nextFilters;
    });
    setCurrentPage(1);
    setIsSearchFocused(false);

    if (isMobileViewport) {
      setIsMobileSearchOpen(false);
    }
  };

  const handleResetFilters = () => {
    navigationModeRef.current = "replace";
    setSelectedFilters(createStoreInitialFilters());
    setCurrentPage(1);
  };

  const handleSelectSortOption = (nextSortOption) => {
    setIsSortMenuOpen(false);
    setIsMobileSortSheetOpen(false);
    setMobileSortSheetOffset(0);

    if (nextSortOption === sortOption) {
      return;
    }

    navigationModeRef.current = "replace";
    setSortOption(nextSortOption);
    setCurrentPage(1);
    scrollStorePageToTop();
  };

  const handleRefresh = async () => {
    await loadCatalog();
  };

  const handleChangePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) {
      return;
    }

    navigationModeRef.current = "push";
    setCurrentPage(nextPage);
    scrollStorePageToTop();
  };

  const handleMobileFilterSheetPointerDown = (event) => {
    mobileFilterDragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMobileFilterSheetPointerMove = (event) => {
    const dragState = mobileFilterDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setMobileFilterSheetOffset(Math.max(0, event.clientY - dragState.startY));
  };

  const handleMobileFilterSheetPointerUp = (event) => {
    const dragState = mobileFilterDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dragDistance = Math.max(0, event.clientY - dragState.startY);
    mobileFilterDragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (dragDistance >= MOBILE_FILTER_SHEET_CLOSE_THRESHOLD_PX) {
      handleCloseMobileFilterSheet();
      return;
    }

    setMobileFilterSheetOffset(0);
  };

  const handleOpenMobileSortSheet = () => {
    setIsSortMenuOpen(false);
    setIsMobileFilterSheetOpen(false);
    setMobileFilterSheetOffset(0);
    setMobileSortSheetOffset(0);
    setIsMobileSortSheetOpen(true);
  };

  const handleCloseMobileSortSheet = () => {
    setMobileSortSheetOffset(0);
    setIsMobileSortSheetOpen(false);
  };

  const handleMobileSortSheetPointerDown = (event) => {
    mobileSortDragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMobileSortSheetPointerMove = (event) => {
    const dragState = mobileSortDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setMobileSortSheetOffset(Math.max(0, event.clientY - dragState.startY));
  };

  const handleMobileSortSheetPointerUp = (event) => {
    const dragState = mobileSortDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dragDistance = Math.max(0, event.clientY - dragState.startY);
    mobileSortDragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (dragDistance >= MOBILE_SORT_SHEET_CLOSE_THRESHOLD_PX) {
      handleCloseMobileSortSheet();
      return;
    }

    setMobileSortSheetOffset(0);
  };

  const handleOpenMobileSearch = () => {
    setIsMobileFilterSheetOpen(false);
    setIsMobileSortSheetOpen(false);
    setMobileSortSheetOffset(0);
    setIsMobileSearchOpen(true);
    setIsSearchFocused(true);
  };

  const handleCloseMobileSearch = () => {
    setIsMobileSearchOpen(false);
    setIsSearchFocused(false);
  };

  const handleSelectRecentSearch = (value) => {
    handleSubmitSearch(value);
  };

  const handleRemoveRecentSearch = (value) => {
    setRecentSearches((currentValues) => removeRecentSearchTerm(currentValues, value));
  };

  const handleClearRecentSearches = () => {
    setRecentSearches([]);
  };

  const recentSearchSection = hasRecentSearches ? (
    <section className="public-store-search-layer__section public-store-search-layer__section--recent">
      <div className="public-store-search-layer__recent-header">
        <strong>최근 검색</strong>
        <button className="public-store-search-layer__clear" onClick={handleClearRecentSearches} type="button">
          전체삭제
        </button>
      </div>
      <div className="public-store-recent-chip-list">
        {recentSearches.map((value) => (
          <RecentSearchChip
            key={value}
            label={value}
            onRemove={() => handleRemoveRecentSearch(value)}
            onSelect={() => handleSelectRecentSearch(value)}
          />
        ))}
      </div>
    </section>
  ) : null;

  const searchLayerContent = (
    <div className="public-store-search-layer__content">
      {shouldShowAutocompleteResults ? (
        shouldShowSearchRecommendationError ? (
          <div className="public-store-search-layer__state public-store-search-layer__state--error" role="alert">
            <strong>추천 검색어를 불러오지 못했어요</strong>
            <span>Enter 키로 스토어 전체 검색을 계속할 수 있어요</span>
          </div>
        ) : hasSearchAutocomplete ? (
          <>
            {autocompleteSuggestions.books.length > 0 ? (
              <SearchSection icon="📚" title="교재">
                {autocompleteSuggestions.books.map((suggestion) => (
                  <SearchSuggestionItem
                    icon="📚"
                    key={suggestion.id}
                    label={suggestion.label}
                    meta={suggestion.meta}
                    onSelect={() => handleSelectBookSuggestion(suggestion)}
                  />
                ))}
              </SearchSection>
            ) : null}

            {autocompleteSuggestions.instructors.length > 0 ? (
              <SearchSection icon="👤" title="강사">
                {autocompleteSuggestions.instructors.map((suggestion) => (
                  <SearchSuggestionItem
                    icon="👤"
                    key={suggestion.id}
                    label={suggestion.label}
                    meta={suggestion.meta}
                    onSelect={() => handleSelectInstructorSuggestion(suggestion)}
                  />
                ))}
              </SearchSection>
            ) : null}

            {autocompleteSuggestions.brands.length > 0 ? (
              <SearchSection icon="🏷" title="브랜드">
                {autocompleteSuggestions.brands.map((suggestion) => (
                  <SearchSuggestionItem
                    icon="🏷"
                    key={suggestion.id}
                    label={suggestion.label}
                    meta={suggestion.meta}
                    onSelect={() => handleSelectBrandSuggestion(suggestion)}
                  />
                ))}
              </SearchSection>
            ) : null}
          </>
        ) : (
          <div className="public-store-search-layer__state">
            <strong>일치하는 추천 결과가 없어요</strong>
            <span>Enter 키로 스토어 전체 검색을 계속할 수 있어요</span>
          </div>
        )
      ) : !hasRecentSearches ? (
        <div className="public-store-search-layer__state">
          <strong>교재명, 강사명, 브랜드를 검색해보세요</strong>
          <span>두 글자 이상 입력하면 추천 결과가 표시됩니다</span>
        </div>
      ) : null}

      {recentSearchSection}
    </div>
  );

  const renderSearchForm = ({ inOverlay = false } = {}) => (
    <section
      className={`public-store-search-panel ${inOverlay ? "public-store-search-panel--overlay" : ""}`}
      aria-label="키워드 검색"
    >
      <form
        className="public-search public-store-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmitSearch();
        }}
      >
        <img alt="" className="public-search__icon" src={searchIconImage} />
        <div className="public-search__field">
          <input
            aria-label="교재명 또는 강사명 검색"
            className="public-search__input"
            onBlur={() => {
              if (!inOverlay) {
                window.setTimeout(() => setIsSearchFocused(false), SEARCH_BLUR_CLOSE_DELAY_MS);
              }
            }}
            onChange={handleSearchChange}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="교재명, 강사명으로 검색"
            ref={searchInputRef}
            type="search"
            value={searchKeyword}
          />
          {searchKeyword ? (
            <button
              aria-label="검색어 지우기"
              className="public-search__clear"
              onClick={handleClearSearch}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
      </form>

      {!inOverlay && isSearchFocused && shouldShowSearchLayer ? (
        <div className="public-store-search-layer" aria-label="검색 추천">
          {searchLayerContent}
        </div>
      ) : null}
    </section>
  );

  const pageContent = (
    <div className="public-store-page">
      <div className="public-top-area public-store-page__top" ref={pageTopRef}>
        <ContentContainer as="header" className="public-nav public-store-header">
          <Link className="public-brand" to="/">
            SUBOOK
          </Link>

          {!isMobileViewport ? <div className="public-store-header__search">{renderSearchForm()}</div> : null}

          <nav aria-label="유틸리티 메뉴" className="public-nav-actions public-store-header__actions">
            {isMobileViewport ? (
              <button
                aria-label="검색 열기"
                className="public-store-header__icon-button"
                onClick={handleOpenMobileSearch}
                type="button"
              >
                <img alt="" src={searchIconImage} />
              </button>
            ) : null}
            <button className="public-nav-link public-nav-link--cart" onClick={handleGoToCart} type="button">
              <span>장바구니</span>
            </button>
            <Link className="public-nav-link" to="/mypage">
              마이페이지
            </Link>
            <Link className="public-nav-link public-nav-button" to="/login">
              로그인/회원가입
            </Link>
          </nav>
        </ContentContainer>

        <ContentContainer className="public-menu" role="tablist" aria-label="상단 메뉴">
          <Link aria-selected className="public-menu-tab public-menu-tab--active" role="tab" to="/store">
            스토어          </Link>
          <button
            aria-selected={false}
            className="public-menu-tab"
            onClick={handlePickupRequest}
            role="tab"
            type="button"
          >
            판매하기
          </button>
        </ContentContainer>

        <ContentContainer as="section" className="public-store-discovery">
          <div className="public-store-discovery__header">
            <div>
              <p className="public-store-discovery__eyebrow">Store</p>
              <h1 className="public-store-discovery__title">과목별로 필요한 교재를 빠르게 찾아보세요</h1>
              {catalogSource === "mock" ? (
                <span className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                  Mock 데이터 테스트 중
                </span>
              ) : null}
            </div>
            <p aria-live="polite" className="public-store-discovery__count">
              {visibleBooks.length.toLocaleString("ko-KR")}권의 교재
            </p>
          </div>
        </ContentContainer>
      </div>

      <section className="public-store-tabs-section" aria-label="과목별 네비게이션">
        <ContentContainer>
          <div className="public-store-tabs" role="tablist" aria-label="과목">
            {STORE_SUBJECTS.map((subject) => {
              const isSelected = selectedSubject === subject;

              return (
                <button
                  aria-selected={isSelected}
                  className={`public-store-tab ${isSelected ? "is-active" : ""}`}
                  key={subject}
                  onClick={() => handleSelectSubject(subject)}
                  ref={(node) => {
                    subjectButtonRefs.current[subject] = node;
                  }}
                  role="tab"
                  type="button"
                >
                  <span>{subject}</span>
                </button>
              );
            })}
          </div>
        </ContentContainer>
      </section>

      {!isMobileViewport ? (
        <ContentContainer as="section" className="public-store-filter__detail" aria-label="상세 필터">
          {STORE_FILTER_GROUPS.map((group) => {
            const hasSelectedValues = selectedFilters[group.key].length > 0;

            return (
              <div className="public-store-filter__group" key={group.key}>
                <div className="public-store-filter__label">
                  <span>{group.label}</span>
                </div>

                <div className="public-store-filter__chips">
                  <button
                    aria-pressed={!hasSelectedValues}
                    className={`public-store-filter__chip ${!hasSelectedValues ? "is-active" : ""}`}
                    onClick={() => handleClearCommittedFilterGroup(group.key)}
                    type="button"
                  >
                    전체
                  </button>

                  {group.options.map((option) => {
                    const optionValue = typeof option === "string" ? option : option.value;
                    const optionLabel = getFilterOptionLabel(option);
                    const isActive = selectedFilters[group.key].includes(optionValue);

                    return (
                      <button
                        aria-pressed={isActive}
                        className={`public-store-filter__chip ${isActive ? "is-active" : ""}`}
                        key={optionValue}
                        onClick={() => handleToggleCommittedFilter(group.key, optionValue)}
                        type="button"
                      >
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {hasActiveFilters ? (
            <div className="public-store-filter__summary">
              <span className="public-store-filter__summary-title">적용된 필터:</span>
              <div className="public-store-filter__active-chips">
                {activeFilterChips.map((chip) => (
                  <StoreAppliedFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
                ))}
              </div>

              <button className="public-store-button public-store-button--ghost" onClick={handleResetFilters} type="button">
                초기화
              </button>
            </div>
          ) : null}
        </ContentContainer>
      ) : null}

      <ContentContainer as="section" className="public-store-toolbar" aria-label="정렬 및 결과 상태">
        {isMobileViewport ? (
          <>
            <div className="public-store-toolbar__mobile-row">
              <button
                aria-expanded={isMobileFilterSheetOpen}
                aria-haspopup="dialog"
                className={`public-store-toolbar__filter-trigger ${hasActiveFilters ? "is-active" : ""}`}
                onClick={handleOpenMobileFilterSheet}
                type="button"
              >
                <span aria-hidden="true">☰</span>
                <span>{selectedFilterCount > 0 ? `필터 (${selectedFilterCount})` : "필터"}</span>
              </button>

              <button
                aria-expanded={isMobileSortSheetOpen}
                aria-haspopup="dialog"
                className="public-store-toolbar__sort"
                onClick={handleOpenMobileSortSheet}
                type="button"
              >
                <span>{getSortOptionLabel(sortOption)}</span>
                <span aria-hidden="true">▾</span>
              </button>
            </div>

            {hasActiveFilters ? (
              <div className="public-store-toolbar__applied-row">
                <span className="public-store-toolbar__applied-label">적용:</span>
                <div className="public-store-toolbar__applied-chips">
                  {activeFilterChips.map((chip) => (
                    <StoreAppliedFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="public-store-toolbar__summary">
              <strong>총 {visibleBooks.length.toLocaleString("ko-KR")}권</strong>
            </div>

            <div className="public-store-toolbar__actions">
              <div className="public-store-route__sort-wrap" ref={sortMenuRef}>
                <button
                  aria-expanded={isSortMenuOpen}
                  aria-haspopup="menu"
                  className="public-store-toolbar__sort"
                  onClick={() => setIsSortMenuOpen((currentValue) => !currentValue)}
                  type="button"
                >
                  <span>{getSortOptionLabel(sortOption)}</span>
                  <span aria-hidden="true">▾</span>
                </button>

                {isSortMenuOpen ? (
                  <div className="public-store-route__sort-menu" role="menu">
                    {STORE_SORT_OPTIONS.map((option) => (
                      <button
                        aria-checked={sortOption === option.value}
                        className={`public-store-route__sort-option ${sortOption === option.value ? "is-active" : ""}`}
                        key={option.value}
                        onClick={() => handleSelectSortOption(option.value)}
                        role="menuitemradio"
                        type="button"
                      >
                        <span>{option.label}</span>
                        {sortOption === option.value ? (
                          <span aria-hidden="true" className="public-store-route__sort-option-check">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </ContentContainer>

      {error && !hasCatalogError ? (
        <ContentContainer as="section">
          <div className="public-store-inline-error" role="status">
            <span>{error}</span>
            <button className="public-store-button public-store-button--ghost" onClick={handleRefresh} type="button">
              다시 시도
            </button>
          </div>
        </ContentContainer>
      ) : null}

      <ContentContainer as="section" className="public-store-list" aria-label="스토어 상품 목록">
        {hasCatalogError ? (
          <div className="public-store-state-card public-store-state-card--error" role="alert">
            <div className="public-store-state-card__icon" aria-hidden="true">
              !
            </div>
            <strong>스토어 데이터를 불러오지 못했어요</strong>
            <span>네트워크 상태를 확인한 뒤 다시 시도해 주세요</span>
            <button className="public-store-button public-store-button--primary" onClick={handleRefresh} type="button">
              다시 시도
            </button>
          </div>
        ) : isListLoading ? (
          <div className="public-store-list__grid" role="status" aria-live="polite">
            {Array.from({ length: STORE_SKELETON_CARD_COUNT }, (_, index) => (
              <StoreSkeletonCard key={`store-skeleton-${index}`} />
            ))}
          </div>
        ) : hasEmptyResults ? (
          <div className="public-store-state-card" role="status">
            <div className="public-store-state-card__icon" aria-hidden="true">
              🔎
            </div>
            <strong>조건에 맞는 교재가 없어요</strong>
            <ul className="public-store-state-card__list">
              <li>필터 조건을 줄여보세요</li>
              <li>다른 과목으로 탐색해보세요</li>
            </ul>
            {emptyStateAction ? (
              <button
                className="public-store-button public-store-button--primary"
                onClick={emptyStateAction.onClick}
                type="button"
              >
                {emptyStateAction.label}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="public-store-list__grid">
            {displayedProducts.map((product) => (
              <StoreCard
                isFavorite={favoriteIds.includes(product.id)}
                key={product.id}
                onToggleFavorite={handleToggleFavorite}
                product={product}
              />
            ))}
          </div>
        )}

        {isMobileViewport && isMobileAppending ? (
          <div className="public-store-list__grid public-store-list__grid--append" role="status" aria-live="polite">
            {Array.from({ length: MOBILE_APPEND_SKELETON_CARD_COUNT }, (_, index) => (
              <StoreSkeletonCard key={`store-append-skeleton-${index}`} />
            ))}
          </div>
        ) : null}

        {isMobileViewport && hasMoreMobilePages && !hasCatalogError && !isListLoading ? (
          <div className="public-store-list__loader-anchor" ref={mobileInfiniteScrollSentinelRef} aria-hidden="true" />
        ) : null}
      </ContentContainer>

      {!isMobileViewport && totalPages > 1 ? (
        <ContentContainer as="section" className="public-store-pagination" aria-label="페이지 탐색">
          <button
            className="public-store-pagination__arrow"
            disabled={safeCurrentPage === 1}
            onClick={() => handleChangePage(safeCurrentPage - 1)}
            type="button"
          >
            &lt;
          </button>

          <div className="public-store-pagination__pages">
            {paginationItems.map((item) =>
              typeof item === "number" ? (
                <button
                  className={`public-store-pagination__page ${item === safeCurrentPage ? "is-active" : ""}`}
                  key={item}
                  onClick={() => handleChangePage(item)}
                  type="button"
                >
                  {item}
                </button>
              ) : (
                <span className="public-store-pagination__ellipsis" key={item}>
                  ...
                </span>
              ),
            )}
          </div>

          <button
            className="public-store-pagination__arrow"
            disabled={safeCurrentPage === totalPages}
            onClick={() => handleChangePage(safeCurrentPage + 1)}
            type="button"
          >
            &gt;
          </button>
        </ContentContainer>
      ) : null}

      {isMobileViewport && isMobileSearchOpen ? (
        <div className="public-store-search-overlay">
          <section
            aria-label="스토어 검색"
            aria-modal="true"
            className="public-store-search-overlay__surface"
            role="dialog"
          >
            <header className="public-store-search-overlay__header">
              <button
                aria-label="검색 닫기"
                className="public-store-search-overlay__back"
                onClick={handleCloseMobileSearch}
                type="button"
              >
                ‹              </button>
              <div className="public-store-search-overlay__form">{renderSearchForm({ inOverlay: true })}</div>
            </header>

            <div className="public-store-search-overlay__body">{searchLayerContent}</div>
          </section>
        </div>
      ) : null}

      {isMobileViewport && isMobileSortSheetOpen ? (
        <div
          className="public-store-filter-sheet public-store-sort-sheet"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseMobileSortSheet();
            }
          }}
        >
          <section
            aria-labelledby="public-store-sort-sheet-title"
            aria-modal="true"
            className="public-store-filter-sheet__surface public-store-sort-sheet__surface"
            role="dialog"
            style={{
              transform: mobileSortSheetOffset > 0 ? `translateY(${mobileSortSheetOffset}px)` : undefined,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="public-store-filter-sheet__handle-area"
              onPointerCancel={handleMobileSortSheetPointerUp}
              onPointerDown={handleMobileSortSheetPointerDown}
              onPointerMove={handleMobileSortSheetPointerMove}
              onPointerUp={handleMobileSortSheetPointerUp}
            >
              <span aria-hidden="true" className="public-store-filter-sheet__handle" />
            </div>

            <div className="public-store-sort-sheet__header">
              <h2 className="public-store-sort-sheet__title" id="public-store-sort-sheet-title">
                정렬
              </h2>
            </div>

            <div className="public-store-sort-sheet__body" role="menu" aria-label="정렬 옵션">
              {STORE_SORT_OPTIONS.map((option) => (
                <button
                  aria-checked={sortOption === option.value}
                  className={`public-store-sort-sheet__option ${sortOption === option.value ? "is-active" : ""}`}
                  key={option.value}
                  onClick={() => handleSelectSortOption(option.value)}
                  role="menuitemradio"
                  type="button"
                >
                  <span>{option.label}</span>
                  {sortOption === option.value ? (
                    <span aria-hidden="true" className="public-store-sort-sheet__check">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isMobileViewport && isMobileFilterSheetOpen ? (
        <div
          className="public-store-filter-sheet"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseMobileFilterSheet();
            }
          }}
        >
          <section
            aria-labelledby="public-store-filter-sheet-title"
            aria-modal="true"
            className="public-store-filter-sheet__surface"
            role="dialog"
            style={{
              transform: mobileFilterSheetOffset > 0 ? `translateY(${mobileFilterSheetOffset}px)` : undefined,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="public-store-filter-sheet__handle-area"
              onPointerCancel={handleMobileFilterSheetPointerUp}
              onPointerDown={handleMobileFilterSheetPointerDown}
              onPointerMove={handleMobileFilterSheetPointerMove}
              onPointerUp={handleMobileFilterSheetPointerUp}
            >
              <span aria-hidden="true" className="public-store-filter-sheet__handle" />
            </div>

            <div className="public-store-filter-sheet__header">
              <h2 className="public-store-filter-sheet__title" id="public-store-filter-sheet-title">
                필터
              </h2>
              <button
                className="public-store-filter-sheet__reset"
                disabled={draftMobileFilterCount === 0}
                onClick={handleResetDraftMobileFilters}
                type="button"
              >
                초기화              </button>
            </div>

            <div className="public-store-filter-sheet__body">
              {STORE_FILTER_GROUPS.map((group) => (
                <div className="public-store-filter-sheet__group" key={group.key}>
                  <h3 className="public-store-filter-sheet__group-title">{group.label}</h3>
                  <div className="public-store-filter__chips">
                    {group.options.map((option) => {
                      const optionValue = typeof option === "string" ? option : option.value;
                      const optionLabel = getFilterOptionLabel(option);
                      const isActive = draftMobileFilters[group.key].includes(optionValue);

                      return (
                        <button
                          aria-pressed={isActive}
                          className={`public-store-filter__chip ${isActive ? "is-active" : ""}`}
                          key={`${group.key}-${optionValue}`}
                          onClick={() => handleToggleDraftMobileFilter(group.key, optionValue)}
                          type="button"
                        >
                          {optionLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="public-store-filter-sheet__footer">
              <button
                className="public-store-button public-store-button--primary public-store-button--full"
                onClick={handleApplyMobileFilters}
                type="button"
              >
                결과 {mobileFilterPreviewCount.toLocaleString("ko-KR")}권 보러가기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <PublicFooter />
      {memberGateDialog}
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicStorePage;
