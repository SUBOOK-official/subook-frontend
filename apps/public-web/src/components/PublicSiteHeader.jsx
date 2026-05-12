import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import searchIconImage from "../assets/search-icon.svg";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { createDisplayName } from "../lib/memberPortal";

function PublicSiteHeader({ onCartClick, searchSlot }) {
  const navigate = useNavigate();
  const { isAuthenticated, profile, user, signOut } = usePublicAuth();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [portalNode, setPortalNode] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  const [frameScale, setFrameScale] = useState(1);
  const headerRef = useRef(null);

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

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("q")?.toString().trim();

    if (!query) return;

    // 다른 페이지에서 검색 시 사용자가 컨텍스트를 잃지 않도록
    // 홈으로 이동 후 그리드 영역으로 스크롤하는 hint 전달.
    navigate(`/?q=${encodeURIComponent(query)}`, {
      state: { scrollToStorefront: true },
    });
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

  const headerNode = (
    <div className="public-sticky-header" ref={headerRef}>
      <ContentContainer as="header" className="public-nav public-site-header">
        <Link className="public-brand" to="/">
          SUBOOK®
        </Link>

        <div className="public-site-header__search">
          {searchSlot ?? (
            <form className="public-search" onSubmit={handleSearchSubmit} role="search" aria-label="교재 검색">
              <img alt="" className="public-search__icon" src={searchIconImage} />
              <div className="public-search__field">
                <input
                  aria-label="교재명 또는 강사명 검색"
                  className="public-search__input"
                  name="q"
                  placeholder="교재명, 강사명으로 검색"
                  type="search"
                />
              </div>
            </form>
          )}
        </div>

        <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
          <button className="public-nav-link public-nav-link--cart" onClick={handleCartClick} type="button">
            <span>장바구니</span>
          </button>
          <Link className="public-nav-link" to="/mypage">
            마이페이지
          </Link>
          {isAuthenticated ? (
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
          ) : (
            <Link className="public-nav-link public-nav-button" to="/login">
              로그인/회원가입
            </Link>
          )}
        </nav>

        {/* 모바일 햄버거 버튼 (768px 미만에서만 표시) */}
        <button
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
          className="public-nav-hamburger"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true">{isMobileMenuOpen ? "✕" : "☰"}</span>
        </button>
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
            <button
              className="public-nav-drawer__item"
              onClick={() => { setIsMobileMenuOpen(false); handleCartClick(); }}
              type="button"
            >
              장바구니
            </button>
            <Link className="public-nav-drawer__item" to="/mypage" onClick={() => setIsMobileMenuOpen(false)}>
              마이페이지
            </Link>
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
