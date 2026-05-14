import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
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

// "MM/DD HH:mm" 한국 시각 포맷
function formatDeadline(createdAtIso) {
  if (!createdAtIso) return "";
  try {
    const created = new Date(createdAtIso);
    const deadline = new Date(created.getTime() + 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(deadline);
  } catch {
    return "";
  }
}

function CopyButton({ value, ariaLabel }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
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
      // ignore
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
  const { orderId } = useParams();
  const { hasSession, isLoading: authLoading } = usePublicAuth();

  // location.state는 fallback. 새로고침 시 사라지므로 RPC로 재조회.
  const initial = location.state ?? {};
  const [order, setOrder] = useState({
    orderNumber: initial.orderNumber ?? null,
    totalAmount: initial.totalAmount ?? null,
    itemCount: initial.itemCount ?? null,
    recipientName: initial.recipientName ?? null,
    status: initial.status ?? null,
    paymentStatus: initial.paymentStatus ?? null,
    createdAt: initial.createdAt ?? null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!hasSession) {
      // 비로그인 진입 시 fallback state라도 있으면 그대로 표시
      setIsLoading(false);
      return;
    }
    if (!orderId || !supabase) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, total_amount, item_count, status, payment_status, created_at, shipping_recipient_name",
        )
        .eq("id", orderId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setErrorMessage("주문 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        setIsLoading(false);
        return;
      }
      if (!data) {
        setErrorMessage("주문을 찾을 수 없거나 접근 권한이 없습니다.");
        setIsLoading(false);
        return;
      }

      setOrder({
        orderNumber: data.order_number,
        totalAmount: data.total_amount,
        itemCount: data.item_count,
        recipientName: data.shipping_recipient_name,
        status: data.status,
        paymentStatus: data.payment_status,
        createdAt: data.created_at,
      });
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, hasSession, orderId]);

  // RPC 결과도 fallback도 없는 비로그인이고 orderId도 없으면 홈으로
  if (!authLoading && !hasSession && !order.orderNumber) {
    return <Navigate replace to="/login" />;
  }

  const { orderNumber, totalAmount, itemCount, recipientName, status, paymentStatus, createdAt } = order;
  const depositorName = buildDepositorName(recipientName, orderNumber);
  const bankAccountPlain = BANK_ACCOUNT.replace(/-/g, "");
  const deadlineLabel = formatDeadline(createdAt);
  const isPaid = paymentStatus === "paid" || (status && status !== "pending" && status !== "cancelled");
  const isCancelled = status === "cancelled";

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="order-complete-content">
          <div className="order-complete-card">
            {isLoading ? (
              <div className="order-complete-card__loading" role="status" aria-live="polite">
                <span className="public-auth-spinner" aria-hidden="true" />
                <p>주문 정보를 불러오는 중...</p>
              </div>
            ) : errorMessage ? (
              <div className="order-complete-card__error" role="alert">
                <p>{errorMessage}</p>
                <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/mypage">
                  마이페이지로
                </Link>
              </div>
            ) : (
              <>
                <div className="order-complete-card__icon" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className="order-complete-card__title">
                  {isCancelled ? "주문이 취소되었습니다" : "주문이 완료되었습니다"}
                </h1>
                <p className="order-complete-card__subtitle">
                  {isCancelled
                    ? "취소된 주문입니다."
                    : isPaid
                      ? "입금이 확인되었어요. 곧 발송 처리됩니다."
                      : "입금 확인 후 순차적으로 발송됩니다"}
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

                {!isPaid && !isCancelled ? (
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
                      ⏰ {deadlineLabel ? (
                        <>
                          <strong>{deadlineLabel}까지</strong> 입금해주세요. 미입금 시 주문이 자동 취소됩니다.
                        </>
                      ) : (
                        <>
                          주문 후 <strong>24시간 이내</strong>에 입금해주세요. 미입금 시 주문이 자동 취소됩니다.
                        </>
                      )}
                    </p>
                  </div>
                ) : null}

                <div className="order-complete-card__actions">
                  <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/mypage">
                    주문 내역 확인
                  </Link>
                  <Link className="order-complete-card__btn order-complete-card__btn--secondary" to="/">
                    쇼핑 계속하기
                  </Link>
                </div>
              </>
            )}
          </div>
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicOrderCompletePage;
