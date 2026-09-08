import { Link } from "react-router-dom";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPickupGuide from "../components/PublicPickupGuide";
import { PICKUP_INTRO_NOTES } from "../lib/pickupGuideContent";
import { trackPickupCtaClick } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicPickupRequestPage.css";
import "./PublicSellGuidePage.css";

function ApplyLink({ source }) {
  return (
    <Link
      className="pickup-btn pickup-btn--primary sell-guide__apply"
      onClick={() => trackPickupCtaClick(source)}
      to="/pickup/new"
    >
      판매 신청하기
    </Link>
  );
}

export default function PublicSellGuidePage() {
  usePageMeta({
    title: "교재 판매 안내",
    description: "안 쓰는 수능 교재의 판매 가능 조건, 수수료와 박스 비용, 수거부터 정산까지의 절차를 확인하고 위탁판매를 신청하세요.",
    canonicalPath: "/sell",
  });

  return (
    <div className="pickup-page">
      <PublicSiteHeader />
      <main className="pickup-route">
        <div className="pickup-shell">
          <div className="pickup-card">
            <header className="pickup-card__top">
              <p className="pickup-card__eyebrow">교재 판매 안내</p>
              <h1 className="pickup-card__page-title">안 쓰는 교재, 수북에서 판매하세요</h1>
              <p className="sell-guide__description">
                판매 조건과 비용을 먼저 확인해 주세요. 수북이 수거부터 검수·판매·정산까지 진행합니다.
              </p>
              <ApplyLink source="sell_guide_top" />
              <p className="sell-guide__description">판매 신청은 로그인 후 진행할 수 있어요.</p>
            </header>
            <div className="pickup-card__content pickup-step">
              <PublicPickupGuide />
              <section className="pickup-guide-section" aria-labelledby="sell-guide-notes">
                <h2 className="pickup-guide-section__title" id="sell-guide-notes">신청 전 꼭 확인해 주세요</h2>
                <ul className="sell-guide__notes">
                  {PICKUP_INTRO_NOTES.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </section>
              <div className="sell-guide__next">
                <ApplyLink source="sell_guide_bottom" />
                <Link className="sell-guide__faq" to="/faq">궁금한 점은 자주 묻는 질문에서 확인하세요</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
