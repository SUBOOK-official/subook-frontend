import { Link } from "react-router-dom";
import { useState } from "react";
import { usePublicAuth } from "../contexts/PublicAuthContext";

function PublicSessionStatus() {
  const { isAuthenticated, profile, signOut } = usePublicAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const displayName = profile?.nickname?.trim() || profile?.name?.trim() || profile?.email || "회원";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  };

  return (
    <nav aria-label="로그인 상태 메뉴" className="public-nav-actions public-session-status">
      <span className="public-nav-link public-nav-link--static public-session-status__name">
        {displayName}님
      </span>
      <Link className="public-nav-link public-nav-link--cart" to="/mypage">
        <span>마이페이지</span>
      </Link>
      <Link className="public-nav-link public-nav-link--cart" to="/cart">
        <span>장바구니</span>
      </Link>
      <button
        className="public-nav-link public-nav-button public-session-status__button"
        disabled={isSigningOut}
        onClick={handleSignOut}
        type="button"
      >
        {isSigningOut ? "로그아웃 중..." : "로그아웃"}
      </button>
    </nav>
  );
}

export default PublicSessionStatus;
