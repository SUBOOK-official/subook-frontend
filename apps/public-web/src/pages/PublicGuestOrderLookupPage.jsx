import { useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";

const guestOrderStatusLabelMap = {
  payment_completed: "결제 완료",
  preparing: "상품 준비 중",
  shipped: "배송 시작",
  delivered: "배송 완료",
  cancelled: "주문 취소",
};

function formatGuestOrderStatus(status) {
  return guestOrderStatusLabelMap[status] ?? status ?? "상태 확인 중";
}

function formatPrice(value) {
  if (typeof value !== "number") {
    return "금액 정보 없음";
  }

  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value) {
  if (!value) {
    return "주문일 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function PublicGuestOrderLookupPage() {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);

  const canSubmit = useMemo(() => {
    return guestName.trim() && guestEmail.trim() && orderNumber.trim();
  }, [guestEmail, guestName, orderNumber]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLookupResult(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("비회원 주문 조회 기능을 사용하려면 Supabase 환경 변수가 필요합니다.");
      return;
    }

    if (!canSubmit) {
      setError("이름, 이메일, 주문번호를 모두 입력해 주세요.");
      return;
    }

    setIsLoading(true);

    const { data, error: lookupError } = await supabase.rpc("lookup_guest_order", {
      p_guest_name: guestName.trim(),
      p_guest_email: guestEmail.trim(),
      p_order_number: orderNumber.trim(),
    });

    if (lookupError) {
      setError("주문 정보를 조회하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setIsLoading(false);
      return;
    }

    const order = Array.isArray(data) ? data[0] : data;

    if (!order) {
      setError("일치하는 비회원 주문을 찾지 못했습니다. 입력한 정보를 다시 확인해 주세요.");
      setIsLoading(false);
      return;
    }

    setLookupResult(order);
    setIsLoading(false);
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-guest-order-page">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-guest-order-heading" className="public-auth-main">
            <div className="public-auth-panel public-auth-panel--guest-order">
              <div className="public-auth-panel__header">
                <h1 className="public-auth-panel__title" id="public-guest-order-heading">
                  비회원 주문 조회
                </h1>
                <p className="public-auth-panel__description">
                  비회원으로 주문할 때 입력한 이름, 이메일, 주문번호를 기준으로 주문 상태를 확인할 수 있습니다.
                </p>
              </div>

              <div className="public-auth-panel__body">
                {error ? <p className="public-auth-notice public-auth-notice--error">{error}</p> : null}

                <form className="public-auth-form" onSubmit={handleSubmit}>
                  <label className="public-auth-field">
                    <span className="public-visually-hidden">이름</span>
                    <input
                      autoComplete="name"
                      className="public-auth-input"
                      onChange={(event) => setGuestName(event.target.value)}
                      placeholder="이름을 입력해 주세요."
                      type="text"
                      value={guestName}
                    />
                  </label>

                  <label className="public-auth-field">
                    <span className="public-visually-hidden">이메일</span>
                    <input
                      autoComplete="email"
                      className="public-auth-input"
                      onChange={(event) => setGuestEmail(event.target.value)}
                      placeholder="이메일을 입력해 주세요."
                      type="email"
                      value={guestEmail}
                    />
                  </label>

                  <label className="public-auth-field">
                    <span className="public-visually-hidden">주문번호</span>
                    <input
                      className="public-auth-input"
                      onChange={(event) => setOrderNumber(event.target.value)}
                      placeholder="주문번호를 입력해 주세요."
                      type="text"
                      value={orderNumber}
                    />
                  </label>

                  <button
                    className={`public-auth-button ${
                      canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"
                    }`}
                    disabled={!canSubmit || isLoading}
                    type="submit"
                  >
                    {isLoading ? "주문 조회 중..." : "주문 조회"}
                  </button>
                </form>

                <div className="public-auth-support">
                  <p className="public-auth-support__title">조회 기준</p>
                  <div className="public-auth-support__list">
                    <p className="public-auth-support__item">주문번호는 영문 대소문자를 구분하지 않고 조회합니다.</p>
                    <p className="public-auth-support__item">이름과 이메일은 주문 시 입력한 정보와 동일해야 합니다.</p>
                  </div>
                </div>

                {lookupResult ? (
                  <section className="public-guest-order-result" aria-label="비회원 주문 조회 결과">
                    <div className="public-guest-order-result__header">
                      <div>
                        <p className="public-guest-order-result__eyebrow">조회 결과</p>
                        <h2 className="public-guest-order-result__title">{lookupResult.order_number}</h2>
                      </div>
                      <span className="public-guest-order-result__status">
                        {formatGuestOrderStatus(lookupResult.status)}
                      </span>
                    </div>

                    <div className="public-guest-order-result__grid">
                      <div className="public-guest-order-result__item">
                        <span className="public-guest-order-result__label">주문자</span>
                        <strong className="public-guest-order-result__value">{lookupResult.guest_name}</strong>
                      </div>
                      <div className="public-guest-order-result__item">
                        <span className="public-guest-order-result__label">이메일</span>
                        <strong className="public-guest-order-result__value">{lookupResult.guest_email}</strong>
                      </div>
                      <div className="public-guest-order-result__item">
                        <span className="public-guest-order-result__label">주문일</span>
                        <strong className="public-guest-order-result__value">
                          {formatDate(lookupResult.created_at)}
                        </strong>
                      </div>
                      <div className="public-guest-order-result__item">
                        <span className="public-guest-order-result__label">결제 금액</span>
                        <strong className="public-guest-order-result__value">
                          {formatPrice(lookupResult.total_amount)}
                        </strong>
                      </div>
                    </div>

                    <div className="public-guest-order-result__summary">
                      <span className="public-guest-order-result__label">주문 요약</span>
                      <p className="public-guest-order-result__summary-text">
                        {lookupResult.order_summary || "등록된 주문 요약 정보가 없습니다."}
                      </p>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicGuestOrderLookupPage;
