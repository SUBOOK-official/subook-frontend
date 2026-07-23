import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import ContentContainer from "../ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../ProductCard";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../icons";
import {
  HOME_SIDEBAR_FILTER_GROUP_KEYS,
  STORE_DEFAULT_SORT,
  STORE_DEFAULT_SUBJECT,
  STORE_FILTER_GROUPS,
  STORE_SEARCH_SORT_OPTION,
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
import usePublicMemberGate from "../../lib/publicMemberGate";
import { subscribeRestockKeyword } from "../../lib/publicRestock";

const HOME_SIDEBAR_FILTER_GROUPS = STORE_FILTER_GROUPS.filter((group) =>
  HOME_SIDEBAR_FILTER_GROUP_KEYS.includes(group.key),
);
import { fetchStorefrontProducts } from "../../lib/storefront";

const ITEMS_PER_PAGE = 28;
// 모바일은 카드가 세로로 쌓여 한 페이지당 개수를 더 적게 잡는다.
const MOBILE_ITEMS_PER_PAGE = 12;
const SKELETON_COUNT = 8;
const MOBILE_BREAKPOINT_PX = 767;

function getFilterOptionLabel(option) {
  return typeof option === "string" ? option : option.label;
}

function getSortOptionLabel(sortValue) {
  if (sortValue === STORE_SEARCH_SORT_OPTION.value) {
    return STORE_SEARCH_SORT_OPTION.label;
  }
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

  // 서버 페이지네이션 모델 — products는 데스크톱에선 "현재 페이지", 모바일에선 "누적 목록".
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(initialQueryState.selectedSubject);
  const [selectedFilters, setSelectedFilters] = useState(initialQueryState.selectedFilters);
  const [sortOption, setSortOption] = useState(initialQueryState.sortOption);
  const [currentPage, setCurrentPage] = useState(initialQueryState.page);
  const [searchKeyword, setSearchKeyword] = useState(initialQueryState.searchKeyword);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const requestSeqRef = useRef(0);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false,
  );
  // 페이지당 개수 — 모바일은 더 적게. 페이지네이션은 웹/모바일 공통.
  const pageSize = isMobileViewport ? MOBILE_ITEMS_PER_PAGE : ITEMS_PER_PAGE;
  // 모바일 필터 바텀시트 (codex UX 감사: 390px에서 사이드바가 258px 차지 → 트리거 + 시트로 줄임)
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  useBodyScrollLock(isFilterSheetOpen);
  useEffect(() => {
    if (!isFilterSheetOpen) return undefined;
    const handler = (e) => {
      if (e.key === "Escape") setIsFilterSheetOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFilterSheetOpen]);

  // 검색 조건 키 — 과목/필터/검색어/정렬이 하나라도 바뀌면 새 질의로 취급.
  const conditionKey = useMemo(
    () =>
      JSON.stringify({
        subject: selectedSubject,
        filters: selectedFilters,
        search: searchKeyword,
        sort: sortOption,
      }),
    [selectedSubject, selectedFilters, searchKeyword, sortOption],
  );

  // 검색어 유무에 따른 기본 정렬(관련도순 ↔ 인기순) 전환은 URL 파스/직렬화 레이어
  // (parseStorefrontQuery의 fallback + serialize의 impliedSort)가 단일 소스로 처리한다.

  // 서버 질의 — 웹/모바일 공통 페이지네이션(현재 페이지 교체). 모바일은 pageSize만 작다.
  // 늦게 도착한 옛 응답이 새 응답을 덮지 않도록 요청 시퀀스로 가드.
  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeqRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const result = await fetchStorefrontProducts({
          subject: selectedSubject,
          types: selectedFilters.types,
          brands: selectedFilters.brands,
          years: selectedFilters.years,
          conditionGrades: selectedFilters.conditionGrades,
          search: searchKeyword,
          sort: sortOption,
          limit: pageSize,
          offset: (Math.max(1, currentPage) - 1) * pageSize,
        });
        if (cancelled || seq !== requestSeqRef.current) return;

        const rows = result.products ?? result.books ?? [];
        setTotalCount(result.totalCount ?? rows.length);
        setProducts(rows);
      } catch {
        if (!cancelled && seq === requestSeqRef.current) {
          setProducts([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled && seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // conditionKey가 subject/filters/search/sort를 모두 포괄한다. pageSize는 isMobileViewport 파생.
  }, [conditionKey, currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // 뷰포트 추적 (페이지네이션 vs 무한 스크롤 분기)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const syncViewport = (event) => setIsMobileViewport(event.matches);
    syncViewport(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }
    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
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
  //   - location.pathname === "/" 가드: 다른 페이지에서 발동되면 강제로 "/"로 튕기는 사고 방지
  //   - 의존성에서 location.search 제외:
  //       URL 외부 변경(예: 로고 클릭 → /로 이동)은 위 'URL → 상태' useEffect가 처리.
  //       이 useEffect까지 같이 발동되면 state가 아직 old value인 채로 URL을 다시 복원해서
  //       무한 진동(/?page=15 ↔ /) 이 발생함.
  //     → state 변경에만 반응하도록 dep을 정리하고, 안에서는 window.location.search를 직접 읽어
  //       최신 URL과 비교한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    const nextSearch = serializeStorefrontQuery({
      selectedSubject,
      selectedFilters,
      sortOption,
      searchKeyword,
      currentPage,
    });
    const currentSearch = window.location.search.replace(/^\?/, "");
    if (nextSearch !== currentSearch) {
      navigate(
        { pathname: "/", search: nextSearch ? `?${nextSearch}` : "" },
        { replace: true },
      );
    }
  }, [selectedSubject, selectedFilters, sortOption, searchKeyword, currentPage, navigate]);

  // 헤더 검색이 다른 페이지에서 발생해서 / 로 이동한 경우 그리드로 스크롤
  useEffect(() => {
    if (location.state?.scrollToStorefront && sectionTopRef.current) {
      sectionTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      // state 1회 사용 후 제거 (뒤로가기 시 재발동 방지)
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  // 사이드바 sticky: 이전에는 JS로 translateY를 직접 따라가게 했지만, PublicPageFrame이
  // 더 이상 transform: scale을 사용하지 않으므로 순수 CSS `position: sticky; top: 96px;`
  // (index.css의 `.public-home-store-grid__sidebar`)로 환원했다. JS sticky 코드 제거.

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

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedProducts = products;
  const paginationItems = getPaginationItems(safeCurrentPage, totalPages);
  const selectedFilterCount = countSelectedStoreFilters(selectedFilters);

  // stale page(필터로 줄어든 뒤 page=15, 혹은 뷰포트 전환으로 pageSize가 바뀐 경우)를
  // 마지막 페이지로 스냅백. 웹/모바일 공통.
  useEffect(() => {
    if (isLoading) return;
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [isLoading, currentPage, totalPages]);

  // 필터/검색/정렬이 바뀌면 모바일에서 결과를 툴바(헤더 바로 아래)에 앵커링
  const didMountFilterResetRef = useRef(false);
  useEffect(() => {
    // 최초 마운트(초기 URL 파싱)에는 스크롤을 건드리지 않는다.
    if (!didMountFilterResetRef.current) {
      didMountFilterResetRef.current = true;
      return;
    }

    if (isMobileViewport) {
      scrollResultsUnderHeader();
    }
  }, [conditionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 모바일: 필터/정렬을 적용하면 노출 카드 수가 리셋되며 목록이 짧아져 스크롤이
  // 위(신규 입고)로 튕긴다. 대신 sticky 헤더 바로 아래(=필터·정렬 툴바 위치)에
  // 결과가 붙도록 앵커링한다.
  const scrollResultsUnderHeader = () => {
    if (!sectionTopRef.current) return;
    const scroller = document.scrollingElement || document.documentElement;
    const headerHeight =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--public-sticky-header-height")) || 0;
    const target = sectionTopRef.current.getBoundingClientRect().top + scroller.scrollTop - headerHeight;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "auto" });
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

  // 사이드바 '선택 초기화하기' — 과목 + 필터(유형·브랜드 등)를 모두 초기 상태로.
  const handleResetAllSelections = () => {
    setSelectedSubject(STORE_DEFAULT_SUBJECT);
    setSelectedFilters(createStoreInitialFilters());
    setCurrentPage(1);
  };

  const handleClearSearchKeyword = () => {
    setSearchKeyword("");
    // 검색 전용 정렬(관련도순)은 검색 해제와 함께 평시 기본(인기순)으로 복원
    if (sortOption === STORE_SEARCH_SORT_OPTION.value) {
      setSortOption(STORE_DEFAULT_SORT);
    }
    setCurrentPage(1);
  };

  const handleSelectSort = (nextValue) => {
    setIsSortMenuOpen(false);
    if (nextValue === sortOption) return;
    setSortOption(nextValue);
    setCurrentPage(1);
  };

  // 페이지 이동 시 목록 상단으로 복귀 (2026-07-24 사용자 결정: 위치 유지 방식 대신 기존 동작 유지)
  const scrollToTop = () => {
    if (sectionTopRef.current) {
      sectionTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleChangePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) return;
    setCurrentPage(nextPage);
    scrollToTop();
  };

  // 빈 상태 회복: 가장 많이 선택된 필터를 토글 해제하는 추천 칩.
  // 최대 2개까지만 노출하여 인지 부담 최소화.
  const emptyStateRecoverableFilters = useMemo(() => {
    const candidates = [];
    Object.entries(selectedFilters).forEach(([groupKey, values]) => {
      if (!Array.isArray(values)) return;
      values.forEach((value) => candidates.push({ groupKey, value }));
    });
    return candidates.slice(0, 2);
  }, [selectedFilters]);

  // 사이드바 하단 '선택한 항목' 요약 칩. 과목(전체 제외) + 유형·브랜드 선택값.
  // 각 칩 클릭 시 개별 해제, 아래 '선택 초기화하기'로 전체 해제.
  const selectedSummaryChips = useMemo(() => {
    const chips = [];
    if (selectedSubject && selectedSubject !== STORE_DEFAULT_SUBJECT) {
      chips.push({
        key: `subject:${selectedSubject}`,
        label: selectedSubject,
        onRemove: () => {
          setSelectedSubject(STORE_DEFAULT_SUBJECT);
          setCurrentPage(1);
        },
      });
    }
    HOME_SIDEBAR_FILTER_GROUPS.forEach((group) => {
      (selectedFilters[group.key] ?? []).forEach((value) => {
        const option = group.options.find(
          (opt) => (typeof opt === "string" ? opt : opt.value) === value,
        );
        chips.push({
          key: `${group.key}:${value}`,
          label: option ? getFilterOptionLabel(option) : value,
          onRemove: () => {
            setSelectedFilters((current) =>
              toggleStoreFilterSelection(current, group.key, value),
            );
            setCurrentPage(1);
          },
        });
      });
    });
    return chips;
  }, [selectedSubject, selectedFilters]);

  // 키워드 입고 알림 — 예전엔 window.confirm→카카오 채널로 흩어져 있던 동선을
  // 실제 구독(subscribe_restock_keyword)으로 통일. 입고되면 알림함(인앱)으로 알림.
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const [restockModal, setRestockModal] = useState(null); // { keyword } | null
  const [restockKeywordInput, setRestockKeywordInput] = useState("");
  const [restockSubmitState, setRestockSubmitState] = useState({ busy: false, done: false, error: "" });

  const handleNotifyRestock = () => {
    if (!requireMember("입고 알림 신청")) {
      return;
    }
    setRestockKeywordInput(searchKeyword.trim());
    setRestockSubmitState({ busy: false, done: false, error: "" });
    setRestockModal({ keyword: searchKeyword.trim() });
  };

  const handleSubmitRestockKeyword = async () => {
    const keyword = restockKeywordInput.trim();
    if (keyword.length < 2) {
      setRestockSubmitState({ busy: false, done: false, error: "키워드는 2자 이상 입력해 주세요." });
      return;
    }
    setRestockSubmitState({ busy: true, done: false, error: "" });
    const result = await subscribeRestockKeyword(keyword);
    if (result.success === false) {
      setRestockSubmitState({ busy: false, done: false, error: result.error || "등록에 실패했어요." });
      return;
    }
    setRestockSubmitState({ busy: false, done: true, error: "" });
  };

  const isEmpty = !isLoading && displayedProducts.length === 0;

  // 검색 중일 때만 관련도순 노출 (기본 목록에선 의미 없는 정렬이라 숨김)
  const sortMenuOptions = searchKeyword
    ? [STORE_SEARCH_SORT_OPTION, ...STORE_SORT_OPTIONS]
    : STORE_SORT_OPTIONS;

  // 과목 선택 — 사이드바 최상단 그룹. 필터(유형·브랜드)와 같은 칩 UI를 쓰되 과목은
  // 단일 선택(라디오처럼)이라 toggle이 아니라 handleSelectSubject로 교체한다.
  // STORE_SUBJECTS[0] === "전체"라 첫 옵션이 곧 초기화 역할(별도 리셋 버튼 불필요).
  const subjectGroupJsx = (
    <div className="public-home-store-grid__sidebar-group" key="subject">
      <h3 className="public-home-store-grid__sidebar-label">과목</h3>
      <ul className="public-home-store-grid__sidebar-list" role="list">
        {STORE_SUBJECTS.map((subject) => {
          const isActive = selectedSubject === subject;
          return (
            <li key={subject}>
              <button
                aria-pressed={isActive}
                className={`public-home-store-grid__sidebar-option ${isActive ? "is-active" : ""}`}
                onClick={() => handleSelectSubject(subject)}
                type="button"
              >
                {subject}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  // 사이드바·바텀시트 양쪽에서 재사용하는 필터 그룹 마크업. dependency가 많아
  // memoize 효과 미미하므로 그냥 inline 변수.
  const filterGroupsJsx = HOME_SIDEBAR_FILTER_GROUPS.map((group) => {
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
  });

  return (
    <section className="public-home-store-grid" aria-label="전체 교재" ref={sectionTopRef}>
      <ContentContainer>
        <div className="public-home-store-grid__layout">
          {/* 좌측 세로 사이드바 (PC만) — 모바일에선 CSS로 숨기고 바텀시트로 노출 */}
          <aside className="public-home-store-grid__sidebar" aria-label="필터">
            {subjectGroupJsx}
            {filterGroupsJsx}
            {selectedSummaryChips.length > 0 ? (
              <div className="public-home-store-grid__sidebar-selected">
                <ul className="public-home-store-grid__selected-chips" role="list">
                  {selectedSummaryChips.map((chip) => (
                    <li key={chip.key}>
                      <button
                        aria-label={`${chip.label} 선택 해제`}
                        className="public-home-store-grid__selected-chip"
                        onClick={chip.onRemove}
                        type="button"
                      >
                        <span>{chip.label}</span>
                        <CloseIcon size={12} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="public-home-store-grid__reset-link"
                  onClick={handleResetAllSelections}
                  type="button"
                >
                  선택 초기화하기
                </button>
              </div>
            ) : null}
          </aside>

          {/* 우측 메인 — 툴바 + 그리드 + 페이지네이션 (과목 선택은 좌측 사이드바로 이동) */}
          <div className="public-home-store-grid__main">
            {/* 툴바: (모바일) 필터 트리거 + 정렬 */}
            <div className="public-home-store-grid__toolbar">
          {/* 모바일 전용 필터 트리거 — 데스크톱에선 CSS로 숨김 (좌측 sidebar 사용) */}
          <button
            aria-haspopup="dialog"
            className="public-home-store-grid__mobile-filter-trigger"
            onClick={() => setIsFilterSheetOpen(true)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="currentColor"
              height="16"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.33409 4.54491C6.3494 3.63637 7.55145 2.9322 8.87555 2.49707C9.60856 3.4128 10.7358 3.99928 12 3.99928C13.2642 3.99928 14.3914 3.4128 15.1245 2.49707C16.4486 2.9322 17.6506 3.63637 18.6659 4.54491C18.2405 5.637 18.2966 6.90531 18.9282 7.99928C19.5602 9.09388 20.6314 9.77679 21.7906 9.95392C21.9279 10.6142 22 11.2983 22 11.9993C22 12.7002 21.9279 13.3844 21.7906 14.0446C20.6314 14.2218 19.5602 14.9047 18.9282 15.9993C18.2966 17.0932 18.2405 18.3616 18.6659 19.4536C17.6506 20.3622 16.4486 21.0664 15.1245 21.5015C14.3914 20.5858 13.2642 19.9993 12 19.9993C10.7358 19.9993 9.60856 20.5858 8.87555 21.5015C7.55145 21.0664 6.3494 20.3622 5.33409 19.4536C5.75952 18.3616 5.7034 17.0932 5.0718 15.9993C4.43983 14.9047 3.36862 14.2218 2.20935 14.0446C2.07212 13.3844 2 12.7002 2 11.9993C2 11.2983 2.07212 10.6142 2.20935 9.95392C3.36862 9.77679 4.43983 9.09388 5.0718 7.99928C5.7034 6.90531 5.75952 5.637 5.33409 4.54491ZM13.5 14.5974C14.9349 13.7689 15.4265 11.9342 14.5981 10.4993C13.7696 9.0644 11.9349 8.57277 10.5 9.4012C9.06512 10.2296 8.5735 12.0644 9.40192 13.4993C10.2304 14.9342 12.0651 15.4258 13.5 14.5974Z" />
            </svg>
            <span>필터{selectedFilterCount > 0 ? ` · ${selectedFilterCount}` : ""}</span>
          </button>
          <div className="public-home-store-grid__toolbar-right">
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
                  {sortMenuOptions.map((option) => (
                    <button
                      aria-checked={sortOption === option.value}
                      className={`public-home-store-grid__sort-option ${sortOption === option.value ? "is-active" : ""}`}
                      key={option.value}
                      onClick={() => handleSelectSort(option.value)}
                      role="menuitemradio"
                      type="button"
                    >
                      <span>{option.label}</span>
                      {sortOption === option.value ? <CheckIcon size={14} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 활성 검색 / 필터 요약 */}
        {searchKeyword || selectedFilterCount > 0 ? (
          <div className="public-home-store-grid__active-filters">
            {searchKeyword ? (
              <span className="public-home-store-grid__search-chip">
                {`"${searchKeyword}" 검색 결과 ${isLoading ? "…" : `${totalCount.toLocaleString("ko-KR")}건`}`}
                <button
                  aria-label="검색 해제"
                  className="public-home-store-grid__search-chip-remove"
                  onClick={handleClearSearchKeyword}
                  type="button"
                >
                  ×
                </button>
              </span>
            ) : null}
            {selectedFilterCount > 0 ? (
              <>
                <span className="public-home-store-grid__active-label">적용 필터 {selectedFilterCount}개</span>
                <button
                  className="public-home-store-grid__reset"
                  onClick={handleResetAllFilters}
                  type="button"
                >
                  전체 초기화
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {/* 카드 그리드 — 로딩 중에는 스켈레톤으로 교체 (페이지 변경 포함, 기존 방식) */}
        {isLoading ? (
          <div className="public-home-store-grid__list" role="status" aria-live="polite">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ProductCardSkeleton key={`home-store-skeleton-${index}`} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="public-home-store-grid__empty">
            {searchKeyword ? (
              <>
                <strong>"{searchKeyword}" 검색 결과가 없어요</strong>
                <p>검색어를 줄이거나 비슷한 이름으로 다시 찾아보세요.</p>
                <div className="public-home-store-grid__empty-actions">
                  <button
                    className="public-home-store-grid__empty-button"
                    onClick={handleClearSearchKeyword}
                    type="button"
                  >
                    검색 해제
                  </button>
                  {selectedFilterCount > 0 ? (
                    <button
                      className="public-home-store-grid__empty-button"
                      onClick={handleResetAllFilters}
                      type="button"
                    >
                      필터 초기화
                    </button>
                  ) : null}
                </div>
                <button
                  className="public-home-store-grid__notify-toggle"
                  onClick={handleNotifyRestock}
                  type="button"
                >
                  원하는 교재가 없나요? 입고 알림 받기
                </button>
              </>
            ) : (
              <>
                <strong>조건에 맞는 교재가 없어요</strong>
                <p>필터를 줄이거나 다른 과목을 선택해 보세요.</p>
                {emptyStateRecoverableFilters.length > 0 ? (
                  <div className="public-home-store-grid__empty-actions">
                    {emptyStateRecoverableFilters.map(({ groupKey, value }) => (
                      <button
                        className="public-home-store-grid__empty-chip"
                        key={`${groupKey}-${value}`}
                        onClick={() => handleToggleFilter(groupKey, value)}
                        type="button"
                      >
                        {value} 해제
                      </button>
                    ))}
                    <button
                      className="public-home-store-grid__empty-button"
                      onClick={handleResetAllFilters}
                      type="button"
                    >
                      필터 초기화
                    </button>
                  </div>
                ) : (
                  <button
                    className="public-home-store-grid__empty-button"
                    onClick={() => handleSelectSubject(STORE_DEFAULT_SUBJECT)}
                    type="button"
                  >
                    전체 보기
                  </button>
                )}
                <button
                  className="public-home-store-grid__notify-toggle"
                  onClick={handleNotifyRestock}
                  type="button"
                >
                  원하는 교재가 없나요? 입고 알림 받기
                </button>
              </>
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

        {/* 페이지네이션 — 웹/모바일 공통. 로딩 중에는 숨김 (기존 방식) */}
        {!isLoading && totalPages > 1 ? (
          <nav className="public-home-store-grid__pagination" aria-label="페이지 탐색">
            <button
              aria-label="이전 페이지"
              className="public-home-store-grid__pagination-arrow"
              disabled={safeCurrentPage === 1}
              onClick={() => handleChangePage(safeCurrentPage - 1)}
              type="button"
            >
              <ChevronLeftIcon size={18} />
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
              <ChevronRightIcon size={18} />
            </button>
          </nav>
        ) : null}
          </div>
        </div>
      </ContentContainer>

      {/* 비회원이 입고 알림을 누르면 로그인 유도 다이얼로그 */}
      {memberGateDialog}

      {/* 키워드 입고 알림 모달 — 필터 시트와 같은 시각 언어(바텀시트) 재사용 */}
      {restockModal ? (
        <div
          className="public-home-store-grid__filter-sheet-backdrop"
          onClick={() => (restockSubmitState.busy ? null : setRestockModal(null))}
          role="presentation"
        >
          <div
            aria-label="입고 알림 신청"
            aria-modal="true"
            className="public-home-store-grid__filter-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="public-home-store-grid__filter-sheet-head">
              <h2 className="public-home-store-grid__filter-sheet-title">입고 알림 받기</h2>
              <button
                aria-label="닫기"
                className="public-home-store-grid__filter-sheet-close"
                onClick={() => setRestockModal(null)}
                type="button"
              >
                <CloseIcon size={18} />
              </button>
            </header>
            <div className="public-home-store-grid__filter-sheet-body">
              {restockSubmitState.done ? (
                <p className="public-home-store-grid__restock-copy">
                  <strong>"{restockKeywordInput.trim()}"</strong> 입고 알림을 등록했어요.
                  <br />
                  맞는 교재가 입고되면 알림함으로 바로 알려드릴게요.
                </p>
              ) : (
                <>
                  <p className="public-home-store-grid__restock-copy">
                    기다리는 교재의 키워드를 등록해 두면, 입고되는 순간 알림함으로 알려드려요.
                  </p>
                  <input
                    aria-label="입고 알림 키워드"
                    className="public-nav-drawer__search-input"
                    maxLength={40}
                    onChange={(event) => setRestockKeywordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void handleSubmitRestockKeyword();
                      }
                    }}
                    placeholder="예) 시대인재 서바이벌, 수분감"
                    type="text"
                    value={restockKeywordInput}
                  />
                  {restockSubmitState.error ? (
                    <p className="public-home-store-grid__restock-error" role="alert">
                      {restockSubmitState.error}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <footer className="public-home-store-grid__filter-sheet-foot">
              {restockSubmitState.done ? (
                <button
                  className="public-home-store-grid__filter-sheet-apply"
                  onClick={() => setRestockModal(null)}
                  type="button"
                >
                  확인
                </button>
              ) : (
                <>
                  <button
                    className="public-home-store-grid__filter-sheet-reset"
                    disabled={restockSubmitState.busy}
                    onClick={() => setRestockModal(null)}
                    type="button"
                  >
                    취소
                  </button>
                  <button
                    className="public-home-store-grid__filter-sheet-apply"
                    disabled={restockSubmitState.busy}
                    onClick={() => void handleSubmitRestockKeyword()}
                    type="button"
                  >
                    {restockSubmitState.busy ? "등록 중..." : "알림 신청"}
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      ) : null}

      {/* 모바일 전용 필터 바텀시트 — 데스크톱에선 트리거 자체가 안 보임 */}
      {isFilterSheetOpen ? (
        <div
          className="public-home-store-grid__filter-sheet-backdrop"
          onClick={() => setIsFilterSheetOpen(false)}
          role="presentation"
        >
          <div
            aria-label="필터 선택"
            aria-modal="true"
            className="public-home-store-grid__filter-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="public-home-store-grid__filter-sheet-head">
              <h2 className="public-home-store-grid__filter-sheet-title">
                필터{selectedFilterCount > 0 ? ` · ${selectedFilterCount}` : ""}
              </h2>
              <button
                aria-label="닫기"
                className="public-home-store-grid__filter-sheet-close"
                onClick={() => setIsFilterSheetOpen(false)}
                type="button"
              >
                <CloseIcon size={18} />
              </button>
            </header>
            <div className="public-home-store-grid__filter-sheet-body">
              {subjectGroupJsx}
              {filterGroupsJsx}
            </div>
            <footer className="public-home-store-grid__filter-sheet-foot">
              <button
                className="public-home-store-grid__filter-sheet-reset"
                disabled={selectedFilterCount === 0}
                onClick={handleResetAllFilters}
                type="button"
              >
                전체 초기화
              </button>
              <button
                className="public-home-store-grid__filter-sheet-apply"
                onClick={() => setIsFilterSheetOpen(false)}
                type="button"
              >
                {isLoading ? "불러오는 중..." : `${totalCount.toLocaleString("ko-KR")}권 보기`}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default HomeStoreGrid;
