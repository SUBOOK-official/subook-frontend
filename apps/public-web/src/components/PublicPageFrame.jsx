import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import PublicSessionStatus from "./PublicSessionStatus";

const DESKTOP_FRAME_WIDTH = 1920;
const DESKTOP_LOCK_MIN_WIDTH = 1280;

function PublicPageFrame({ children }) {
  const location = useLocation();
  const { isAuthenticated } = usePublicAuth();
  const [desktopScale, setDesktopScale] = useState(1);
  const [desktopFrameHeight, setDesktopFrameHeight] = useState(0);
  const [isDesktopLocked, setIsDesktopLocked] = useState(false);
  const desktopFrameRef = useRef(null);
  const shouldReplaceUtilityNav =
    isAuthenticated && location.pathname === "/";
  const mainClassName = [
    "public-home",
    isDesktopLocked ? "public-home--locked" : "",
    shouldReplaceUtilityNav ? "public-home--utility-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

  if (isDesktopLocked) {
    return (
      <main className={mainClassName}>
        <div className="public-home__stage" style={{ height: `${desktopFrameHeight * desktopScale}px` }}>
          <div
            className="public-home__frame"
            ref={desktopFrameRef}
            style={{
              "--public-frame-scale": desktopScale,
              transform: `translateX(-50%) scale(${desktopScale})`,
            }}
          >
            {shouldReplaceUtilityNav ? (
              <div className="public-home__utility-replacement">
                <PublicSessionStatus />
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </main>
    );
  }

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
