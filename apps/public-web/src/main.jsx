import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import MaintenancePage from "./MaintenancePage";
import { PublicAuthProvider } from "./contexts/PublicAuthContext";
import { PublicWishlistProvider } from "./contexts/PublicWishlistContext";
import { initSentry, Sentry } from "./lib/sentryInit";
import "./index.css";

// 도메인 전환 등 점검 모드: VITE_MAINTENANCE=1 로 빌드하면 전 경로가 점검 안내만 노출.
// 해제 = 플래그 없이 재배포 (npm run deploy:public)
//
// 스태프 우회: 점검 중 운영진 검수용 통행증. ?staff=subook2607 로 1회 진입하면
// localStorage에 저장돼 그 브라우저는 이후 실사이트를 본다 (일반 방문자는 점검 유지).
const isMaintenance = import.meta.env.VITE_MAINTENANCE === "1";
const STAFF_PASS_KEY = "subook-staff-pass";
let staffBypass = false;
if (isMaintenance && typeof window !== "undefined") {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("staff") === "subook2607") {
      localStorage.setItem(STAFF_PASS_KEY, "1");
      // 주소창에서 키 제거 (링크 재공유 시 키 노출 방지)
      params.delete("staff");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    }
    staffBypass = localStorage.getItem(STAFF_PASS_KEY) === "1";
  } catch {
    /* localStorage 불가 환경(시크릿 등 일부) — 점검 화면 유지 */
  }
}
const showMaintenance = isMaintenance && !staffBypass;

if (!showMaintenance) {
  // Sentry 초기화 (VITE_SENTRY_DSN 있을 때만 실제 활성화)
  initSentry();

  // 전역 Unhandled Promise rejection
  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      console.error("[unhandledrejection]", event.reason);
      try { Sentry?.captureException?.(event.reason); } catch { /* noop */ }
    });
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {showMaintenance ? (
      <MaintenancePage />
    ) : (
      <ErrorBoundary>
        <PublicAuthProvider>
          {/* React Router v7 future 플래그 선적용 — v6 콘솔 경고 제거 + v7 업그레이드 대비.
              startTransition: 컴포넌트 내부 lazy() 없음(전부 모듈 스코프)이라 영향 없음.
              relativeSplatPath: 다중 세그먼트 splat 라우트 없음(404 catch-all뿐)이라 영향 없음. */}
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <PublicWishlistProvider>
              <App />
            </PublicWishlistProvider>
          </BrowserRouter>
        </PublicAuthProvider>
      </ErrorBoundary>
    )}
  </React.StrictMode>,
);
