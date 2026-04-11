import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";

function PublicAuthHeader({ previewAccount = null }) {
  const navigate = useNavigate();
  const { hasSession, isAdminAccount, isAuthenticated, profile, signOut } = usePublicAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isPreviewMode = Boolean(previewAccount);
  const displayName =
    previewAccount?.displayName ||
    previewAccount?.nickname?.trim() ||
    previewAccount?.name?.trim() ||
    profile?.nickname?.trim() ||
    profile?.name?.trim() ||
    profile?.email ||
    "회원";

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
          SUBOOK
        </Link>

        {isPreviewMode ? (
          <div className="public-auth-header__account">
            <span className="public-auth-header__welcome">{displayName}님 · 데모 미리보기</span>
            <Link className="public-nav-link" to="/mypage?demo=1">
              마이페이지
            </Link>
            <Link className="public-nav-link" to="/store">
              스토어
            </Link>
            <Link className="public-nav-link public-nav-button public-auth-header__cta" to="/">
              데모 종료
            </Link>
          </div>
        ) : isAuthenticated ? (
          <div className="public-auth-header__account">
            <span className="public-auth-header__welcome">{displayName}님</span>
            <Link className="public-nav-link" to="/mypage">
              마이페이지
            </Link>
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
        ) : hasSession ? (
          <div className="public-auth-header__account">
            <span className="public-auth-header__welcome">
              {isAdminAccount ? "운영자 세션 연결됨" : "로그인 상태 확인 필요"}
            </span>
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
            로그인 / 회원가입
          </Link>
        )}
      </div>
    </header>
  );
}

export default PublicAuthHeader;
