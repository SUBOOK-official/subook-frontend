import { lazy, Suspense, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { usePublicAuth } from "./contexts/PublicAuthContext";
// PG 심사 모드 파라미터(?pg=toss)는 부트 시점에 캡처해야 한다 — 페이지 모듈이 lazy라
// 주문서 도착 시점엔 진입 파라미터가 이미 사라져 있기 때문 (side-effect import).
import "./lib/pgReviewMode";

const PublicAuthCallbackPage = lazy(() => import("./pages/PublicAuthCallbackPage"));
const PublicCartPage = lazy(() => import("./pages/PublicCartPage"));
const PublicFaqPage = lazy(() => import("./pages/PublicFaqPage"));
const PublicForgotPasswordPage = lazy(() => import("./pages/PublicForgotPasswordPage"));
const PublicGuestOrderLookupPage = lazy(() => import("./pages/PublicGuestOrderLookupPage"));
const PublicHomePage = lazy(() => import("./pages/PublicHomePage"));
const PublicLoginPage = lazy(() => import("./pages/PublicLoginPage"));
const PublicMypagePage = lazy(() => import("./pages/PublicMypagePage"));
const PublicNoticesPage = lazy(() => import("./pages/PublicNoticesPage"));
const PublicNotificationsPage = lazy(() => import("./pages/PublicNotificationsPage"));
const PublicNotFoundPage = lazy(() => import("./pages/PublicNotFoundPage"));
const PublicOAuthConsentPage = lazy(() => import("./pages/PublicOAuthConsentPage"));
const PublicOrderCompletePage = lazy(() => import("./pages/PublicOrderCompletePage"));
const PublicOrderPage = lazy(() => import("./pages/PublicOrderPage"));
const PublicPaymentFailPage = lazy(() => import("./pages/PublicPaymentFailPage"));
const PublicPaymentSuccessPage = lazy(() => import("./pages/PublicPaymentSuccessPage"));
const PublicPickupRequestPage = lazy(() => import("./pages/PublicPickupRequestPage"));
const PublicPolicyPage = lazy(() => import("./pages/PublicPolicyPage"));
const PublicProductDetailPage = lazy(() => import("./pages/PublicProductDetailPage"));
const PublicResetPasswordPage = lazy(() => import("./pages/PublicResetPasswordPage"));
const PublicSignupPage = lazy(() => import("./pages/PublicSignupPage"));
const PublicSignupSuccessPage = lazy(() => import("./pages/PublicSignupSuccessPage"));
const PublicSubjectPage = lazy(() => import("./pages/PublicSubjectPage"));

function PageLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm font-semibold text-slate-500">
      불러오는 중...
    </div>
  );
}

// /store?... 외부 SEO 링크와 SubjectGrid 카드 링크가 통째로 홈으로 튕기는 걸 방지.
// 쿼리스트링·해시를 보존한 채 홈(HomeStoreGrid가 search params를 읽음)으로 리다이렉트.
function RedirectStoreToHome() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/", search: location.search, hash: location.hash }} />;
}

// 가입 미완료 사용자(약관 동의 안 한 OAuth 신규 가입자 + OTP 인증만 하고 떠난 사용자)가
// 다른 페이지를 떠돌면 자동으로 가입 마무리 페이지로 보낸다.
// 콜백 페이지나 동의 페이지 자체에서는 동작 안 함 (loop 방지).
// /signup도 제외 — 사용자가 OTP 인증 중인 정상 흐름과 충돌 방지.
function SignupCompletionGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading, needsSignupCompletion } = usePublicAuth();

  useEffect(() => {
    if (isLoading || !needsSignupCompletion) return;
    if (
      location.pathname === "/auth/oauth-consent"
      || location.pathname === "/auth/callback"
      || location.pathname === "/signup"
    ) return;
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/auth/oauth-consent?next=${encodeURIComponent(nextPath)}`, { replace: true });
  }, [isLoading, needsSignupCompletion, location.pathname, location.search, location.hash, navigate]);

  return null;
}

// SPA는 라우트 이동 시 window 스크롤이 유지된다. 홈을 스크롤한 채 상품을 클릭하면
// 상세 페이지가 그 위치에서 시작하는 문제를 막기 위해, 새 페이지로 이동할 때 맨 위로 올린다.
function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    // 뒤로/앞으로 가기(POP)는 브라우저의 위치 복원에 맡긴다 (이전에 보던 위치로 돌아가는 게 자연스러움).
    if (navigationType === "POP") return;
    // 홈 스토어 섹션으로 스크롤하려는 의도가 담긴 내비게이션은 그쪽(HomeStoreGrid) 로직이 처리하므로 건드리지 않음.
    if (location.state?.scrollToStorefront) return;
    // pathname이 그대로면(=검색어/필터/페이지네이션처럼 query만 변경) 스크롤을 건드리지 않는다.
    // 페이지 넘길 때 시야가 유지되고, 위로 튕기지 않게 함.
    if (prevPath === location.pathname) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, location.state, navigationType]);

  return null;
}

function App() {
  return (
    <>
      <SignupCompletionGate />
      <ScrollToTop />
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
          <Route element={<PublicGuestOrderLookupPage />} path="/order/lookup" />
          <Route element={<PublicPaymentSuccessPage />} path="/order/payment/success" />
          <Route element={<PublicPaymentFailPage />} path="/order/payment/fail" />
          <Route element={<PublicOrderPage />} path="/order" />
          <Route element={<PublicPickupRequestPage />} path="/pickup/new" />
          <Route element={<PublicPolicyPage type="privacy" />} path="/privacy" />
          <Route element={<PublicPolicyPage type="refund" />} path="/refund" />
          <Route element={<PublicSubjectPage />} path="/store/subject/:subject" />
          <Route element={<PublicProductDetailPage />} path="/store/:productId" />
          <Route element={<PublicSignupPage />} path="/signup" />
          <Route element={<PublicSignupSuccessPage />} path="/signup-success" />
          <Route element={<RedirectStoreToHome />} path="/store" />
          <Route element={<PublicPolicyPage type="terms" />} path="/terms" />
          <Route element={<PublicNotFoundPage />} path="*" />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
