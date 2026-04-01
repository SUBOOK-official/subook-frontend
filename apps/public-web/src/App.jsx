import { Navigate, Route, Routes } from "react-router-dom";
import PublicForgotPasswordPage from "./pages/PublicForgotPasswordPage";
import PublicGuestOrderLookupPage from "./pages/PublicGuestOrderLookupPage";
import PublicHomePage from "./pages/PublicHomePage";
import PublicLoginPage from "./pages/PublicLoginPage";
import PublicSignupPage from "./pages/PublicSignupPage";
import PublicSignupSuccessPage from "./pages/PublicSignupSuccessPage";
import PublicStorePage from "./pages/PublicStorePage";

function App() {
  return (
    <Routes>
      <Route element={<PublicForgotPasswordPage />} path="/forgot-password" />
      <Route element={<PublicGuestOrderLookupPage />} path="/guest-order-lookup" />
      <Route element={<PublicHomePage />} path="/" />
      <Route element={<PublicLoginPage />} path="/login" />
      <Route element={<PublicSignupPage />} path="/signup" />
      <Route element={<PublicSignupSuccessPage />} path="/signup-success" />
      <Route element={<PublicStorePage />} path="/store" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;
