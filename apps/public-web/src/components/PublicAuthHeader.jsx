import { Link } from "react-router-dom";

function PublicAuthHeader() {
  return (
    <header className="public-auth-header">
      <div className="public-shell public-auth-header__inner">
        <Link className="public-brand" to="/">
          SUBOOK®
        </Link>

        <Link className="public-nav-link public-nav-button public-auth-header__cta" to="/login">
          로그인/회원가입
        </Link>
      </div>
    </header>
  );
}

export default PublicAuthHeader;
