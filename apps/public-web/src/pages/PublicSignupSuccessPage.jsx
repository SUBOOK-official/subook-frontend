import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import checkAnimation from "../assets/check.json";
import PublicFooter from "../components/PublicFooter";
import PublicMemberHeader from "../components/PublicMemberHeader";
import PublicPageFrame from "../components/PublicPageFrame";

function PublicSignupSuccessPage() {
  const navigate = useNavigate();
  const animationRef = useRef(null);

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

    loadAnimation();

    return () => {
      isMounted = false;
      animation?.destroy();
    };
  }, []);

  const handleGoBack = () => {
    navigate("/", { replace: true });
  };

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
                <p className="public-signup-success__description">환영합니다. 이제 모든 서비스를 이용하실 수 있습니다.</p>
              </div>

              <div aria-hidden="true" className="public-signup-success__animation">
                <div className="public-signup-success__animation-surface" ref={animationRef} />
              </div>

              <div className="public-auth-panel__body">
                <button className="public-auth-button public-auth-button--secondary" onClick={handleGoBack} type="button">
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
