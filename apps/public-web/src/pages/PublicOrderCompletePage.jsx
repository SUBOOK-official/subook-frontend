import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";
import {
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  PAYMENT_DEADLINE_HOURS,
  buildDepositorName,
} from "../lib/paymentBankInfo";
import "./PublicOrderCompletePage.css";

// "MM/DD HH:mm" 한국 시각 포맷
function formatDeadline(createdAtIso) {
  if (!createdAtIso) return "";
  try {
    const created = new Date(createdAtIso);
    const deadline = new Date(created.getTime() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);
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

// 입금 마감까지 남은 시간을 1초마다 재계산해 "H시간 MM분 SS초 남음" 형태로 반환.
// 마감이 지나면 null. createdAt이 없거나 이미 결제완료/취소면 동작 안 함.
function usePaymentCountdown(createdAtIso, active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !createdAtIso) return undefined;
    const tick = () => setNow(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [createdAtIso, active]);
  if (!active || !createdAtIso) return null;
  try {
    const deadlineMs = new Date(createdAtIso).getTime() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000;
    const remainingMs = deadlineMs - now;
    if (remainingMs <= 0) return { expired: true, label: "" };
    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    const label = hours > 0 ? `${hours}시간 ${pad(minutes)}분 ${pad(seconds)}초 남음` : `${pad(minutes)}분 ${pad(seconds)}초 남음`;
    return { expired: false, label, urgent: hours === 0 && minutes < 30 };
  } catch {
    return null;
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
  usePageMeta({ title: "주문 완료", noindex: true });
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
    paymentMethod: initial.paymentMethod ?? null,
    createdAt: initial.createdAt ?? null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // 카운트다운은 early return 이전에 호출해야 rules-of-hooks 준수. 활성화는 결제 미완료일 때만.
  const isPaid =
    order.paymentStatus === "paid" ||
    (order.status && order.status !== "pending" && order.status !== "cancelled");
  const isCancelled = order.status === "cancelled";
  // 카드(PG) 주문: 입금 안내·"입금 확인" 카피가 전부 무통장 전제라 분기한다.
  const isCardOrder = order.paymentMethod === "card";
  const countdown = usePaymentCountdown(order.createdAt, !isPaid && !isCancelled && !isCardOrder);

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
          "id, order_number, total_amount, item_count, status, payment_status, payment_method, created_at, shipping_recipient_name",
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
        paymentMethod: data.payment_method,
        createdAt: data.created_at,
      });
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, hasSession, orderId]);

  // 비로그인 + 주문 정보도 못 가져온 케이스: 결제 직후 세션이 만료된 사용자가
  // 입금 안내(계좌번호/입금자명)를 못 보면 입금만 보내고 매칭 실패 → 24시간 자동 취소
  // 위험이 있다. 로그인 화면으로 보내되 anwendung notice로 다음 동선을 명시한다.
  if (!authLoading && !hasSession && !order.orderNumber) {
    return (
      <Navigate
        replace
        state={{
          from: { pathname: `/order/complete/${orderId ?? ""}` },
          notice:
            "주문 정보를 확인하려면 로그인이 필요합니다. 로그인 후 마이페이지 > 주문내역에서 입금 계좌와 주문번호를 확인할 수 있습니다.",
        }}
        to="/login"
      />
    );
  }

  const { orderNumber, totalAmount, itemCount, recipientName, createdAt } = order;
  const depositorName = buildDepositorName(recipientName, orderNumber);
  const bankAccountPlain = BANK_ACCOUNT.replace(/-/g, "");
  const deadlineLabel = formatDeadline(createdAt);

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
                      ? isCardOrder
                        ? "결제가 완료되었어요. 곧 발송 처리됩니다."
                        : "입금이 확인되었어요. 곧 발송 처리됩니다."
                      : isCardOrder
                        ? "카드 결제가 완료되지 않은 주문이에요."
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

                {!isPaid && !isCancelled && isCardOrder ? (
                  <div className="order-complete-card__bank-info">
                    <p className="order-complete-card__bank-title">결제 미완료 안내</p>
                    <p className="order-complete-card__bank-hint">
                      결제창이 닫혔거나 결제에 실패했어요. 이 주문은 24시간 후 자동 취소되며,
                      다시 구매하시려면 마이페이지에서 취소 후 새로 주문해 주세요.
                    </p>
                  </div>
                ) : null}

                {!isPaid && !isCancelled && !isCardOrder ? (
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

                    <p
                      aria-live="polite"
                      className={`order-complete-card__bank-notice ${
                        countdown?.urgent ? "order-complete-card__bank-notice--urgent" : ""
                      }`}
                    >
                      ⏰ {countdown && !countdown.expired ? (
                        <>
                          <strong>{countdown.label}</strong>
                          {deadlineLabel ? <> · {deadlineLabel}까지</> : null}
                          . 미입금 시 주문이 자동 취소됩니다.
                        </>
                      ) : countdown?.expired ? (
                        <>
                          <strong>입금 예정 시간이 지났어요.</strong> 아직 입금 전이라면 곧 자동 취소될 수 있으니 서둘러 입금해 주세요. 이미 입금하셨다면 확인까지 잠시만 기다려 주세요.
                        </>
                      ) : deadlineLabel ? (
                        <>
                          <strong>{deadlineLabel}까지</strong> 입금해주세요. 미입금 시 주문이 자동 취소됩니다.
                        </>
                      ) : (
                        <>
                          주문 후 <strong>{PAYMENT_DEADLINE_HOURS}시간 이내</strong>에 입금해주세요. 미입금 시 주문이 자동 취소됩니다.
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
