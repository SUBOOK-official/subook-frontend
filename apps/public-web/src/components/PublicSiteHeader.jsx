import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import searchIconImage from "../assets/search-icon.svg";
import brandLogoImage from "../assets/brand/logo-horizontal.png";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { createDisplayName } from "../lib/memberPortal";
import { getCartItems } from "../lib/cart";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import {
  STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH,
  STORE_RECENT_SEARCH_LIMIT,
  STORE_RECENT_SEARCH_STORAGE_KEY,
  addRecentSearchTerm,
  buildStoreAutocompleteFromSearchRows,
  hasAutocompleteResults,
  normalizeRecentSearches,
  removeRecentSearchTerm,
} from "../lib/publicStoreSearch";
import { SEARCH_DEBOUNCE_MS } from "../lib/publicStoreNavigation";
import {
  trackCartOpen,
  trackEmptyState,
  trackEvent,
  trackPickupCtaClick,
  trackSelectContent,
  trackSelectItem,
} from "../lib/analytics";
import { BellIcon, CartIcon, ClockIcon, MenuIcon, CloseIcon } from "./icons";

// 자동완성 = 서버 검색 RPC(search_storefront_products, FTS+초성+오타 매칭).
// 예전 방식(최신 500개 스냅샷을 통째로 받아 클라이언트 매칭)은 카탈로그가 500개를
// 넘는 순간 이후 상품이 제안에서 통째로 빠지는 구조라 폐기했다.
// 키워드 단위 30초 캐시 — 같은 키워드 재타이핑(백스페이스 등)에 RPC 재호출 방지.
const AUTOCOMPLETE_CACHE_TTL_MS = 30_000;
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = 50;
const AUTOCOMPLETE_FETCH_LIMIT = 20;
const autocompleteRowsCache = new Map();

async function fetchAutocompleteSearchRows(keyword) {
  const now = Date.now();
  const cached = autocompleteRowsCache.get(keyword);
  if (cached && now - cached.cachedAt < AUTOCOMPLETE_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc("search_storefront_products", {
      p_query: keyword,
      p_limit: AUTOCOMPLETE_FETCH_LIMIT,
    });
    const rows = !error && Array.isArray(data) ? data : [];
    if (autocompleteRowsCache.size >= AUTOCOMPLETE_CACHE_MAX_ENTRIES) {
      const oldestKey = autocompleteRowsCache.keys().next().value;
      autocompleteRowsCache.delete(oldestKey);
    }
    autocompleteRowsCache.set(keyword, { rows, cachedAt: now });
    return rows;
  } catch {
    return [];
  }
}

function readRecentSearches() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORE_RECENT_SEARCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeRecentSearches(parsed);
  } catch {
    return [];
  }
}

function writeRecentSearches(values) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORE_RECENT_SEARCH_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore quota / private mode failures
  }
}

function SuggestionCategoryLabel({ kind }) {
  const label = kind === "book" ? "교재" : kind === "instructor" ? "강사" : "브랜드";
  return <span className="public-search-suggestion__kind">{label}</span>;
}

function SearchSuggestionsPanel({
  autocomplete,
  hasKeyword,
  keyword,
  onClearAllRecent,
  onPickAutocomplete,
  onPickRecent,
  onRemoveRecent,
  onSubmitKeyword,
  recentSearches,
}) {
  const hasAuto = hasAutocompleteResults(autocomplete);

  if (hasKeyword) {
    if (!hasAuto) {
      return (
        <div className="public-search__suggestions" role="listbox">
          <p className="public-search-suggestion__empty">
            "{keyword}"에 맞는 추천을 찾지 못했어요. 그대로 검색하거나, 원하는 교재가 들어오면 알려드릴게요.
          </p>
          {/* 검색 실행 → 그리드 빈 상태의 '입고 알림 받기'(키워드 구독 모달)로 이어지는 단일 동선 */}
          <button
            className="public-search-suggestion__cta"
            onClick={() => onSubmitKeyword?.(keyword)}
            type="button"
          >
            <BellIcon size={14} /> 이 키워드로 입고 알림 받기
          </button>
        </div>
      );
    }
    return (
      <div className="public-search__suggestions" role="listbox">
        {autocomplete.books.map((item) => (
          <button
            className="public-search-suggestion"
            key={item.id}
            onClick={() => onPickAutocomplete(item)}
            role="option"
            type="button"
          >
            <strong>{item.label}</strong>
            <span>
              <SuggestionCategoryLabel kind={item.kind} />
              {item.meta ? <span className="public-search-suggestion__meta">{item.meta}</span> : null}
            </span>
          </button>
        ))}
        {autocomplete.instructors.map((item) => (
          <button
            className="public-search-suggestion"
            key={item.id}
            onClick={() => onPickAutocomplete(item)}
            role="option"
            type="button"
          >
            <strong>{item.label}</strong>
            <span>
              <SuggestionCategoryLabel kind={item.kind} />
              {item.meta ? <span className="public-search-suggestion__meta">{item.meta}</span> : null}
            </span>
          </button>
        ))}
        {autocomplete.brands.map((item) => (
          <button
            className="public-search-suggestion"
            key={item.id}
            onClick={() => onPickAutocomplete(item)}
            role="option"
            type="button"
          >
            <strong>{item.label}</strong>
            <span>
              <SuggestionCategoryLabel kind={item.kind} />
              {item.meta ? <span className="public-search-suggestion__meta">{item.meta}</span> : null}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="public-search__suggestions" role="listbox">
      <p className="public-search-suggestion__header">
        <span>최근 검색어</span>
        {typeof onClearAllRecent === "function" ? (
          <button
            className="public-search-suggestion__header-action"
            onClick={onClearAllRecent}
            type="button"
          >
            전체 삭제
          </button>
        ) : null}
      </p>
      {recentSearches.map((term) => (
        <div className="public-search-suggestion public-search-suggestion--recent" key={`recent-${term}`}>
          <button
            className="public-search-suggestion__recent-button"
            onClick={() => onPickRecent(term)}
            type="button"
          >
            <span aria-hidden="true" className="public-search-suggestion__recent-icon"><ClockIcon size={13} /></span>
            <span>{term}</span>
          </button>
          <button
            aria-label={`최근 검색어 ${term} 삭제`}
            className="public-search-suggestion__recent-remove"
            onClick={() => onRemoveRecent(term)}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function PublicSiteHeader({ onCartClick, searchSlot, hideSearch = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, profile, user, signOut } = usePublicAuth();
  const [cartItemCount, setCartItemCount] = useState(0);

  // 카트 카운트 갱신 트리거 3가지:
  //   1) 인증 상태 변화 (로그인/로그아웃)
  //   2) 라우트 변경 (다른 페이지로 이동할 때마다 헤더 카운트 freshen)
  //   3) 'cart-updated' window event — 같은 페이지에서 카트에 추가/삭제했을 때 명시적 트리거
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setCartItemCount(0);
      return () => {
        cancelled = true;
      };
    }

    const fetchCartCount = async () => {
      try {
        // getCartItems는 { items, error } 형태로 반환. Supabase 미설정 시 localStorage fallback.
        const { items } = await getCartItems();
        if (cancelled) return;
        const total = Array.isArray(items)
          ? items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0)
          : 0;
        setCartItemCount(total);
      } catch {
        if (!cancelled) setCartItemCount(0);
      }
    };
    void fetchCartCount();

    const handleCartUpdated = () => {
      void fetchCartCount();
    };
    window.addEventListener("cart-updated", handleCartUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("cart-updated", handleCartUpdated);
    };
  }, [isAuthenticated, location.pathname]);

  // 미읽음 알림 카운트 — 카트 카운트와 동일 트리거(인증 변화 + 라우트 변경)로 갱신.
  // 알림함에서 읽음 처리 후 다른 페이지로 이동하면 자연히 재조회되어 배지가 줄어든다.
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !isSupabaseConfigured || !supabase) {
      setUnreadNotificationCount(0);
      return () => {
        cancelled = true;
      };
    }

    const fetchUnreadCount = async () => {
      try {
        const { data, error } = await supabase.rpc("count_my_unread_notifications");
        if (cancelled) return;
        setUnreadNotificationCount(error ? 0 : Number(data) || 0);
      } catch {
        if (!cancelled) setUnreadNotificationCount(0);
      }
    };
    void fetchUnreadCount();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.pathname]);

  // 알림/장바구니/마이페이지는 isAuthenticated 일 때만 렌더되므로 클릭 가드는 불필요.
  // 비로그인 사용자는 헤더에서 해당 메뉴 자체가 보이지 않는다.
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [portalNode, setPortalNode] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  const [frameScale, setFrameScale] = useState(1);
  const headerRef = useRef(null);

  // 검색 자동완성 상태
  const [searchValue, setSearchValue] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const [autocomplete, setAutocomplete] = useState({ books: [], instructors: [], brands: [] });
  // 자동완성 결과가 어느 키워드의 응답인지 — 조회 중(빈 결과)에 "제안 0건"을 오계측하지 않기 위함.
  const [autocompleteKeyword, setAutocompleteKeyword] = useState("");
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const searchWrapRef = useRef(null);
  const mobileSearchValueRef = useRef("");

  // debounce
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedKeyword(searchValue.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchValue]);

  // 자동완성 lookup: 키워드가 최소 길이 이상이면 서버 검색 RPC로 제안을 만든다.
  // (전체 카탈로그 대상 FTS라 상품 수와 무관하게 정확한 제안)
  useEffect(() => {
    let cancelled = false;
    const normalizedKeyword = debouncedKeyword;
    if (normalizedKeyword.replace(/\s+/g, "").length < STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH) {
      setAutocomplete({ books: [], instructors: [], brands: [] });
      setAutocompleteKeyword("");
      return undefined;
    }

    (async () => {
      const rows = await fetchAutocompleteSearchRows(normalizedKeyword);
      if (cancelled) return;
      setAutocomplete(buildStoreAutocompleteFromSearchRows(rows, normalizedKeyword));
      setAutocompleteKeyword(normalizedKeyword);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedKeyword]);

  // 모바일 메뉴 열려있을 때 body scroll lock — 중첩 모달과 안전하게 동작하는 공용 훅 사용
  useBodyScrollLock(isMobileMenuOpen);

  // ESC 키로 모바일 메뉴 닫기
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      // GA4 mobile_menu_toggle — ESC 닫기도 다른 닫기 제스처와 같은 이벤트로 묶는다.
      trackEvent("mobile_menu_toggle", { uiAction: "close", closeMethod: "escape" });
      setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    setPortalNode(document.body);
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const node = headerRef.current;
    if (!node) {
      return undefined;
    }

    const sync = () => {
      setHeaderHeight(node.getBoundingClientRect().height);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [portalNode]);

  // 고정 헤더의 실제 높이를 CSS 변수로 노출 → 하위 sticky 요소(예: 스토어 필터 툴바)가
  // 헤더 바로 아래에 붙도록 top 오프셋으로 참조한다. (transform:scale 프레임 보정 포함)
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const value = frameScale > 0 ? headerHeight / frameScale : headerHeight;
    document.documentElement.style.setProperty("--public-sticky-header-height", `${value}px`);
    return undefined;
  }, [headerHeight, frameScale]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncFrameScale = () => {
      const frameElement = document.querySelector(".public-home__frame");
      if (!frameElement) {
        setFrameScale(1);
        return;
      }

      const styleValue = getComputedStyle(frameElement).getPropertyValue("--public-frame-scale").trim();
      const parsedValue = Number.parseFloat(styleValue);
      const nextScale = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
      setFrameScale(nextScale);
    };

    syncFrameScale();
    window.addEventListener("resize", syncFrameScale);

    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(syncFrameScale)
      : null;
    if (observer) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["style", "class"],
        subtree: true,
        childList: true,
      });
    }

    return () => {
      window.removeEventListener("resize", syncFrameScale);
      observer?.disconnect();
    };
  }, []);

  // 자동완성 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!isSuggestionsOpen) return undefined;
    const handlePointerDown = (event) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setIsSuggestionsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsSuggestionsOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSuggestionsOpen]);

  const navigateToSearch = useCallback(
    (query) => {
      const trimmed = String(query ?? "").trim();
      if (!trimmed) return;
      const nextRecent = addRecentSearchTerm(recentSearches, trimmed);
      setRecentSearches(nextRecent);
      writeRecentSearches(nextRecent);
      navigate(`/?q=${encodeURIComponent(trimmed)}`, {
        state: { scrollToStorefront: true },
      });
    },
    [navigate, recentSearches],
  );

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setIsSuggestionsOpen(false);
    // GA4 search_submit — 검색 "실행 의도"(결과 수는 그리드의 search 이벤트가 담당).
    const trimmed = searchValue.trim();
    if (trimmed) {
      trackEvent("search_submit", { searchTerm: trimmed, uiSurface: "header" });
    }
    navigateToSearch(searchValue);
  };

  const handlePickAutocomplete = (item) => {
    setIsSuggestionsOpen(false);
    if (item.kind === "book" && item.productId) {
      // 교재 자동완성 클릭은 상세 페이지로 직접 점프.
      // GA4 select_item — 자동완성발 상세 진입 비중 비교용.
      trackSelectItem("검색 자동완성", {
        productId: item.productId,
        title: item.label,
        quantity: 1,
      });
      const trimmed = item.label.trim();
      const nextRecent = addRecentSearchTerm(recentSearches, trimmed);
      setRecentSearches(nextRecent);
      writeRecentSearches(nextRecent);
      navigate(`/store/${item.productId}`);
      return;
    }
    if (item.kind === "brand") {
      // GA4 search_suggestion_select — 교재(select_item)가 아닌 제안 종류별 클릭 분포.
      trackEvent("search_suggestion_select", {
        suggestionKind: "brand",
        suggestionValue: item.brand,
        searchTerm: debouncedKeyword,
      });
      const nextRecent = addRecentSearchTerm(recentSearches, item.brand);
      setRecentSearches(nextRecent);
      writeRecentSearches(nextRecent);
      navigate(`/?brand=${encodeURIComponent(item.brand)}`, {
        state: { scrollToStorefront: true },
      });
      return;
    }
    // instructor / 일반은 키워드 검색으로 처리
    trackEvent("search_suggestion_select", {
      suggestionKind: item.kind === "instructor" ? "instructor" : "keyword",
      suggestionValue: item.keyword ?? item.label,
      searchTerm: debouncedKeyword,
    });
    navigateToSearch(item.keyword ?? item.label);
  };

  const handlePickRecent = (term) => {
    setIsSuggestionsOpen(false);
    setSearchValue(term);
    // GA4 recent_search_select — 최근 검색어 재진입 비중
    trackEvent("recent_search_select", { searchTerm: term, uiSurface: "header" });
    navigateToSearch(term);
  };

  const handleRemoveRecent = (term) => {
    const next = removeRecentSearchTerm(recentSearches, term);
    setRecentSearches(next);
    writeRecentSearches(next);
    trackEvent("recent_search_remove", { uiSurface: "header" });
  };

  const handleClearAllRecent = () => {
    trackEvent("recent_search_clear_all", { itemCount: recentSearches.length, uiSurface: "header" });
    setRecentSearches([]);
    writeRecentSearches([]);
  };

  // 모바일 드로어 안 검색 폼 (별도 controlled input 없이 form submit으로 처리)
  const handleMobileSearchSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("q")?.toString().trim();
    if (!query) return;
    setIsMobileMenuOpen(false);
    // GA4 search_submit — 드로어 검색은 ui_surface로 구분
    trackEvent("search_submit", { searchTerm: query, uiSurface: "mobile_drawer" });
    navigateToSearch(query);
  };

  // uiSurface: header_desktop / header_mobile / mobile_drawer
  const handleCartClick = (uiSurface = "header_desktop") => {
    // GA4 cart_open — 장바구니 진입은 헤더 한 곳에서만 계측(홈의 onCartClick은 중복 발화 금지).
    trackCartOpen(uiSurface, cartItemCount);

    if (onCartClick) {
      onCartClick();
      return;
    }

    navigate("/cart");
  };

  // 계정 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!isAccountMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  // GA4 logout은 PublicAuthContext.signOut(source)가 발화한다 — 여기서 중복 발화 금지.
  const handleSignOut = async (source = "account_menu") => {
    setIsAccountMenuOpen(false);
    await signOut(source);
    navigate("/", { replace: true });
  };

  const displayName = isAuthenticated
    ? createDisplayName(profile ?? { email: user?.email ?? "" })
    : "";

  const cartBadge = cartItemCount > 0 ? (cartItemCount > 99 ? "99+" : cartItemCount) : null;
  const notificationBadge =
    unreadNotificationCount > 0 ? (unreadNotificationCount > 99 ? "99+" : unreadNotificationCount) : null;
  const visibleRecent = useMemo(
    () => recentSearches.slice(0, STORE_RECENT_SEARCH_LIMIT),
    [recentSearches],
  );
  const hasKeyword = debouncedKeyword.replace(/\s+/g, "").length >= STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH;

  // GA4 empty_state_view — 자동완성 제안 0건(미보유 수요 시그널). 조회가 끝난 키워드에 대해서만,
  // 키워드당 1회. (조회 중 빈 상태는 계측하지 않는다)
  const emptySuggestionTrackedRef = useRef(new Set());
  useEffect(() => {
    if (!isSuggestionsOpen || !hasKeyword) return;
    if (autocompleteKeyword !== debouncedKeyword) return;
    if (hasAutocompleteResults(autocomplete)) return;
    if (emptySuggestionTrackedRef.current.has(debouncedKeyword)) return;
    emptySuggestionTrackedRef.current.add(debouncedKeyword);
    trackEmptyState("search_suggestions", { searchTerm: debouncedKeyword });
  }, [autocomplete, autocompleteKeyword, debouncedKeyword, hasKeyword, isSuggestionsOpen]);

  // 헤더/드로어 내비게이션 클릭 (GA4 select_content) — 어느 진입점이 실제로 쓰이는지.
  const trackNavSelect = (contentId, uiSurface) => {
    trackSelectContent("nav", contentId, { uiSurface });
  };

  const headerNode = (
    <div className="public-sticky-header" ref={headerRef}>
      <ContentContainer as="header" className="public-nav public-site-header">
        <Link className="public-brand" onClick={() => trackNavSelect("home", "header_desktop")} to="/">
          <img alt="수북 SUBOOK" className="public-brand__logo" src={brandLogoImage} />
        </Link>

        {hideSearch ? null : (
        <div className="public-site-header__search">
          {searchSlot ?? (
            <div className="public-search-wrap" ref={searchWrapRef}>
              <form className="public-search" onSubmit={handleSearchSubmit} role="search" aria-label="교재 검색">
                <img alt="" className="public-search__icon" src={searchIconImage} />
                <div className="public-search__field">
                  <input
                    aria-label="교재명 또는 강사명 검색"
                    aria-autocomplete="list"
                    aria-expanded={isSuggestionsOpen}
                    autoComplete="off"
                    className="public-search__input"
                    name="q"
                    onChange={(event) => {
                      setSearchValue(event.target.value);
                      setIsSuggestionsOpen(true);
                    }}
                    onFocus={() => setIsSuggestionsOpen(true)}
                    placeholder="교재명, 강사명으로 검색"
                    type="search"
                    value={searchValue}
                  />
                </div>
              </form>
              {isSuggestionsOpen ? (
                <SearchSuggestionsPanel
                  autocomplete={autocomplete}
                  hasKeyword={hasKeyword}
                  keyword={debouncedKeyword}
                  onClearAllRecent={handleClearAllRecent}
                  onPickAutocomplete={handlePickAutocomplete}
                  onPickRecent={handlePickRecent}
                  onRemoveRecent={handleRemoveRecent}
                  onSubmitKeyword={(value) => {
                    setIsSuggestionsOpen(false);
                    // GA4 — 제안 0건 패널의 '입고 알림 받기' 진입(그리드 빈 상태 모달로 이어짐)
                    trackEvent("search_no_suggestion_cta_click", { searchTerm: value });
                    navigateToSearch(value);
                  }}
                  recentSearches={visibleRecent}
                />
              ) : null}
            </div>
          )}
        </div>
        )}

        <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
          {/* 셀러 전환 동선 — 로그인/비로그인 무관하게 항상 노출. 모바일 드로어에만
              있던 메뉴를 데스크톱 헤더에 primary CTA로 고정. */}
          <Link
            className="public-nav-link public-nav-link--cta"
            onClick={() => trackPickupCtaClick("header_nav")}
            to="/pickup/new"
          >
            교재 판매하기
          </Link>
          {isAuthenticated ? (
            <>
              <button
                aria-label={`알림 ${unreadNotificationCount}개`}
                className="public-nav-link public-nav-link--cart"
                onClick={() => {
                  // GA4 notification_bell_click — 미읽음 수와 함께 알림함 진입 계측
                  trackEvent("notification_bell_click", {
                    unreadCount: unreadNotificationCount,
                    uiSurface: "header_desktop",
                  });
                  navigate("/notifications");
                }}
                type="button"
              >
                <span>알림</span>
                {notificationBadge !== null ? (
                  <span className="public-nav-link__badge">{notificationBadge}</span>
                ) : null}
              </button>
              <button
                aria-label={`장바구니 ${cartItemCount}개`}
                className="public-nav-link public-nav-link--cart"
                onClick={() => handleCartClick("header_desktop")}
                type="button"
              >
                <span>장바구니</span>
                {cartBadge !== null ? (
                  <span className="public-nav-link__badge">{cartBadge}</span>
                ) : null}
              </button>
              <Link className="public-nav-link" onClick={() => trackNavSelect("mypage", "header_desktop")} to="/mypage">
                마이페이지
              </Link>
              <div className="public-nav-account" ref={accountMenuRef}>
                <button
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="menu"
                  className="public-nav-link public-nav-button public-nav-account__trigger"
                  onClick={() => setIsAccountMenuOpen((open) => !open)}
                  type="button"
                >
                  <span>{displayName}님</span>
                  <span aria-hidden="true" className="public-nav-account__caret">▾</span>
                </button>
                {isAccountMenuOpen ? (
                  <div className="public-nav-account__menu" role="menu">
                    <button
                      className="public-nav-account__item public-nav-account__item--danger"
                      onClick={() => handleSignOut("account_menu")}
                      role="menuitem"
                      type="button"
                    >
                      로그아웃
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <Link
              className="public-nav-link public-nav-button"
              onClick={() => trackSelectContent("auth_entry", "login", { uiSurface: "header_desktop" })}
              to="/login"
            >
              로그인/회원가입
            </Link>
          )}
        </nav>

        {/* 모바일 헤더 우측 (768px 미만): 비로그인 = 햄버거만, 로그인 = 장바구니 + 햄버거 */}
        <div className="public-nav-mobile-actions">
          {isAuthenticated ? (
            <>
              <button
                aria-label={`알림 ${unreadNotificationCount}개`}
                className="public-nav-mobile-cart"
                onClick={() => {
                  trackEvent("notification_bell_click", {
                    unreadCount: unreadNotificationCount,
                    uiSurface: "header_mobile",
                  });
                  navigate("/notifications");
                }}
                type="button"
              >
                <BellIcon size={20} />
                {notificationBadge !== null ? (
                  <span className="public-nav-mobile-cart__badge">{notificationBadge}</span>
                ) : null}
              </button>
              <button
                aria-label={`장바구니 ${cartItemCount}개`}
                className="public-nav-mobile-cart"
                onClick={() => handleCartClick("header_mobile")}
                type="button"
              >
                <CartIcon size={20} />
                {cartBadge !== null ? (
                  <span className="public-nav-mobile-cart__badge">{cartBadge}</span>
                ) : null}
              </button>
            </>
          ) : null}
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            className="public-nav-hamburger"
            onClick={() => {
              const nextOpen = !isMobileMenuOpen;
              // GA4 mobile_menu_toggle — 모바일 메뉴 사용률(열기 대비 실제 이동)
              trackEvent("mobile_menu_toggle", {
                uiAction: nextOpen ? "open" : "close",
                ...(nextOpen ? {} : { closeMethod: "hamburger" }),
                isAuthenticated,
              });
              setIsMobileMenuOpen(nextOpen);
            }}
            type="button"
          >
            {isMobileMenuOpen ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </ContentContainer>

      {/* 모바일 드로어 */}
      {isMobileMenuOpen ? (
        <div className="public-nav-drawer" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
          <button
            aria-label="메뉴 닫기"
            className="public-nav-drawer__backdrop"
            onClick={() => {
              trackEvent("mobile_menu_toggle", {
                uiAction: "close",
                closeMethod: "backdrop",
                isAuthenticated,
              });
              setIsMobileMenuOpen(false);
            }}
            type="button"
          />
          <div className="public-nav-drawer__panel">
            {/* 드로어 내부 검색 — recent 기반의 빠른 진입 */}
            <form
              aria-label="교재 검색"
              className="public-nav-drawer__search"
              onSubmit={handleMobileSearchSubmit}
              role="search"
            >
              <input
                aria-label="교재명 또는 강사명 검색"
                className="public-nav-drawer__search-input"
                defaultValue={mobileSearchValueRef.current}
                name="q"
                placeholder="교재명, 강사명으로 검색"
                type="search"
              />
              <button className="public-nav-drawer__search-submit" type="submit">검색</button>
            </form>
            {visibleRecent.length > 0 ? (
              <div className="public-nav-drawer__recent">
                <span className="public-nav-drawer__recent-label">최근 검색어</span>
                <div className="public-nav-drawer__recent-list">
                  {visibleRecent.map((term) => (
                    <button
                      className="public-nav-drawer__recent-chip"
                      key={`mobile-recent-${term}`}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        trackEvent("recent_search_select", {
                          searchTerm: term,
                          uiSurface: "mobile_drawer",
                        });
                        navigateToSearch(term);
                      }}
                      type="button"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {isAuthenticated ? (
              <>
                <button
                  className="public-nav-drawer__item"
                  onClick={() => { setIsMobileMenuOpen(false); handleCartClick("mobile_drawer"); }}
                  type="button"
                >
                  장바구니
                  {cartBadge !== null ? (
                    <span className="public-nav-link__badge" style={{ marginLeft: 8 }}>{cartBadge}</span>
                  ) : null}
                </button>
                <Link
                  className="public-nav-drawer__item"
                  to="/notifications"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    trackEvent("notification_bell_click", {
                      unreadCount: unreadNotificationCount,
                      uiSurface: "mobile_drawer",
                    });
                  }}
                >
                  알림
                  {notificationBadge !== null ? (
                    <span className="public-nav-link__badge" style={{ marginLeft: 8 }}>{notificationBadge}</span>
                  ) : null}
                </Link>
                <Link
                  className="public-nav-drawer__item"
                  to="/mypage"
                  onClick={() => { setIsMobileMenuOpen(false); trackNavSelect("mypage", "mobile_drawer"); }}
                >
                  마이페이지
                </Link>
              </>
            ) : null}
            <Link
              className="public-nav-drawer__item"
              to="/pickup/new"
              onClick={() => { setIsMobileMenuOpen(false); trackPickupCtaClick("mobile_drawer"); }}
            >
              교재 판매하기
            </Link>
            <Link
              className="public-nav-drawer__item"
              to="/faq"
              onClick={() => { setIsMobileMenuOpen(false); trackNavSelect("faq", "mobile_drawer"); }}
            >
              자주 묻는 질문
            </Link>
            <Link
              className="public-nav-drawer__item"
              to="/notices"
              onClick={() => { setIsMobileMenuOpen(false); trackNavSelect("notices", "mobile_drawer"); }}
            >
              공지사항
            </Link>
            <Link
              className="public-nav-drawer__item"
              to="/terms"
              onClick={() => { setIsMobileMenuOpen(false); trackNavSelect("terms", "mobile_drawer"); }}
            >
              이용약관
            </Link>
            <Link
              className="public-nav-drawer__item"
              to="/refund"
              onClick={() => { setIsMobileMenuOpen(false); trackNavSelect("refund", "mobile_drawer"); }}
            >
              환불정책
            </Link>
            <div className="public-nav-drawer__divider" />
            {isAuthenticated ? (
              <>
                <div className="public-nav-drawer__user">{displayName}님</div>
                <button
                  className="public-nav-drawer__item public-nav-drawer__item--danger"
                  onClick={() => { setIsMobileMenuOpen(false); handleSignOut("mobile_drawer"); }}
                  type="button"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                className="public-nav-drawer__item public-nav-drawer__item--primary"
                to="/login"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  trackSelectContent("auth_entry", "login", { uiSurface: "mobile_drawer" });
                }}
              >
                로그인 / 회원가입
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  // spacer 가 transform: scale 이 적용된 frame 내부에 있을 때, 시각적 높이가
  // 축소되므로 1/scale 로 보정하여 viewport 기준 헤더 높이와 일치시킴.
  const spacerHeight = frameScale > 0 ? headerHeight / frameScale : headerHeight;

  return (
    <>
      {portalNode ? createPortal(headerNode, portalNode) : null}
      <div
        aria-hidden="true"
        className="public-sticky-header__spacer"
        style={{ height: spacerHeight }}
      />
    </>
  );
}

export default PublicSiteHeader;
