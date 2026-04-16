import { Link, useLocation } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import "./PublicOrderCompletePage.css";

function PublicOrderCompletePage() {
  const location = useLocation();
  const { orderNumber, totalAmount, itemCount } = location.state ?? {};

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <div className="public-top-area">
          <PublicSiteHeader />
        </div>

        <ContentContainer as="section" className="order-complete-content">
          <div className="order-complete-card">
            <div className="order-complete-card__icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="order-complete-card__title">주문이 완료되었습니다</h1>
            <p className="order-complete-card__subtitle">
              입금 확인 후 순차적으로 발송됩니다
            </p>

            <div className="order-complete-card__details">
              {orderNumber && (
                <div className="order-complete-card__row">
                  <span>주문번호</span>
                  <span className="order-complete-card__value">{orderNumber}</span>
                </div>
              )}
              {itemCount != null && (
                <div className="order-complete-card__row">
                  <span>주문 상품</span>
                  <span>{itemCount}개</span>
                </div>
              )}
              {totalAmount != null && (
                <div className="order-complete-card__row">
                  <span>결제 금액</span>
                  <span className="order-complete-card__value">{formatCurrency(totalAmount)}</span>
                </div>
              )}
            </div>

            <div className="order-complete-card__bank-info">
              <p className="order-complete-card__bank-title">입금 계좌 안내</p>
              <p className="order-complete-card__bank-account">신한은행 110-XXX-XXXXXX (수북)</p>
              <p className="order-complete-card__bank-notice">
                주문 후 24시간 이내에 입금해주세요. 미입금 시 자동 취소됩니다.
              </p>
            </div>

            <div className="order-complete-card__actions">
              <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/mypage">
                주문 내역 확인
              </Link>
              <Link className="order-complete-card__btn order-complete-card__btn--secondary" to="/store">
                쇼핑 계속하기
              </Link>
            </div>
          </div>
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicOrderCompletePage;
