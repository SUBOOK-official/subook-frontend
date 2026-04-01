import { useState } from "react";
import { Link } from "react-router-dom";
import PublicAuthHeader from "../components/PublicAuthHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";

function PublicForgotPasswordPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const canSubmit = name.trim() && email.trim();

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setHasSubmitted(true);
  };

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-auth-page--recovery">
        <div className="public-auth-page__body">
          <PublicAuthHeader />

          <section aria-labelledby="public-forgot-password-heading" className="public-auth-main">
            <div className="public-auth-panel public-auth-panel--recovery">
              {hasSubmitted ? (
                <>
                  <div className="public-auth-panel__header">
                    <span className="public-auth-status-chip">메일 전송 완료</span>
                    <h1 className="public-auth-panel__title" id="public-forgot-password-heading">
                      재설정 링크를 보냈어요
                    </h1>
                    <p className="public-auth-panel__description">
                      <strong className="public-auth-panel__highlight">{email}</strong>
                      로 비밀번호 재설정 링크를 발송했어요. 메일함과 스팸함을 함께 확인해 주세요.
                    </p>
                  </div>

                  <div className="public-auth-panel__body">
                    <div className="public-auth-support">
                      <p className="public-auth-support__title">도움이 필요하신가요?</p>
                      <div className="public-auth-support__list">
                        <p className="public-auth-support__item">메일이 보이지 않으면 스팸함과 프로모션함을 먼저 확인해 주세요.</p>
                        <p className="public-auth-support__item">가입할 때 사용한 이름과 이메일이 일치해야 정상적으로 찾을 수 있어요.</p>
                        <p className="public-auth-support__item">링크가 만료되면 이 화면에서 다시 요청하실 수 있어요.</p>
                      </div>
                    </div>

                    <div className="public-auth-actions">
                      <button className="public-auth-button public-auth-button--secondary" onClick={() => setHasSubmitted(false)} type="button">
                        다시 입력하기
                      </button>
                      <Link className="public-auth-button public-auth-button--primary" to="/login">
                        로그인으로 돌아가기
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="public-auth-panel__header">
                    <h1 className="public-auth-panel__title" id="public-forgot-password-heading">
                      비밀번호 찾기
                    </h1>
                    <p className="public-auth-panel__description">
                      가입할 때 사용한 이름과 이메일을 입력해 주세요. 확인 후 비밀번호를 다시 설정할 수 있는 링크를 보내드릴게요.
                    </p>
                  </div>

                  <div className="public-auth-panel__body">
                    <form className="public-auth-form public-auth-form--recovery" onSubmit={handleSubmit}>
                      <label className="public-signup-field">
                        <span className="public-signup-field__label">이름</span>
                        <span className="public-auth-field">
                          <input
                            autoComplete="name"
                            className="public-auth-input"
                            onChange={(event) => setName(event.target.value)}
                            placeholder="이름을 입력해주세요."
                            type="text"
                            value={name}
                          />
                        </span>
                      </label>

                      <label className="public-signup-field">
                        <span className="public-signup-field__label">이메일</span>
                        <span className="public-auth-field">
                          <input
                            autoComplete="email"
                            className="public-auth-input"
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="이메일을 입력해주세요."
                            type="email"
                            value={email}
                          />
                        </span>
                      </label>

                      <button
                        className={`public-auth-button ${canSubmit ? "public-auth-button--primary" : "public-auth-button--disabled"}`}
                        disabled={!canSubmit}
                        type="submit"
                      >
                        재설정 링크 보내기
                      </button>
                    </form>

                    <div className="public-auth-support">
                      <p className="public-auth-support__title">안내</p>
                      <div className="public-auth-support__list">
                        <p className="public-auth-support__item">이메일이 기억나지 않으면 가입하실 때 사용한 메일 주소를 다시 확인해 주세요.</p>
                        <p className="public-auth-support__item">비회원 주문 조회용 정보만 있는 경우에는 비밀번호 찾기를 사용할 수 없어요.</p>
                        <p className="public-auth-support__item">링크는 보안을 위해 일정 시간이 지나면 만료됩니다.</p>
                      </div>
                    </div>

                    <div className="public-auth-links">
                      <Link className="public-auth-text-link" to="/login">
                        로그인으로 돌아가기
                      </Link>
                      <span aria-hidden="true" className="public-auth-links__separator" />
                      <Link className="public-auth-text-link" to="/signup">
                        회원가입하기
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicForgotPasswordPage;
