import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { PublicAuthProvider } from "./contexts/PublicAuthContext";
import { PublicWishlistProvider } from "./contexts/PublicWishlistContext";
import "./index.css";

// 전역 Unhandled Promise rejection도 콘솔에 표시 (모니터링 도입 전 임시)
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
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
