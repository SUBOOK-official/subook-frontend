import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { trackCheckoutError } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
// 주문완료 페이지의 카드/스피너/에러 스타일을 그대로 재사용.
import "./PublicOrderCompletePage.css";

// 토스 결제위젯 successUrl 복귀 지점.
// 토스가 ?paymentKey=&orderId=&amount= 를 붙여 리다이렉트 → 서버 승인(/api/payments/confirm)
// → 성공 시 주문완료 페이지(/order/complete/:id)로 이동.
function PublicPaymentSuccessPage() {
  usePageMeta({ title: "결제 확인 중", noindex: true });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // StrictMode/이중 렌더에서 confirm이 두 번 호출되는 걸 막는다(서버는 멱등이지만 방어).
  const calledRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = params.get("amount");

    if (!paymentKey || !orderId || !amount) {
      // GA4 checkout_error — 복귀 파라미터 누락(승인 시도조차 못 한 케이스). paymentKey는 절대 보내지 않는다.
      trackCheckoutError("pg_confirm_params", null, {
        pgProvider: "toss",
        ...(orderId ? { orderId } : {}),
      });
      setError("결제 정보가 올바르지 않습니다. 마이페이지 > 주문내역에서 상태를 확인해 주세요.");
      return;
    }

    (async () => {
      try {
        const resp = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || !result.success) {
          // GA4 checkout_error — 승인 API 거절 (금액 불일치·중복 승인·PG 거절 등)
          trackCheckoutError("pg_confirm", result.error, {
            pgProvider: "toss",
            orderId,
          });
          setError(
            result.error ||
              "결제 확인에 실패했습니다. 결제가 진행되었다면 마이페이지에서 주문 상태를 확인하거나 고객센터로 문의해 주세요.",
          );
          return;
        }
        navigate(`/order/complete/${result.orderId}`, {
          replace: true,
          state: {
            orderNumber: result.orderNumber,
            status: result.status ?? "paid",
            paymentStatus: "paid",
          },
        });
      } catch {
        // GA4 checkout_error — 승인 요청 자체가 실패(네트워크·타임아웃). 결제는 됐는데 화면만 실패한 구간.
        trackCheckoutError("pg_confirm_network", null, {
          pgProvider: "toss",
          orderId,
        });
        setError(
          "결제 확인 중 오류가 발생했습니다. 잠시 후 마이페이지 > 주문내역에서 상태를 확인해 주세요.",
        );
      }
    })();
  }, [params, navigate]);

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <PublicSiteHeader />
        <ContentContainer as="section" className="order-complete-content">
          <div className="order-complete-card">
            {error ? (
              <div className="order-complete-card__error" role="alert">
                <p>{error}</p>
                <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/mypage">
                  마이페이지로
                </Link>
              </div>
            ) : (
              <div className="order-complete-card__loading" role="status" aria-live="polite">
                <span className="public-auth-spinner" aria-hidden="true" />
                <p>결제를 확인하고 있어요...</p>
              </div>
            )}
          </div>
        </ContentContainer>
        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicPaymentSuccessPage;
