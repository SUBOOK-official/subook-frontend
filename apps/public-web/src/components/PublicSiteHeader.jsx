import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import searchIconImage from "../assets/search-icon.svg";

function PublicSiteHeader({ onCartClick, searchSlot }) {
  const navigate = useNavigate();
  const [portalNode, setPortalNode] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  const [frameScale, setFrameScale] = useState(1);
  const headerRef = useRef(null);

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

    if (query) {
      navigate(`/store?q=${encodeURIComponent(query)}`);
    }
  };

  const handleCartClick = () => {
    if (onCartClick) {
      onCartClick();
      return;
    }

    navigate("/cart");
  };

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
          <Link className="public-nav-link public-nav-button" to="/login">
            로그인/회원가입
          </Link>
        </nav>
      </ContentContainer>
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
