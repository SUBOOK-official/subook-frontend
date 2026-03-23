import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bridgeEarthScienceCover from "../assets/bridge-earth-science-cover.svg";
import searchIconImage from "../assets/search-icon.svg";
import searchActionImage from "../assets/search-action.svg";
import PublicFooter from "../components/PublicFooter";
import storeTop2Image from "../assets/store-top-2.png";
import storeTop3Image from "../assets/store-top-3.png";
import storeTop4Image from "../assets/store-top-4.png";

const DESKTOP_FRAME_WIDTH = 1920;
const DESKTOP_LOCK_MIN_WIDTH = 1280;
const ITEMS_PER_PAGE = 15;

const subjectTabs = ["전체", "국어", "수학", "영어", "과학", "사회", "한국사", "기타"];
const sortOptions = ["인기순", "할인율순", "관심 많은순", "낮은 가격순"];

const filterGroups = [
  { key: "type", label: "유형", options: ["전체", "개념", "기출", "모의고사", "N제", "EBS", "주간지", "내신"] },
  { key: "brand", label: "브랜드", options: ["전체", "시대인재", "강남대성", "대성마이맥", "이투스", "EBS"] },
  { key: "year", label: "연도", options: ["전체", "2026", "2025", "2024"] },
  { key: "status", label: "상태", options: ["전체", "S(새책)", "A+(극미한 사용감)"] },
];

const storeCatalog = [
  {
    id: "earth-science-bridge-2026",
    title: "2026 시대인재 브릿지 모의고사 지구과학1",
    subject: "과학",
    type: "모의고사",
    brand: "시대인재",
    year: "2026",
    status: "S(새책)",
    salePrice: 4000,
    originalPrice: 20000,
    popularity: 98,
    publishedOrder: 20260312,
    coverImage: bridgeEarthScienceCover,
    featured: true,
  },
  {
    id: "math-climax-2026",
    title: "2026 강남대성 클라이맥스 N제 수학1",
    subject: "수학",
    type: "N제",
    brand: "강남대성",
    year: "2026",
    status: "S(새책)",
    salePrice: 9000,
    originalPrice: 28000,
    popularity: 96,
    publishedOrder: 20260218,
    coverImage: storeTop2Image,
    featured: true,
  },
  {
    id: "english-mock-2026",
    title: "2026 이투스 실전 모의고사 영어 12회",
    subject: "영어",
    type: "모의고사",
    brand: "이투스",
    year: "2026",
    status: "A+(극미한 사용감)",
    salePrice: 7500,
    originalPrice: 18000,
    popularity: 95,
    publishedOrder: 20260127,
    coverImage: storeTop3Image,
    featured: true,
  },
  {
    id: "korean-weekly-2026",
    title: "2026 대성마이맥 국어 주간지 시즌1",
    subject: "국어",
    type: "주간지",
    brand: "대성마이맥",
    year: "2026",
    status: "S(새책)",
    salePrice: 6000,
    originalPrice: 15000,
    popularity: 94,
    publishedOrder: 20260305,
    coverImage: storeTop4Image,
    featured: true,
  },
  {
    id: "korean-concept-2025",
    title: "2025 시대인재 리본 국어 개념 완성",
    subject: "국어",
    type: "개념",
    brand: "시대인재",
    year: "2025",
    status: "A+(극미한 사용감)",
    salePrice: 12000,
    originalPrice: 26000,
    popularity: 87,
    publishedOrder: 20250520,
  },
  {
    id: "math-ebs-2025",
    title: "2025 EBS 수능특강 수학1",
    subject: "수학",
    type: "EBS",
    brand: "EBS",
    year: "2025",
    status: "S(새책)",
    salePrice: 3500,
    originalPrice: 7000,
    popularity: 82,
    publishedOrder: 20250115,
  },
  {
    id: "society-mock-2026",
    title: "2026 이투스 생활과 윤리 실전 모의고사",
    subject: "사회",
    type: "모의고사",
    brand: "이투스",
    year: "2026",
    status: "A+(극미한 사용감)",
    salePrice: 5800,
    originalPrice: 14000,
    popularity: 79,
    publishedOrder: 20260208,
  },
  {
    id: "history-ebs-2024",
    title: "2024 EBS 한국사 개념완성",
    subject: "한국사",
    type: "EBS",
    brand: "EBS",
    year: "2024",
    status: "S(새책)",
    salePrice: 2800,
    originalPrice: 6500,
    popularity: 75,
    publishedOrder: 20240310,
  },
  {
    id: "science-concept-2024",
    title: "2024 강남대성 화학1 개념서",
    subject: "과학",
    type: "개념",
    brand: "강남대성",
    year: "2024",
    status: "A+(극미한 사용감)",
    salePrice: 6800,
    originalPrice: 19000,
    popularity: 74,
    publishedOrder: 20240412,
  },
  {
    id: "english-naesin-2025",
    title: "2025 대성마이맥 내신 영어 독해",
    subject: "영어",
    type: "내신",
    brand: "대성마이맥",
    year: "2025",
    status: "S(새책)",
    salePrice: 9200,
    originalPrice: 19500,
    popularity: 77,
    publishedOrder: 20250502,
  },
  {
    id: "etc-essay-2026",
    title: "2026 시대인재 논술 파이널 자료집",
    subject: "기타",
    type: "기출",
    brand: "시대인재",
    year: "2026",
    status: "S(새책)",
    salePrice: 15000,
    originalPrice: 33000,
    popularity: 84,
    publishedOrder: 20260318,
  },
  {
    id: "math-gichul-2024",
    title: "2024 강남대성 수학2 기출 압축",
    subject: "수학",
    type: "기출",
    brand: "강남대성",
    year: "2024",
    status: "A+(극미한 사용감)",
    salePrice: 5400,
    originalPrice: 16000,
    popularity: 73,
    publishedOrder: 20240408,
  },
  {
    id: "korean-mock-2026",
    title: "2026 이투스 언매 실전 모의고사",
    subject: "국어",
    type: "모의고사",
    brand: "이투스",
    year: "2026",
    status: "S(새책)",
    salePrice: 6500,
    originalPrice: 17000,
    popularity: 85,
    publishedOrder: 20260214,
  },
  {
    id: "science-ebs-2025",
    title: "2025 EBS 생명과학1 수능완성",
    subject: "과학",
    type: "EBS",
    brand: "EBS",
    year: "2025",
    status: "S(새책)",
    salePrice: 4200,
    originalPrice: 8000,
    popularity: 80,
    publishedOrder: 20250722,
  },
  {
    id: "society-weekly-2025",
    title: "2025 대성마이맥 사회문화 주간지",
    subject: "사회",
    type: "주간지",
    brand: "대성마이맥",
    year: "2025",
    status: "A+(극미한 사용감)",
    salePrice: 7000,
    originalPrice: 16500,
    popularity: 76,
    publishedOrder: 20250514,
  },
  {
    id: "history-concept-2026",
    title: "2026 시대인재 한국사 필수 개념",
    subject: "한국사",
    type: "개념",
    brand: "시대인재",
    year: "2026",
    status: "S(새책)",
    salePrice: 8200,
    originalPrice: 18000,
    popularity: 81,
    publishedOrder: 20260111,
  },
  {
    id: "english-gichul-2024",
    title: "2024 강남대성 영어 기출 변형 400제",
    subject: "영어",
    type: "기출",
    brand: "강남대성",
    year: "2024",
    status: "A+(극미한 사용감)",
    salePrice: 5100,
    originalPrice: 17500,
    popularity: 70,
    publishedOrder: 20240420,
  },
  {
    id: "math-naesin-2026",
    title: "2026 시대인재 내신 수학 실전편",
    subject: "수학",
    type: "내신",
    brand: "시대인재",
    year: "2026",
    status: "S(새책)",
    salePrice: 11000,
    originalPrice: 23000,
    popularity: 83,
    publishedOrder: 20260301,
  },
  {
    id: "korean-ebs-2024",
    title: "2024 EBS 독서 문학 수능특강",
    subject: "국어",
    type: "EBS",
    brand: "EBS",
    year: "2024",
    status: "S(새책)",
    salePrice: 3100,
    originalPrice: 6200,
    popularity: 72,
    publishedOrder: 20240130,
  },
  {
    id: "science-nje-2026",
    title: "2026 강남대성 지구과학1 N제 200제",
    subject: "과학",
    type: "N제",
    brand: "강남대성",
    year: "2026",
    status: "S(새책)",
    salePrice: 9800,
    originalPrice: 24000,
    popularity: 86,
    publishedOrder: 20260309,
  },
  {
    id: "etc-essay-2025",
    title: "2025 이투스 면접 대비 예상 질문집",
    subject: "기타",
    type: "개념",
    brand: "이투스",
    year: "2025",
    status: "A+(극미한 사용감)",
    salePrice: 4900,
    originalPrice: 12000,
    popularity: 69,
    publishedOrder: 20250530,
  },
  {
    id: "society-naesin-2024",
    title: "2024 시대인재 정치와 법 내신 핵심정리",
    subject: "사회",
    type: "내신",
    brand: "시대인재",
    year: "2024",
    status: "S(새책)",
    salePrice: 4300,
    originalPrice: 9800,
    popularity: 67,
    publishedOrder: 20240428,
  },
  {
    id: "english-weekly-2026",
    title: "2026 대성마이맥 영어 주간지 시즌2",
    subject: "영어",
    type: "주간지",
    brand: "대성마이맥",
    year: "2026",
    status: "S(새책)",
    salePrice: 7200,
    originalPrice: 16800,
    popularity: 88,
    publishedOrder: 20260315,
  },
  {
    id: "history-gichul-2025",
    title: "2025 강남대성 한국사 기출 선별 150제",
    subject: "한국사",
    type: "기출",
    brand: "강남대성",
    year: "2025",
    status: "A+(극미한 사용감)",
    salePrice: 5600,
    originalPrice: 15000,
    popularity: 71,
    publishedOrder: 20250509,
  },
];

const initialFilters = {
  type: "전체",
  brand: "전체",
  year: "전체",
  status: "전체",
};

function formatPrice(value) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function getDiscountRate(product) {
  return Math.round(((product.originalPrice - product.salePrice) / product.originalPrice) * 100);
}

function getInterestScore(product) {
  return product.popularity * 10 + getDiscountRate(product);
}

function getStorePills(product) {
  return [
    { label: product.subject, tone: "subject" },
    { label: product.type, tone: "type" },
    { label: product.brand, tone: "brand" },
    { label: product.status, tone: "status" },
  ];
}

function sortProducts(products, criterion) {
  const nextProducts = [...products];

  nextProducts.sort((left, right) => {
    if (criterion === "낮은 가격순") {
      return left.salePrice - right.salePrice || right.popularity - left.popularity;
    }

    if (criterion === "할인율순") {
      return getDiscountRate(right) - getDiscountRate(left) || right.popularity - left.popularity;
    }

    if (criterion === "관심 많은순") {
      return getInterestScore(right) - getInterestScore(left) || right.popularity - left.popularity;
    }

    return right.popularity - left.popularity || right.publishedOrder - left.publishedOrder;
  });

  return nextProducts;
}

function StorePill({ label, tone }) {
  return <span className={`public-pill public-pill--${tone}`}>{label}</span>;
}

function StoreFavoriteButton({ filled = false, onToggle }) {
  return (
    <button
      aria-label={filled ? "찜 취소" : "찜하기"}
      className={`public-store-favorite ${filled ? "public-store-favorite--filled" : ""}`}
      onClick={onToggle}
      type="button"
    >
      <span aria-hidden="true">{filled ? "♥" : "♡"}</span>
    </button>
  );
}

function StoreCard({ product, rank, isFavorite, onToggleFavorite, viewMode = "grid" }) {
  const isListMode = viewMode === "list" && !rank;

  return (
    <article
      className={`public-store-card ${rank ? "public-store-card--ranking" : ""} ${
        isListMode ? "public-store-card--list" : ""
      }`}
    >
      {rank ? <p className="public-store-card__rank">{rank}</p> : null}

      <div className="public-store-card__media">
        {product.coverImage ? (
          <img alt={product.title} className="public-store-card__cover" src={product.coverImage} />
        ) : (
          <div className="public-store-card__placeholder">
            <span>{product.subject}</span>
            <strong>{product.brand}</strong>
          </div>
        )}

        <StoreFavoriteButton filled={isFavorite} onToggle={() => onToggleFavorite(product.id)} />
      </div>

      <div className="public-store-card__content">
        <div className="public-pill-row">
          {getStorePills(product).map((pill) => (
            <StorePill key={`${product.id}-${pill.label}`} label={pill.label} tone={pill.tone} />
          ))}
        </div>

        <h3 className="public-store-card__title">{product.title}</h3>

        <div className="public-price-row">
          <span className="public-price-row__discount">{getDiscountRate(product)}%</span>
          <span className="public-price-row__sale">{formatPrice(product.salePrice)}</span>
          <span className="public-price-row__original">{formatPrice(product.originalPrice)}</span>
        </div>
      </div>

      <div className="public-product-actions">
        <button className="public-outline-button" type="button">
          장바구니 담기
        </button>
        <button className="public-outline-button" type="button">
          바로 구매하기
        </button>
      </div>
    </article>
  );
}

function PublicStorePage() {
  const [desktopScale, setDesktopScale] = useState(1);
  const [desktopFrameHeight, setDesktopFrameHeight] = useState(0);
  const [isDesktopLocked, setIsDesktopLocked] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState("store");
  const [selectedSubject, setSelectedSubject] = useState("전체");
  const [selectedFilters, setSelectedFilters] = useState(initialFilters);
  const [sortOption, setSortOption] = useState(sortOptions[0]);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [favoriteIds, setFavoriteIds] = useState(["math-climax-2026"]);
  const desktopFrameRef = useRef(null);
  const sortMenuRef = useRef(null);

  useEffect(() => {
    const syncDesktopFrame = () => {
      const shouldLockDesktop = window.innerWidth >= DESKTOP_LOCK_MIN_WIDTH;
      setIsDesktopLocked(shouldLockDesktop);

      if (!shouldLockDesktop) {
        setDesktopScale(1);
        return;
      }

      setDesktopScale(Math.min(1, window.innerWidth / DESKTOP_FRAME_WIDTH));
    };

    syncDesktopFrame();
    window.addEventListener("resize", syncDesktopFrame);

    return () => {
      window.removeEventListener("resize", syncDesktopFrame);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopLocked || !desktopFrameRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const syncDesktopHeight = () => {
      setDesktopFrameHeight(desktopFrameRef.current.offsetHeight);
    };

    syncDesktopHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncDesktopHeight();
    });

    resizeObserver.observe(desktopFrameRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isDesktopLocked]);

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

  const normalizedKeyword = searchKeyword.trim().toLowerCase();

  const filteredStoreItems = sortProducts(
    storeCatalog.filter((product) => {
      if (selectedSubject !== "전체" && product.subject !== selectedSubject) {
        return false;
      }

      if (selectedFilters.type !== "전체" && product.type !== selectedFilters.type) {
        return false;
      }

      if (selectedFilters.brand !== "전체" && product.brand !== selectedFilters.brand) {
        return false;
      }

      if (selectedFilters.year !== "전체" && product.year !== selectedFilters.year) {
        return false;
      }

      if (selectedFilters.status !== "전체" && product.status !== selectedFilters.status) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const searchTarget = [product.title, product.subject, product.brand, product.type, product.year]
        .join(" ")
        .toLowerCase();

      return searchTarget.includes(normalizedKeyword);
    }),
    sortOption,
  );

  const rankingItems = sortProducts(
    storeCatalog.filter((product) => product.featured),
    "인기순",
  ).slice(0, 4);

  const totalPages = Math.max(1, Math.ceil(filteredStoreItems.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const visibleItems = filteredStoreItems.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((currentValue) => Math.min(currentValue, totalPages));
  }, [totalPages]);

  const handleSelectFilter = (key, option) => {
    setSelectedFilters((currentFilters) => ({
      ...currentFilters,
      [key]: currentFilters[key] === option && option !== "전체" ? "전체" : option,
    }));
    setCurrentPage(1);
  };

  const handleSelectSubject = (subject) => {
    setSelectedSubject(subject);
    setCurrentPage(1);
  };

  const handleToggleFavorite = (productId) => {
    setFavoriteIds((currentIds) =>
      currentIds.includes(productId)
        ? currentIds.filter((currentId) => currentId !== productId)
        : [...currentIds, productId],
    );
  };

  const handleSearchChange = (event) => {
    setSearchKeyword(event.target.value);
    setCurrentPage(1);
  };

  const handleSelectSortOption = (option) => {
    setSortOption(option);
    setIsSortMenuOpen(false);
    setCurrentPage(1);
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  const pageContent = (
    <div className="public-store-page">
      <div className="public-top-area public-store-page__top">
        <header className="public-shell public-nav">
          <Link className="public-brand" to="/">
            SUBOOK®
          </Link>

          <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
            <button className="public-nav-link public-nav-link--cart" type="button">
              <span>장바구니</span>
              <span className="public-cart-badge">5</span>
            </button>
            <button className="public-nav-link" type="button">
              마이페이지
            </button>
            <button className="public-nav-link public-nav-button" type="button">
              로그아웃
            </button>
          </nav>
        </header>

        <div className="public-shell public-menu" role="tablist" aria-label="상단 메뉴">
          <Link
            aria-selected={selectedMenu === "store"}
            className={`public-menu-tab ${selectedMenu === "store" ? "public-menu-tab--active" : ""}`}
            onClick={() => setSelectedMenu("store")}
            role="tab"
            to="/store"
          >
            스토어
          </Link>
          <button
            aria-selected={selectedMenu === "sell"}
            className={`public-menu-tab ${selectedMenu === "sell" ? "public-menu-tab--active" : ""}`}
            onClick={() => setSelectedMenu("sell")}
            role="tab"
            type="button"
          >
            판매하기
          </button>
        </div>

        <section className="public-shell public-search-section" aria-label="교재 검색">
          <form className="public-search" onSubmit={(event) => event.preventDefault()}>
            <img alt="" className="public-search__icon" src={searchIconImage} />
            <input
              aria-label="교재 검색"
              className="public-search__input"
              onChange={handleSearchChange}
              placeholder="교재명, 저자, ISBN, 학교, 학원명을 입력해주세요."
              type="search"
              value={searchKeyword}
            />
            <button aria-label="검색" className="public-search__action" type="submit">
              <img alt="" src={searchActionImage} />
            </button>
          </form>
        </section>

        <section className="public-shell public-store-best" aria-labelledby="public-store-best-books">
          <div className="public-store-best__heading">
            <h2 className="public-section-title" id="public-store-best-books">
              📚 BEST 교재
            </h2>
            <div className="public-store-best__meta">
              <span>랭킹기준</span>
              <span aria-hidden="true" className="public-store-best__meta-icon">
                !
              </span>
            </div>
          </div>

          <div className="public-store-best__list">
            {rankingItems.map((product, index) => (
              <StoreCard
                isFavorite={favoriteIds.includes(product.id)}
                key={product.id}
                onToggleFavorite={handleToggleFavorite}
                product={product}
                rank={`TOP ${index + 1}`}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="public-store-filter" aria-label="스토어 필터">
        <div className="public-store-filter__subject-row">
          {subjectTabs.map((tab) => (
            <button
              aria-pressed={selectedSubject === tab}
              className={`public-store-filter__subject ${selectedSubject === tab ? "is-active" : ""}`}
              key={tab}
              onClick={() => handleSelectSubject(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="public-shell public-store-filter__detail">
          {filterGroups.map((group) => (
            <div className="public-store-filter__group" key={group.key}>
              <button
                className="public-store-filter__label"
                onClick={() => handleSelectFilter(group.key, "전체")}
                type="button"
              >
                <span>{group.label}</span>
              </button>

              <div className="public-store-filter__chips">
                {group.options.map((option) => (
                  <button
                    aria-pressed={selectedFilters[group.key] === option}
                    className={`public-store-filter__chip ${
                      selectedFilters[group.key] === option ? "is-active" : ""
                    }`}
                    key={option}
                    onClick={() => handleSelectFilter(group.key, option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="public-shell public-store-route" aria-label="상품 경로">
        <div className="public-store-route__crumbs">
          <span>🛒 스토어</span>
          <span aria-hidden="true">›</span>
          <span>영역별 교재</span>
          <span aria-hidden="true">›</span>
          <span className="is-muted">{selectedSubject}</span>
        </div>

        <div className="public-store-route__actions">
          <div className="public-store-route__view">
            <button
              aria-label="격자 보기"
              className={`public-store-route__icon ${viewMode === "grid" ? "is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              type="button"
            >
              <span />
              <span />
              <span />
              <span />
            </button>
            <button
              aria-label="리스트 보기"
              className={`public-store-route__icon public-store-route__icon--list ${
                viewMode === "list" ? "is-active" : ""
              }`}
              onClick={() => setViewMode("list")}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className="public-store-route__sort-wrap" ref={sortMenuRef}>
            <button
              aria-expanded={isSortMenuOpen}
              aria-haspopup="menu"
              className="public-store-route__sort-trigger"
              onClick={() => setIsSortMenuOpen((currentValue) => !currentValue)}
              type="button"
            >
              <span>{sortOption}</span>
              <span aria-hidden="true" className="public-store-route__sort-trigger-icon">
                ↑↓
              </span>
            </button>

            {isSortMenuOpen ? (
              <div className="public-store-route__sort-menu" role="menu">
                {sortOptions.map((option) => (
                  <button
                    aria-checked={sortOption === option}
                    className={`public-store-route__sort-option ${sortOption === option ? "is-active" : ""}`}
                    key={option}
                    onClick={() => handleSelectSortOption(option)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option}</span>
                    {sortOption === option ? (
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
      </section>

      <section className="public-shell public-store-list" aria-label="스토어 상품 목록">
        {visibleItems.length ? (
          <div className={`public-store-list__grid ${viewMode === "list" ? "public-store-list__grid--list" : ""}`}>
            {visibleItems.map((item) => (
              <StoreCard
                isFavorite={favoriteIds.includes(item.id)}
                key={item.id}
                onToggleFavorite={handleToggleFavorite}
                product={item}
                viewMode={viewMode}
              />
            ))}
          </div>
        ) : (
          <div className="public-store-list__empty">
            <strong>조건에 맞는 교재가 아직 없어요.</strong>
            <span>필터를 초기화하거나 다른 검색어로 다시 찾아보세요.</span>
          </div>
        )}
      </section>

      <section className="public-shell public-store-pagination" aria-label="페이지 이동">
        <button
          className="public-store-pagination__arrow"
          disabled={safeCurrentPage === 1}
          onClick={() => setCurrentPage(1)}
          type="button"
        >
          «
        </button>
        <button
          className="public-store-pagination__arrow"
          disabled={safeCurrentPage === 1}
          onClick={() => setCurrentPage((currentValue) => Math.max(1, currentValue - 1))}
          type="button"
        >
          ‹
        </button>

        <div className="public-store-pagination__pages">
          {pageNumbers.map((page) => (
            <button
              className={`public-store-pagination__page ${page === safeCurrentPage ? "is-active" : ""}`}
              key={page}
              onClick={() => setCurrentPage(page)}
              type="button"
            >
              {page}
            </button>
          ))}
        </div>

        <button
          className="public-store-pagination__arrow"
          disabled={safeCurrentPage === totalPages}
          onClick={() => setCurrentPage((currentValue) => Math.min(totalPages, currentValue + 1))}
          type="button"
        >
          ›
        </button>
        <button
          className="public-store-pagination__arrow"
          disabled={safeCurrentPage === totalPages}
          onClick={() => setCurrentPage(totalPages)}
          type="button"
        >
          »
        </button>
      </section>

      <PublicFooter />
    </div>
  );

  if (isDesktopLocked) {
    return (
      <main className="public-home public-home--locked">
        <div className="public-home__stage" style={{ height: `${desktopFrameHeight * desktopScale}px` }}>
          <div
            className="public-home__frame"
            ref={desktopFrameRef}
            style={{ transform: `translateX(-50%) scale(${desktopScale})` }}
          >
            {pageContent}
          </div>
        </div>
      </main>
    );
  }

  return <main className="public-home">{pageContent}</main>;
}

export default PublicStorePage;
