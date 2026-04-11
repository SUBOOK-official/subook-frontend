import { Navigate, Route, Routes } from "react-router-dom";
import PublicCartPage from "./pages/PublicCartPage";
import PublicForgotPasswordPage from "./pages/PublicForgotPasswordPage";
import PublicHomePage from "./pages/PublicHomePage";
import PublicLoginPage from "./pages/PublicLoginPage";
import PublicMypagePage from "./pages/PublicMypagePage";
import PublicOrderCompletePage from "./pages/PublicOrderCompletePage";
import PublicOrderPage from "./pages/PublicOrderPage";
import PublicPickupRequestPage from "./pages/PublicPickupRequestPage";
import PublicProductDetailPage from "./pages/PublicProductDetailPage";
import PublicResetPasswordPage from "./pages/PublicResetPasswordPage";
import PublicSignupPage from "./pages/PublicSignupPage";
import PublicSignupSuccessPage from "./pages/PublicSignupSuccessPage";
import PublicStorePage from "./pages/PublicStorePage";

function App() {
  return (
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
      <Route element={<PublicProductDetailPage />} path="/store/:productId" />
      <Route element={<PublicSignupPage />} path="/signup" />
      <Route element={<PublicSignupSuccessPage />} path="/signup-success" />
      <Route element={<PublicStorePage />} path="/store" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;
