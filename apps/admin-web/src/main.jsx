import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AdminStudioProvider } from "./contexts/AdminStudioContext";
import { installChunkReloadGuard } from "./lib/chunkReloadGuard";
import { initSentry, Sentry } from "./lib/sentryInit";
import "./index.css";

// Sentry 초기화 (VITE_SENTRY_DSN_ADMIN 또는 VITE_SENTRY_DSN이 있을 때만 활성화)
initSentry();

// 배포 후 스테일 청크(옛 해시 자산) 로딩 실패 시 1회 자동 새로고침
installChunkReloadGuard();

// 전역 Unhandled Promise rejection 캡처
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
    try { Sentry?.captureException?.(event.reason); } catch { /* noop */ }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AdminStudioProvider>
          <App />
        </AdminStudioProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
