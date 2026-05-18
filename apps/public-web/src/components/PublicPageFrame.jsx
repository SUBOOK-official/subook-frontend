import { useLocation } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import PublicSessionStatus from "./PublicSessionStatus";

// 이전에는 1280px 이상 viewport에서 1920px 고정 프레임을 transform: scale로 축소했다.
// 하지만 1280–1440px 노트북에서 글꼴이 67~75%로 축소돼 가독성/접근성이 크게 저하되고,
// transform: scale 부모 안에서는 CSS sticky가 깨져 JS로 우회해야 하는 부채가 생겼다.
// 이제는 디자인이 자연스럽게 반응형으로 흐르도록 단일 layout 경로만 사용한다.
function PublicPageFrame({ children }) {
  const location = useLocation();
  const { isAuthenticated } = usePublicAuth();

  const shouldReplaceUtilityNav = isAuthenticated && location.pathname === "/";
  const mainClassName = [
    "public-home",
    shouldReplaceUtilityNav ? "public-home--utility-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={mainClassName}>
      {shouldReplaceUtilityNav ? (
        <div className="public-home__utility-replacement public-home__utility-replacement--fluid">
          <PublicSessionStatus />
        </div>
      ) : null}
      {children}
    </main>
  );
}

export default PublicPageFrame;
