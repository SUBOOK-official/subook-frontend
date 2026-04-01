import { Link } from "react-router-dom";

function PublicMemberHeader() {
  return (
    <header className="public-member-header">
      <div className="public-shell public-nav public-member-header__inner">
        <Link className="public-brand" to="/">
          SUBOOK®
        </Link>

        <nav aria-label="회원 메뉴" className="public-nav-actions public-member-header__actions">
          <button className="public-nav-link" type="button">
            마이페이지
          </button>
          <button className="public-nav-link public-nav-link--cart" type="button">
            <span>장바구니</span>
            <span className="public-cart-badge">0</span>
          </button>
          <button className="public-nav-link public-nav-button" type="button">
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  );
}

export default PublicMemberHeader;
