import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import "./PublicOrderCompletePage.css";

const BANK_NAME = "카카오뱅크";
const BANK_ACCOUNT = "3333-36-3268506";
const BANK_HOLDER = "박영제";

// 주문번호(예: ORD-2412-0042)에서 마지막 4자리 추출
function getOrderTail(orderNumber) {
  if (!orderNumber) return "";
  const digits = String(orderNumber).replace(/\D/g, "");
  return digits.slice(-4);
}

// 추천 입금자명: "홍길동1234"
function buildDepositorName(recipientName, orderNumber) {
  const name = (recipientName ?? "").toString().trim();
  const tail = getOrderTail(orderNumber);
  if (!name || !tail) return name || tail;
  return `${name}${tail}`;
}

function CopyButton({ value, ariaLabel }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // fallback
        const t = document.createElement("textarea");
        t.value = value;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        t.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 사용자가 빠르게 다시 누르거나 권한 거부된 경우 무시
    }
  };

  return (
    <button
      aria-label={ariaLabel}
      className="order-complete-card__copy-btn"
      onClick={onCopy}
      type="button"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

function PublicOrderCompletePage() {
  const location = useLocation();
  const { orderNumber, totalAmount, itemCount, recipientName } = location.state ?? {};

  const depositorName = buildDepositorName(recipientName, orderNumber);
  const bankAccountPlain = BANK_ACCOUNT.replace(/-/g, "");

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <PublicSiteHeader />

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

              <div className="order-complete-card__bank-row">
                <div>
                  <p className="order-complete-card__bank-account">
                    {BANK_NAME} {BANK_ACCOUNT}
                  </p>
                  <p className="order-complete-card__bank-holder">예금주: {BANK_HOLDER}</p>
                </div>
                <CopyButton value={bankAccountPlain} ariaLabel="계좌번호 복사" />
              </div>

              {totalAmount != null && (
                <div className="order-complete-card__bank-row">
                  <div>
                    <p className="order-complete-card__bank-label">입금 금액</p>
                    <p className="order-complete-card__bank-amount">{formatCurrency(totalAmount)}</p>
                  </div>
                  <CopyButton value={String(totalAmount)} ariaLabel="입금 금액 복사" />
                </div>
              )}

              {depositorName && (
                <div className="order-complete-card__bank-row order-complete-card__bank-row--highlight">
                  <div>
                    <p className="order-complete-card__bank-label">입금자명 (필수)</p>
                    <p className="order-complete-card__bank-depositor">{depositorName}</p>
                    <p className="order-complete-card__bank-hint">
                      본인 성함 + 주문번호 마지막 4자리. 다르게 입력하면 입금 확인이 늦어질 수 있습니다.
                    </p>
                  </div>
                  <CopyButton value={depositorName} ariaLabel="입금자명 복사" />
                </div>
              )}

              <p className="order-complete-card__bank-notice">
                ⏰ 주문 후 <strong>24시간 이내</strong>에 입금해주세요. 미입금 시 주문이 자동 취소됩니다.
              </p>
            </div>

            <div className="order-complete-card__actions">
              <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/mypage">
                주문 내역 확인
              </Link>
              <Link className="order-complete-card__btn order-complete-card__btn--secondary" to="/">
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
