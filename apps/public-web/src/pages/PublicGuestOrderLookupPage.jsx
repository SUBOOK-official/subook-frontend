import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import {
  makeOnceGuard,
  trackContactClick,
  trackEvent,
  trackGuestOrderLookup,
  trackSelectContent,
} from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import { fetchGuestOrder } from "../lib/guestOrder";
import {
  formatDateTime,
  getOrderStatusLabel,
  getOrderStatusTone,
  getPaymentMethodLabel,
} from "../lib/publicMypageUtils";
import { getThumbnailImageUrl } from "../lib/storageImage";
import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
import {
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  PAYMENT_DEADLINE_HOURS,
  buildDepositorName,
} from "../lib/paymentBankInfo";
import "./PublicGuestOrderLookupPage.css";

// 입금 마감 시각 "MM/DD HH:mm" (주문완료 페이지와 동일 규칙)
function formatDeadline(createdAtIso) {
  if (!createdAtIso) return "";
  try {
    const created = new Date(createdAtIso);
    const deadline = new Date(created.getTime() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(deadline);
  } catch {
    return "";
  }
}

function PublicGuestOrderLookupPage() {
  usePageMeta({ title: "비회원 주문 조회", noindex: true });
  const location = useLocation();

  const [orderNumber, setOrderNumber] = useState(location.state?.orderNumber ?? "");
  const [phone, setPhone] = useState(location.state?.phone ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  const autoSearchedRef = useRef(false);

  // lookupSource: manual(폼 제출) / auto(주문완료 페이지에서 state로 진입한 자동 조회)
  const runLookup = async (nextOrderNumber, nextPhone, lookupSource = "manual") => {
    const trimmedNumber = String(nextOrderNumber ?? "").trim();
    const phoneDigits = String(nextPhone ?? "").replace(/\D/g, "");

    if (!trimmedNumber) {
      // GA4 guest_order_lookup_error — 조회 실패 원인 분포(입력 누락 vs 서버 거절)
      trackEvent("guest_order_lookup_error", {
        errorReason: "missing_order_number",
        lookupSource,
      });
      setErrorMessage("주문번호를 입력해 주세요.");
      return;
    }
    if (phoneDigits.length < 9) {
      trackEvent("guest_order_lookup_error", {
        errorReason: "invalid_phone",
        lookupSource,
      });
      setErrorMessage("주문 시 입력한 휴대폰 번호를 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setResult(null);

    const { data, error } = await fetchGuestOrder(trimmedNumber, phoneDigits);

    setIsLoading(false);

    if (error) {
      const isRateLimited = Boolean(error.message?.includes("조회 시도가 너무 많습니다"));
      trackEvent("guest_order_lookup_error", {
        errorReason: isRateLimited ? "rate_limited" : "rpc_error",
        lookupSource,
      });
      setErrorMessage(
        isRateLimited
          ? "조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."
          : "주문을 조회하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    if (!data?.found) {
      trackGuestOrderLookup(false, { lookupSource });
      setErrorMessage("일치하는 주문이 없습니다. 주문번호와 휴대폰 번호를 확인해 주세요.");
      return;
    }

    trackGuestOrderLookup(true, { lookupSource });
    setResult(data);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isLoading) return;
    runLookup(orderNumber, phone, "manual");
  };

  // 주문완료 페이지 등에서 state로 진입하면 자동 조회 (1회)
  useEffect(() => {
    if (autoSearchedRef.current) return;
    if (location.state?.orderNumber && location.state?.phone) {
      autoSearchedRef.current = true;
      runLookup(location.state.orderNumber, location.state.phone, "auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order = result?.order ?? null;
  const items = Array.isArray(result?.items) ? result.items : [];
  const isPendingBank =
    order &&
    order.status === "pending" &&
    order.payment_status === "pending" &&
    order.payment_method === "bank_transfer";
  const depositorName = order
    ? buildDepositorName(order.shipping_recipient_name, order.order_number)
    : "";
  const deadlineLabel = order ? formatDeadline(order.created_at) : "";
  const refundedAmount = Number(order?.refunded_amount ?? 0);

  // GA4 guest_order_lookup_result_view — 조회 성공 화면 노출 1회(주문번호 기준).
  // 조회 성공 대비 어떤 상태의 주문을 확인하러 오는지(입금 대기·배송 추적) 분포를 본다.
  const resultViewGuardRef = useRef(makeOnceGuard());
  useEffect(() => {
    if (!order?.order_number) return;
    if (!resultViewGuardRef.current(String(order.order_number))) return;
    trackEvent("guest_order_lookup_result_view", {
      orderStatus: order.status,
      paymentType: order.payment_method,
      isPendingBank: Boolean(isPendingBank),
      hasTracking: Boolean(order.tracking_number),
    });
  }, [order, isPendingBank]);

  // GA4 bank_info_shown — 입금 계좌 안내 노출 1회 (입금 미완료 재확인 동선)
  const bankInfoGuardRef = useRef(makeOnceGuard());
  useEffect(() => {
    if (!isPendingBank || !order?.order_number) return;
    if (!bankInfoGuardRef.current(String(order.order_number))) return;
    trackEvent("bank_info_shown", {
      uiSurface: "guest_lookup",
      value: Number(order.total_amount) || 0,
    });
  }, [isPendingBank, order]);

  return (
    <PublicPageFrame>
      <div className="guest-lookup-page">
        <PublicSiteHeader />

        <ContentContainer as="section" className="guest-lookup-content">
          <div className="guest-lookup-head">
            <h1 className="guest-lookup-title">비회원 주문 조회</h1>
            <p className="guest-lookup-subtitle">
              주문번호와 주문 시 입력한 휴대폰 번호를 입력해 주세요.
            </p>
          </div>

          <form className="guest-lookup-form" onSubmit={handleSubmit}>
            <label className="guest-lookup-field">
              <span className="guest-lookup-field__label">주문번호</span>
              <input
                autoComplete="off"
                className="guest-lookup-field__input"
                inputMode="text"
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="예: ORD-2608-G1A2B3C4D5"
                type="text"
                value={orderNumber}
              />
            </label>
            <label className="guest-lookup-field">
              <span className="guest-lookup-field__label">휴대폰 번호</span>
              <input
                autoComplete="tel"
                className="guest-lookup-field__input"
                inputMode="numeric"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="주문 시 입력한 번호 (숫자만)"
                type="tel"
                value={phone}
              />
            </label>

            {errorMessage ? (
              <p className="guest-lookup-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button className="guest-lookup-submit" disabled={isLoading} type="submit">
              {isLoading ? "조회 중..." : "주문 조회"}
            </button>
          </form>

          {order ? (
            <div className="guest-lookup-result">
              <div className="guest-lookup-result__head">
                <div>
                  <p className="guest-lookup-result__number">{order.order_number}</p>
                  <p className="guest-lookup-result__date">{formatDateTime(order.created_at)} 주문</p>
                </div>
                <span
                  className={`public-mypage-chip public-mypage-chip--${getOrderStatusTone(order.status)}`}
                >
                  {getOrderStatusLabel(order.status)}
                </span>
              </div>

              <ul className="guest-lookup-items">
                {items.map((item, index) => (
                  <li className="guest-lookup-item" key={`${item.title}-${index}`}>
                    {item.cover_image_url ? (
                      <img
                        alt=""
                        className="guest-lookup-item__cover"
                        loading="lazy"
                        src={getThumbnailImageUrl(item.cover_image_url)}
                      />
                    ) : (
                      <div aria-hidden="true" className="guest-lookup-item__cover guest-lookup-item__cover--empty" />
                    )}
                    <div className="guest-lookup-item__body">
                      <p className="guest-lookup-item__title">{item.title}</p>
                      <p className="guest-lookup-item__meta">
                        {[item.option_label, item.condition_grade ? `${item.condition_grade}등급` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.refunded_at ? (
                        <p className="guest-lookup-item__refunded">환불 완료</p>
                      ) : null}
                    </div>
                    <p className="guest-lookup-item__price">{formatCurrency(item.total_price)}</p>
                  </li>
                ))}
              </ul>

              <dl className="guest-lookup-summary">
                <div className="guest-lookup-summary__row">
                  <dt>상품 금액</dt>
                  <dd>{formatCurrency(order.subtotal)}</dd>
                </div>
                <div className="guest-lookup-summary__row">
                  <dt>배송비</dt>
                  <dd>{order.shipping_fee > 0 ? formatCurrency(order.shipping_fee) : "무료"}</dd>
                </div>
                {refundedAmount > 0 ? (
                  <div className="guest-lookup-summary__row guest-lookup-summary__row--refund">
                    <dt>환불 금액</dt>
                    <dd>-{formatCurrency(refundedAmount)}</dd>
                  </div>
                ) : null}
                <div className="guest-lookup-summary__row guest-lookup-summary__row--total">
                  <dt>{getPaymentMethodLabel(order.payment_method)} 결제 금액</dt>
                  <dd>{formatCurrency(order.total_amount)}</dd>
                </div>
              </dl>

              {isPendingBank ? (
                <div className="guest-lookup-bank">
                  <p className="guest-lookup-bank__title">입금 계좌 안내</p>
                  <p className="guest-lookup-bank__account">
                    {BANK_NAME} {BANK_ACCOUNT} (예금주: {BANK_HOLDER})
                  </p>
                  <p className="guest-lookup-bank__row">
                    입금 금액 <strong>{formatCurrency(order.total_amount)}</strong>
                  </p>
                  {depositorName ? (
                    <p className="guest-lookup-bank__row">
                      입금자명 <strong>{depositorName}</strong>
                    </p>
                  ) : null}
                  <p className="guest-lookup-bank__notice">
                    {deadlineLabel ? `${deadlineLabel}까지` : `주문 후 ${PAYMENT_DEADLINE_HOURS}시간 이내`}{" "}
                    입금되지 않으면 주문이 자동 취소됩니다.
                  </p>
                </div>
              ) : null}

              <div className="guest-lookup-shipping">
                <p className="guest-lookup-shipping__title">배송 정보</p>
                <p className="guest-lookup-shipping__line">
                  {order.shipping_recipient_name} · {order.shipping_recipient_phone}
                </p>
                <p className="guest-lookup-shipping__line">
                  ({order.shipping_postal_code}) {order.shipping_address_line1}{" "}
                  {order.shipping_address_line2 || ""}
                </p>
                {order.tracking_number ? (
                  <p className="guest-lookup-shipping__line">
                    운송장 {order.tracking_carrier || "CJ대한통운"} {order.tracking_number}
                  </p>
                ) : null}
              </div>

              <p className="guest-lookup-help">
                주문 취소·변경이 필요하면{" "}
                {/* GA4 contact_click — 어떤 주문 상태에서 문의로 새는지 */}
                <a
                  href={KAKAO_CHANNEL_URL}
                  onClick={() =>
                    trackContactClick("kakao", "guest_lookup", { orderStatus: order.status })
                  }
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  카카오톡 1:1문의
                </a>
                로 주문번호와 함께 문의해 주세요.
              </p>
            </div>
          ) : null}

          <div className="guest-lookup-footer-links">
            {/* GA4 select_content — 조회 후 이동 동선(회원 전환 vs 쇼핑 복귀) */}
            <Link onClick={() => trackSelectContent("guest_lookup_link", "login")} to="/login">
              회원 로그인
            </Link>
            <span aria-hidden="true">·</span>
            <Link onClick={() => trackSelectContent("guest_lookup_link", "home")} to="/">
              쇼핑 계속하기
            </Link>
          </div>
        </ContentContainer>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicGuestOrderLookupPage;
