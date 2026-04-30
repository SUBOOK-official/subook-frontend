import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const PublicCartPage = lazy(() => import("./pages/PublicCartPage"));
const PublicForgotPasswordPage = lazy(() => import("./pages/PublicForgotPasswordPage"));
const PublicHomePage = lazy(() => import("./pages/PublicHomePage"));
const PublicLoginPage = lazy(() => import("./pages/PublicLoginPage"));
const PublicMypagePage = lazy(() => import("./pages/PublicMypagePage"));
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

function App() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route element={<PublicResetPasswordPage />} path="/auth/reset-password" />
        <Route element={<PublicCartPage />} path="/cart" />
        <Route element={<PublicForgotPasswordPage />} path="/forgot-password" />
        <Route element={<PublicHomePage />} path="/" />
        <Route element={<PublicLoginPage />} path="/login" />
        <Route element={<PublicMypagePage />} path="/mypage" />
        <Route element={<PublicOrderCompletePage />} path="/order/complete/:orderId" />
        <Route element={<PublicOrderPage />} path="/order" />
        <Route element={<PublicPickupRequestPage />} path="/pickup/new" />
        <Route element={<PublicPolicyPage type="privacy" />} path="/privacy" />
        <Route element={<PublicProductDetailPage />} path="/store/:productId" />
        <Route element={<PublicSignupPage />} path="/signup" />
        <Route element={<PublicSignupSuccessPage />} path="/signup-success" />
        <Route element={<Navigate replace to="/" />} path="/store" />
        <Route element={<PublicPolicyPage type="terms" />} path="/terms" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  );
}

export default App;
