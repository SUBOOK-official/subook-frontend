import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { usePublicAuth } from "./contexts/PublicAuthContext";

const PublicAuthCallbackPage = lazy(() => import("./pages/PublicAuthCallbackPage"));
const PublicCartPage = lazy(() => import("./pages/PublicCartPage"));
const PublicFaqPage = lazy(() => import("./pages/PublicFaqPage"));
const PublicForgotPasswordPage = lazy(() => import("./pages/PublicForgotPasswordPage"));
const PublicHomePage = lazy(() => import("./pages/PublicHomePage"));
const PublicLoginPage = lazy(() => import("./pages/PublicLoginPage"));
const PublicMypagePage = lazy(() => import("./pages/PublicMypagePage"));
const PublicNoticesPage = lazy(() => import("./pages/PublicNoticesPage"));
const PublicNotificationsPage = lazy(() => import("./pages/PublicNotificationsPage"));
const PublicNotFoundPage = lazy(() => import("./pages/PublicNotFoundPage"));
const PublicOAuthConsentPage = lazy(() => import("./pages/PublicOAuthConsentPage"));
const PublicOrderCompletePage = lazy(() => import("./pages/PublicOrderCompletePage"));
const PublicOrderPage = lazy(() => import("./pages/PublicOrderPage"));
const PublicPickupRequestPage = lazy(() => import("./pages/PublicPickupRequestPage"));
const PublicPolicyPage = lazy(() => import("./pages/PublicPolicyPage"));
const PublicProductDetailPage = lazy(() => import("./pages/PublicProductDetailPage"));
const PublicResetPasswordPage = lazy(() => import("./pages/PublicResetPasswordPage"));
const PublicSignupPage = lazy(() => import("./pages/PublicSignupPage"));
const PublicSignupSuccessPage = lazy(() => import("./pages/PublicSignupSuccessPage"));

function PageLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm font-semibold text-slate-500">
      불러오는 중...
    </div>
  );
}

// OAuth 신규 가입자가 약관 동의 안 한 채 다른 페이지를 떠돌면 자동으로 동의 페이지로 보낸다.
// 콜백 페이지나 동의 페이지 자체에서는 동작 안 함 (loop 방지).
function OAuthConsentGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading, needsOAuthConsent } = usePublicAuth();

  useEffect(() => {
    if (isLoading || !needsOAuthConsent) return;
    if (location.pathname === "/auth/oauth-consent" || location.pathname === "/auth/callback") return;
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/auth/oauth-consent?next=${encodeURIComponent(nextPath)}`, { replace: true });
  }, [isLoading, needsOAuthConsent, location.pathname, location.search, location.hash, navigate]);

  return null;
}

function App() {
  return (
    <>
      <OAuthConsentGate />
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route element={<PublicResetPasswordPage />} path="/auth/reset-password" />
          <Route element={<PublicAuthCallbackPage />} path="/auth/callback" />
          <Route element={<PublicOAuthConsentPage />} path="/auth/oauth-consent" />
          <Route element={<PublicCartPage />} path="/cart" />
          <Route element={<PublicFaqPage />} path="/faq" />
          <Route element={<PublicForgotPasswordPage />} path="/forgot-password" />
          <Route element={<PublicHomePage />} path="/" />
          <Route element={<PublicLoginPage />} path="/login" />
          <Route element={<PublicMypagePage />} path="/mypage" />
          <Route element={<PublicNoticesPage />} path="/notices" />
          <Route element={<PublicNotificationsPage />} path="/notifications" />
          <Route element={<PublicOrderCompletePage />} path="/order/complete/:orderId" />
          <Route element={<PublicOrderPage />} path="/order" />
          <Route element={<PublicPickupRequestPage />} path="/pickup/new" />
          <Route element={<PublicPolicyPage type="privacy" />} path="/privacy" />
          <Route element={<PublicPolicyPage type="refund" />} path="/refund" />
          <Route element={<PublicProductDetailPage />} path="/store/:productId" />
          <Route element={<PublicSignupPage />} path="/signup" />
          <Route element={<PublicSignupSuccessPage />} path="/signup-success" />
          <Route element={<Navigate replace to="/" />} path="/store" />
          <Route element={<PublicPolicyPage type="terms" />} path="/terms" />
          <Route element={<PublicNotFoundPage />} path="*" />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
