import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AdminStudioProvider } from "./contexts/AdminStudioContext";
import { initSentry, Sentry } from "./lib/sentryInit";
import "./index.css";

// Sentry 초기화 (VITE_SENTRY_DSN_ADMIN 또는 VITE_SENTRY_DSN이 있을 때만 활성화)
initSentry();

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
