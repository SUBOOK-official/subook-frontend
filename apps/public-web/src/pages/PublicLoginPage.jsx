import { useState } from "react";
import { Link } from "react-router-dom";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";

function PublicLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-login-heading" className="public-auth-main">
            <div className="public-auth-panel">
              <h1 className="public-auth-panel__title" id="public-login-heading">
                로그인
              </h1>

              <div className="public-auth-panel__body">
                <form className="public-auth-form" onSubmit={handleSubmit}>
                  <label className="public-auth-field">
                    <span className="public-visually-hidden">이메일</span>
                    <input
                      autoComplete="email"
                      className="public-auth-input"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="이메일을 입력해주세요."
                      type="email"
                      value={email}
                    />
                  </label>

                  <label className="public-auth-field">
                    <span className="public-visually-hidden">비밀번호</span>
                    <input
                      autoComplete="current-password"
                      className="public-auth-input"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="비밀번호를 입력해주세요."
                      type="password"
                      value={password}
                    />
                  </label>

                  <button className="public-auth-button public-auth-button--primary" type="submit">
                    로그인
                  </button>

                  <Link className="public-auth-button public-auth-button--secondary" to="/guest-order-lookup">
                    비회원 주문 조회
                  </Link>
                </form>

                <div className="public-auth-links">
                  <Link className="public-auth-text-link" to="/forgot-password">
                    비밀번호 찾기
                  </Link>
                  <span aria-hidden="true" className="public-auth-links__separator" />
                  <Link className="public-auth-text-link" to="/signup">
                    회원가입하기
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicLoginPage;
