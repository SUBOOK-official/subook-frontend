import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import searchIconImage from "../assets/search-icon.svg";

function PublicSiteHeader({ onCartClick, searchSlot }) {
  const navigate = useNavigate();
  const [portalNode, setPortalNode] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(72);
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

  return (
    <>
      {portalNode ? createPortal(headerNode, portalNode) : null}
      <div
        aria-hidden="true"
        className="public-sticky-header__spacer"
        style={{ height: headerHeight }}
      />
    </>
  );
}

export default PublicSiteHeader;
