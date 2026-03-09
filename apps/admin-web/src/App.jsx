import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AdminRoute from "./components/AdminRoute";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminShipmentDetailPage from "./pages/AdminShipmentDetailPage";
import AdminStudioPage from "./pages/AdminStudioPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function AuthEmailRedirector() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/auth/reset-password") {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get("code");

    const hash = (location.hash || "").startsWith("#")
      ? location.hash.slice(1)
      : location.hash || "";
    const hashParams = new URLSearchParams(hash);
    const hasAccessToken = Boolean(hashParams.get("access_token"));
    const hasAuthError = Boolean(hashParams.get("error") || searchParams.get("error"));
    const type = hashParams.get("type") || searchParams.get("type");
    const isRecoveryLike = type === "recovery" || type === "invite";

    if (code || hasAccessToken || hasAuthError || isRecoveryLike) {
      navigate(
        {
          pathname: "/auth/reset-password",
          search: location.search,
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

function App() {
  return (
    <>
      <AuthEmailRedirector />
      <Routes>
        <Route element={<Navigate replace to="/admin/login" />} path="/" />
        <Route element={<AdminLoginPage />} path="/admin/login" />
        <Route
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
          path="/admin"
        />
        <Route
          element={
            <AdminRoute>
              <AdminShipmentDetailPage />
            </AdminRoute>
          }
          path="/admin/shipments/:shipmentId"
        />
        <Route
          element={
            <AdminRoute>
              <AdminStudioPage />
            </AdminRoute>
          }
          path="/admin/studio"
        />
        <Route element={<ResetPasswordPage />} path="/auth/reset-password" />
        <Route element={<Navigate replace to="/admin/login" />} path="*" />
      </Routes>
    </>
  );
}

export default App;
