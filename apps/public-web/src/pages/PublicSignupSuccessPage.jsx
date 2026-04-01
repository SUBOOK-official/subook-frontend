import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import checkAnimation from "../assets/check.json";
import PublicFooter from "../components/PublicFooter";
import PublicMemberHeader from "../components/PublicMemberHeader";
import PublicPageFrame from "../components/PublicPageFrame";
import { usePublicAuth } from "../contexts/PublicAuthContext";

function PublicSignupSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = usePublicAuth();
  const animationRef = useRef(null);

  const successState = location.state ?? {};

  const description = useMemo(() => {
    if (successState.requiresEmailConfirmation && successState.email) {
      return `${successState.email}로 가입 확인 메일을 보냈습니다. 메일 인증을 완료한 뒤 로그인하시면 서비스를 바로 이용하실 수 있습니다.`;
    }

    if (isAuthenticated) {
      return "이제 로그인된 상태로 SUBOOK의 서비스를 바로 이용하실 수 있습니다.";
    }

    return "환영합니다. 이제 SUBOOK에서 필요한 교재를 편하게 찾아보실 수 있습니다.";
  }, [isAuthenticated, successState.email, successState.requiresEmailConfirmation]);

  useEffect(() => {
    if (!animationRef.current) {
      return undefined;
    }

    let animation;
    let isMounted = true;

    const loadAnimation = async () => {
      const { default: lottie } = await import("lottie-web");

      if (!isMounted || !animationRef.current) {
        return;
      }

      animation = lottie.loadAnimation({
        animationData: checkAnimation,
        autoplay: true,
        container: animationRef.current,
        loop: true,
        renderer: "svg",
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
        },
      });
    };

    void loadAnimation();

    return () => {
      isMounted = false;
      animation?.destroy();
    };
  }, []);

  return (
    <PublicPageFrame>
      <div className="public-auth-page public-signup-success-page">
        <div className="public-auth-page__body">
          <PublicMemberHeader />

          <section aria-labelledby="public-signup-success-heading" className="public-auth-main public-auth-main--success">
            <div className="public-auth-panel public-auth-panel--success">
              <div className="public-signup-success__copy">
                <h1 className="public-auth-panel__title" id="public-signup-success-heading">
                  회원가입을 축하합니다!
                </h1>
                <p className="public-signup-success__description">{description}</p>
              </div>

              <div aria-hidden="true" className="public-signup-success__animation">
                <div className="public-signup-success__animation-surface" ref={animationRef} />
              </div>

              {successState.requiresEmailConfirmation ? (
                <div className="public-auth-support">
                  <p className="public-auth-support__title">다음 단계</p>
                  <div className="public-auth-support__list">
                    <p className="public-auth-support__item">메일함에서 가입 확인 메일을 열어 인증을 완료해 주세요.</p>
                    <p className="public-auth-support__item">인증이 끝나면 로그인 페이지에서 바로 로그인하실 수 있습니다.</p>
                  </div>
                </div>
              ) : null}

              <div className="public-auth-panel__body">
                <button
                  className="public-auth-button public-auth-button--secondary"
                  onClick={() => navigate("/", { replace: true })}
                  type="button"
                >
                  메인 페이지로 이동하기
                </button>
              </div>
            </div>
          </section>
        </div>

        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicSignupSuccessPage;
