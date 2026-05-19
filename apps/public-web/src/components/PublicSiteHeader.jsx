import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import searchIconImage from "../assets/search-icon.svg";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { createDisplayName } from "../lib/memberPortal";
import { getCartItems } from "../lib/cart";
import { fetchStorefrontProducts } from "../lib/storefront";
import {
  STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH,
  STORE_RECENT_SEARCH_LIMIT,
  STORE_RECENT_SEARCH_STORAGE_KEY,
  addRecentSearchTerm,
  buildStoreAutocomplete,
  hasAutocompleteResults,
  normalizeRecentSearches,
  removeRecentSearchTerm,
} from "../lib/publicStoreSearch";
import { SEARCH_DEBOUNCE_MS } from "../lib/publicStoreNavigation";

// catalog snapshot은 헤더 단 한 곳에서만 캐싱하면 충분.
// 30초 in-memory 캐시 — 사용자 한 명이 짧은 시간에 여러 글자를 치는 동안
// Supabase RPC를 반복 호출하지 않게 한다.
const CATALOG_CACHE_TTL_MS = 30_000;
let catalogCachedAt = 0;
let catalogCache = null;
let catalogInflight = null;

async function loadCatalogSnapshot() {
  const now = Date.now();
  if (catalogCache && now - catalogCachedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache;
  }

  if (catalogInflight) {
    return catalogInflight;
  }

  catalogInflight = (async () => {
    try {
      const result = await fetchStorefrontProducts({ limit: 500, sort: "latest" });
      catalogCache = Array.isArray(result.products) ? result.products : [];
      catalogCachedAt = Date.now();
      return catalogCache;
    } catch {
      // 실패해도 캐시는 비우지 않고 빈 배열로 진행. 다음 시도에서 다시 fetch.
      return [];
    } finally {
      catalogInflight = null;
    }
  })();

  return catalogInflight;
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
  recentSearches,
}) {
  const hasAuto = hasAutocompleteResults(autocomplete);

  if (hasKeyword) {
    if (!hasAuto) {
      return (
        <div className="public-search__suggestions" role="listbox">
          <p className="public-search-suggestion__empty">
            "{keyword}"에 맞는 추천을 찾지 못했어요. 그대로 검색해 보세요.
          </p>
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
            <span aria-hidden="true" className="public-search-suggestion__recent-icon">🕘</span>
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

function PublicSiteHeader({ onCartClick, searchSlot }) {
  const navigate = useNavigate();
  const { isAuthenticated, profile, user, signOut } = usePublicAuth();
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [cartItemCount, setCartItemCount] = useState(0);

  // 안 읽은 알림 카운트 폴링.
  // - 라우트 변경 시 매번 fetch하면 페이지 이동마다 RPC가 호출되어 Supabase 비용 증가.
  // - 인증 상태가 바뀔 때만 새 interval을 설정하고, 폴링 주기를 120초로 늘려 트래픽 절반으로.
  useEffect(() => {
    if (!isAuthenticated || !supabase) {
      setUnreadNotifCount(0);
      return undefined;
    }
    let cancelled = false;
    const fetchCount = async () => {
      const { data, error } = await supabase.rpc("count_my_unread_notifications");
      if (cancelled || error) return;
      setUnreadNotifCount(Number(data) || 0);
    };
    void fetchCount();
    const interval = window.setInterval(fetchCount, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  // 카트 카운트는 인증 상태가 바뀔 때 + 라우트 진입 직후에만 한 번씩 가져온다.
  // 카트 페이지에서의 수정은 자기 페이지에서 재계산하므로 헤더는 진입 시 fetch면 충분.
  // 비로그인 사용자는 로컬 카트도 보여주기 위해 동일 함수 사용 (localStorage 기반).
  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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

  // 자동완성 lookup: 키워드가 최소 길이 이상이면 catalog snapshot에 대해 buildStoreAutocomplete.
  useEffect(() => {
    let cancelled = false;
    const normalizedKeyword = debouncedKeyword;
    if (normalizedKeyword.replace(/\s+/g, "").length < STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH) {
      setAutocomplete({ books: [], instructors: [], brands: [] });
      return undefined;
    }

    (async () => {
      const catalog = await loadCatalogSnapshot();
      if (cancelled) return;
      setAutocomplete(buildStoreAutocomplete(catalog, normalizedKeyword));
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedKeyword]);

  // 모바일 메뉴 열려있을 때 body scroll lock
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (isMobileMenuOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [isMobileMenuOpen]);

  // ESC 키로 모바일 메뉴 닫기
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
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
    navigateToSearch(searchValue);
  };

  const handlePickAutocomplete = (item) => {
    setIsSuggestionsOpen(false);
    if (item.kind === "book" && item.productId) {
      // 교재 자동완성 클릭은 상세 페이지로 직접 점프.
      const trimmed = item.label.trim();
      const nextRecent = addRecentSearchTerm(recentSearches, trimmed);
      setRecentSearches(nextRecent);
      writeRecentSearches(nextRecent);
      navigate(`/store/${item.productId}`);
      return;
    }
    if (item.kind === "brand") {
      const nextRecent = addRecentSearchTerm(recentSearches, item.brand);
      setRecentSearches(nextRecent);
      writeRecentSearches(nextRecent);
      navigate(`/?brand=${encodeURIComponent(item.brand)}`, {
        state: { scrollToStorefront: true },
      });
      return;
    }
    // instructor / 일반은 키워드 검색으로 처리
    navigateToSearch(item.keyword ?? item.label);
  };

  const handlePickRecent = (term) => {
    setIsSuggestionsOpen(false);
    setSearchValue(term);
    navigateToSearch(term);
  };

  const handleRemoveRecent = (term) => {
    const next = removeRecentSearchTerm(recentSearches, term);
    setRecentSearches(next);
    writeRecentSearches(next);
  };

  const handleClearAllRecent = () => {
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
    navigateToSearch(query);
  };

  const handleCartClick = () => {
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

  const handleSignOut = async () => {
    setIsAccountMenuOpen(false);
    await signOut();
    navigate("/", { replace: true });
  };

  const displayName = isAuthenticated
    ? createDisplayName(profile ?? { email: user?.email ?? "" })
    : "";

  const cartBadge = cartItemCount > 0 ? (cartItemCount > 99 ? "99+" : cartItemCount) : null;
  const visibleRecent = useMemo(
    () => recentSearches.slice(0, STORE_RECENT_SEARCH_LIMIT),
    [recentSearches],
  );
  const hasKeyword = debouncedKeyword.replace(/\s+/g, "").length >= STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH;

  const headerNode = (
    <div className="public-sticky-header" ref={headerRef}>
      <ContentContainer as="header" className="public-nav public-site-header">
        <Link className="public-brand" to="/">
          SUBOOK®
        </Link>

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
                  recentSearches={visibleRecent}
                />
              ) : null}
            </div>
          )}
        </div>

        <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
          {isAuthenticated ? (
            <>
              <Link
                aria-label={`알림 ${unreadNotifCount}개`}
                className="public-nav-link public-nav-link--wishlist"
                to="/notifications"
              >
                <span aria-hidden="true" className="public-nav-link__icon" style={{ color: "#3B82F6" }}>🔔</span>
                <span>알림</span>
                {unreadNotifCount > 0 ? (
                  <span className="public-nav-link__badge">{unreadNotifCount > 99 ? "99+" : unreadNotifCount}</span>
                ) : null}
              </Link>
              <button
                aria-label={`장바구니 ${cartItemCount}개`}
                className="public-nav-link public-nav-link--cart"
                onClick={handleCartClick}
                type="button"
              >
                <span aria-hidden="true" className="public-nav-link__icon">🛒</span>
                <span>장바구니</span>
                {cartBadge !== null ? (
                  <span className="public-nav-link__badge">{cartBadge}</span>
                ) : null}
              </button>
              <Link className="public-nav-link" to="/mypage">
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
                      onClick={handleSignOut}
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
            <Link className="public-nav-link public-nav-button" to="/login">
              로그인/회원가입
            </Link>
          )}
        </nav>

        {/* 모바일 헤더 우측 (768px 미만): 비로그인 = 햄버거만, 로그인 = 장바구니 + 햄버거 */}
        <div className="public-nav-mobile-actions">
          {isAuthenticated ? (
            <button
              aria-label={`장바구니 ${cartItemCount}개`}
              className="public-nav-mobile-cart"
              onClick={handleCartClick}
              type="button"
            >
              <span aria-hidden="true">🛒</span>
              {cartBadge !== null ? (
                <span className="public-nav-mobile-cart__badge">{cartBadge}</span>
              ) : null}
            </button>
          ) : null}
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            className="public-nav-hamburger"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </ContentContainer>

      {/* 모바일 드로어 */}
      {isMobileMenuOpen ? (
        <div className="public-nav-drawer" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
          <button
            aria-label="메뉴 닫기"
            className="public-nav-drawer__backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
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
                  onClick={() => { setIsMobileMenuOpen(false); handleCartClick(); }}
                  type="button"
                >
                  <span aria-hidden="true" style={{ marginRight: 8 }}>🛒</span>
                  장바구니
                  {cartBadge !== null ? (
                    <span className="public-nav-link__badge" style={{ marginLeft: 8 }}>{cartBadge}</span>
                  ) : null}
                </button>
                <Link
                  className="public-nav-drawer__item"
                  onClick={() => setIsMobileMenuOpen(false)}
                  to="/notifications"
                >
                  <span aria-hidden="true" style={{ marginRight: 8 }}>🔔</span>
                  알림함
                  {unreadNotifCount > 0 ? (
                    <span className="public-nav-link__badge" style={{ marginLeft: 8 }}>
                      {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                    </span>
                  ) : null}
                </Link>
                <Link className="public-nav-drawer__item" to="/mypage" onClick={() => setIsMobileMenuOpen(false)}>
                  마이페이지
                </Link>
              </>
            ) : null}
            <Link className="public-nav-drawer__item" to="/pickup/new" onClick={() => setIsMobileMenuOpen(false)}>
              교재 판매하기
            </Link>
            <Link className="public-nav-drawer__item" to="/faq" onClick={() => setIsMobileMenuOpen(false)}>
              자주 묻는 질문
            </Link>
            <div className="public-nav-drawer__divider" />
            {isAuthenticated ? (
              <>
                <div className="public-nav-drawer__user">{displayName}님</div>
                <button
                  className="public-nav-drawer__item public-nav-drawer__item--danger"
                  onClick={() => { setIsMobileMenuOpen(false); handleSignOut(); }}
                  type="button"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                className="public-nav-drawer__item public-nav-drawer__item--primary"
                to="/login"
                onClick={() => setIsMobileMenuOpen(false)}
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
