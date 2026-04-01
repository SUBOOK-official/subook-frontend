import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";

function PublicAuthHeader() {
  const navigate = useNavigate();
  const { isAuthenticated, profile, signOut } = usePublicAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = profile?.name?.trim() || profile?.email || "회원";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await signOut();
    setIsSigningOut(false);

    if (!error) {
      navigate("/", { replace: true });
    }
  };

  return (
    <header className="public-auth-header">
      <div className="public-shell public-auth-header__inner">
        <Link className="public-brand" to="/">
          SUBOOK®
        </Link>

        {isAuthenticated ? (
          <div className="public-auth-header__account">
            <span className="public-auth-header__welcome">{displayName}님</span>
            <Link className="public-nav-link" to="/store">
              스토어
            </Link>
            <button
              className="public-nav-link public-nav-button public-auth-header__cta"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        ) : (
          <Link className="public-nav-link public-nav-button public-auth-header__cta" to="/login">
            로그인/회원가입
          </Link>
        )}
      </div>
    </header>
  );
}

export default PublicAuthHeader;
