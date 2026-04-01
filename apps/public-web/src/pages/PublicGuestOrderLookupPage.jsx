import { useState } from "react";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";

function PublicGuestOrderLookupPage() {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-guest-order-page">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-guest-order-heading" className="public-auth-main">
            <div className="public-auth-panel public-auth-panel--guest-order">
              <h1 className="public-auth-panel__title" id="public-guest-order-heading">
                비회원 주문 조회
              </h1>

              <div className="public-auth-panel__body">
                <form className="public-auth-form" onSubmit={handleSubmit}>
                  <label className="public-auth-field">
                    <span className="public-visually-hidden">이름</span>
                    <input
                      autoComplete="name"
                      className="public-auth-input"
                      onChange={(event) => setGuestName(event.target.value)}
                      placeholder="이름을 입력해주세요."
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
                      placeholder="이메일을 입력해주세요."
                      type="email"
                      value={guestEmail}
                    />
                  </label>

                  <label className="public-auth-field">
                    <span className="public-visually-hidden">주문번호</span>
                    <input
                      className="public-auth-input"
                      onChange={(event) => setOrderNumber(event.target.value)}
                      placeholder="주문번호를 입력해주세요."
                      type="text"
                      value={orderNumber}
                    />
                  </label>

                  <button className="public-auth-button public-auth-button--primary" type="submit">
                    주문 조회
                  </button>
                </form>
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
