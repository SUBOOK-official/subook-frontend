import { Link, useSearchParams } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicOrderCompletePage.css";

// 토스 결제위젯 failUrl 복귀 지점.
// 토스가 ?code=&message=&orderId= 를 붙여 리다이렉트(사용자 취소·한도초과·인증실패 등).
// 결제가 안 됐을 뿐 주문(pending)은 남아 있다가 24시간 뒤 자동 취소된다.
function PublicPaymentFailPage() {
  usePageMeta({ title: "결제 실패", noindex: true });
  const [params] = useSearchParams();
  const code = params.get("code");
  const message = params.get("message");

  const detail = message || "결제가 취소되었거나 완료되지 않았습니다.";

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <PublicSiteHeader />
        <ContentContainer as="section" className="order-complete-content">
          <div className="order-complete-card">
            <h1 className="order-complete-card__title">결제가 완료되지 않았어요</h1>
            <p className="order-complete-card__subtitle">
              {detail}
              {code ? ` (${code})` : ""}
            </p>
            <p className="order-complete-card__subtitle">
              결제만 진행되지 않았을 뿐 요금은 청구되지 않았어요. 다시 시도하거나 다른 결제수단을 이용해 주세요.
            </p>
            <div className="order-complete-card__actions">
              <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/cart">
                장바구니로 돌아가기
              </Link>
              <Link className="order-complete-card__btn order-complete-card__btn--secondary" to="/mypage">
                주문 내역 확인
              </Link>
            </div>
          </div>
        </ContentContainer>
        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicPaymentFailPage;
