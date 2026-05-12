import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { PublicAuthProvider } from "./contexts/PublicAuthContext";
import { PublicWishlistProvider } from "./contexts/PublicWishlistContext";
import { initSentry, Sentry } from "./lib/sentryInit";
import "./index.css";

// Sentry 초기화 (VITE_SENTRY_DSN 있을 때만 실제 활성화)
initSentry();

// 전역 Unhandled Promise rejection
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
    try { Sentry?.captureException?.(event.reason); } catch { /* noop */ }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PublicAuthProvider>
        <BrowserRouter>
          <PublicWishlistProvider>
            <App />
          </PublicWishlistProvider>
        </BrowserRouter>
      </PublicAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
