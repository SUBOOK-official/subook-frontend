import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { PublicAuthProvider } from "./contexts/PublicAuthContext";
import { PublicWishlistProvider } from "./contexts/PublicWishlistContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PublicAuthProvider>
      <BrowserRouter>
        <PublicWishlistProvider>
          <App />
        </PublicWishlistProvider>
      </BrowserRouter>
    </PublicAuthProvider>
  </React.StrictMode>,
);
