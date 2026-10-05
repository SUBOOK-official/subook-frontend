import { Link } from "react-router-dom";
import { PICKUP_FEE_POLICY } from "@shared-domain/settlement";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon } from "../components/icons";
import { PICKUP_INTRO_NOTES } from "../lib/pickupGuideContent";
import {
  SELL_GUIDE_META, SELL_GUIDE_HEADING, SELL_GUIDE_LEAD, SELL_GUIDE_STEPS,
  SELL_GUIDE_CONDITIONS, SELL_GUIDE_REJECTED, SELL_GUIDE_FAQS,
} from "../lib/sellGuideContent";
import { trackFaqOpen, trackPickupCtaClick } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import heroImage from "../assets/sell-guide-packing.webp";
import processImg1 from "../assets/process1.jpg";
import processImg2 from "../assets/process2.jpg";
import processImg3 from "../assets/process3.jpg";
import processImg4 from "../assets/process4.jpg";
import bookImg1 from "../assets/book1.jpg";
import bookImg2 from "../assets/book2.jpg";
import bookImg3 from "../assets/book3.jpg";
import "./PublicSellGuidePage.css";

const processImages = [processImg1, processImg2, processImg3, processImg4];
const steps = SELL_GUIDE_STEPS.map((step, index) => ({ ...step, image: processImages[index] }));
const rejectedImages = [bookImg1, bookImg2, bookImg3];
const rejectedExamples = SELL_GUIDE_REJECTED.map((example, index) => ({ ...example, image: rejectedImages[index] }));

function ApplyLink({ source, light = false }) {
  return (
    <Link className={`sell-guide__apply${light ? " sell-guide__apply--light" : ""}`} onClick={() => trackPickupCtaClick(source)} to="/pickup/new">
      판매 신청하기 <ArrowRightIcon size={20} />
    </Link>
  );
}

export default function PublicSellGuidePage() {
  usePageMeta(SELL_GUIDE_META);

  return (
    <div className="sell-guide-page">
      <PublicSiteHeader />
      <main className="sell-guide">
        <section className="sell-guide__hero sell-guide__container" aria-labelledby="sell-guide-title">
          <div className="sell-guide__hero-copy">
            <p className="sell-guide__eyebrow">교재 판매 안내</p>
            <h1 id="sell-guide-title">{SELL_GUIDE_HEADING[0]}<br />{SELL_GUIDE_HEADING[1]}<br className="sell-guide__desktop-break" /> {SELL_GUIDE_HEADING[2]}</h1>
            <p className="sell-guide__lead">{SELL_GUIDE_LEAD[0]}<br />{SELL_GUIDE_LEAD[1]}</p>
            <div className="sell-guide__hero-actions">
              <ApplyLink source="sell_guide_top" />
              <a className="sell-guide__text-link" href="#sell-conditions">판매 조건 먼저 보기 <ChevronRightIcon size={16} /></a>
            </div>
            <p className="sell-guide__login-note">판매 신청은 로그인 후 진행할 수 있어요.</p>
          </div>
          <figure className="sell-guide__hero-image">
            <img src={heroImage} alt="깨끗한 교재를 가지런히 담아 둔 수거용 박스" width="1024" height="1024" fetchPriority="high" />
          </figure>
        </section>

        <nav className="sell-guide__nav" aria-label="판매 안내 바로가기">
          <div className="sell-guide__container">
            <a href="#sell-process">판매 과정</a>
            <a href="#sell-conditions">판매 가능한 교재</a>
            <a href="#sell-fees">수수료·정산</a>
            <a href="#sell-faq">자주 묻는 질문</a>
          </div>
        </nav>

        <section className="sell-guide__section sell-guide__container" id="sell-process" aria-labelledby="sell-process-title">
          <div className="sell-guide__section-heading">
            <div><p className="sell-guide__eyebrow">판매 과정</p><h2 id="sell-process-title">보내는 일은 간단하게.<br />그다음은 수북이 할게요.</h2></div>
            <p>사진 촬영과 교재 정보 등록까지.<br />혼자 판매할 때의 번거로움을 덜어드려요.</p>
          </div>
          <ol className="sell-guide__steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="sell-guide__step-image"><img src={step.image} alt="" loading="lazy" width="600" height="400" /><span aria-hidden="true">0{index + 1}</span></div>
                <h3>{step.title}</h3><p>{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="sell-guide__conditions" id="sell-conditions" aria-labelledby="sell-conditions-title">
          <div className="sell-guide__container sell-guide__conditions-layout">
            <div className="sell-guide__section-heading"><div><p className="sell-guide__eyebrow">판매 가능한 교재</p><h2 id="sell-conditions-title">이런 교재를<br /> 기다리고 있어요.</h2></div><p>아직 펼치지 않은 새 교재가<br />다음 수험생에게 이어질 수 있도록.</p></div>
            <div>
              <ul className="sell-guide__checklist">
                {SELL_GUIDE_CONDITIONS.map((condition) => <li key={condition.title}><CheckIcon size={22} /><div><h3>{condition.title}</h3><p>{condition.description}</p></div></li>)}
              </ul>
              <div className="sell-guide__rejected-heading"><h3>이런 교재는 판매할 수 없어요</h3><span>보내기 전에 확인해 주세요</span></div>
              <div className="sell-guide__rejected">
                {rejectedExamples.map((example) => <figure key={example.label}><img src={example.image} alt={example.description} loading="lazy" width="400" height="300" /><figcaption>{example.label}</figcaption></figure>)}
              </div>
              <p className="sell-guide__small-note">판매 가능 여부는 검수 과정에서 최종 판단합니다. 기준 미달 교재는 자체 폐기되며 반송되지 않습니다.</p>
            </div>
          </div>
        </section>

        <section className="sell-guide__section sell-guide__container" id="sell-fees" aria-labelledby="sell-fees-title">
          <div className="sell-guide__section-heading"><div><p className="sell-guide__eyebrow">수수료·정산</p><h2 id="sell-fees-title">맡기기 전에,<br />비용부터 투명하게.</h2></div><p>수거는 무료로 진행하고,<br />수수료와 상품화 비용은 정산 시 차감해요.</p></div>
          <div className="sell-guide__fee-layout">
            <div className="sell-guide__fee-table">
              <h3>판매 수수료</h3>
              <dl>
                <div><dt>판매가 {(PICKUP_FEE_POLICY.priceThreshold / 10000).toLocaleString()}만원 이상</dt><dd>{PICKUP_FEE_POLICY.standardPercent}<span>%</span></dd></div>
                <div><dt>판매가 {(PICKUP_FEE_POLICY.priceThreshold / 10000).toLocaleString()}만원 미만</dt><dd>{PICKUP_FEE_POLICY.lowPricePercent}<span>%</span></dd></div>
              </dl>
            </div>
            <div className="sell-guide__settlement">
              <p>정산일</p><h3>매월 <span>1</span>일</h3>
              <p>구매확정된 판매분을<br />등록하신 계좌로 정산해드려요.</p>
              <dl><div><dt>방문 수거</dt><dd>무료</dd></div><div><dt>상품화 비용</dt><dd>박스당 5,000원</dd></div></dl>
            </div>
          </div>
          <aside className="sell-guide__notes" aria-labelledby="sell-guide-notes"><h3 id="sell-guide-notes">신청 전 꼭 확인해 주세요</h3><ul>{PICKUP_INTRO_NOTES.map((note) => <li key={note}>{note}</li>)}</ul></aside>
        </section>

        <section className="sell-guide__faq-section sell-guide__container" id="sell-faq" aria-labelledby="sell-faq-title">
          <div className="sell-guide__section-heading"><div><p className="sell-guide__eyebrow">자주 묻는 질문</p><h2 id="sell-faq-title">궁금한 점이 있나요?</h2></div><Link className="sell-guide__text-link" to="/faq">전체 질문 보기 <ArrowRightIcon size={18} /></Link></div>
          <div className="sell-guide__questions">
            {SELL_GUIDE_FAQS.map((faq) => <details key={faq.id} onToggle={(event) => { if (event.currentTarget.open) trackFaqOpen({ faqId: `sell-guide-${faq.id}`, question: faq.question, category: "판매", source: "sell_guide" }); }}><summary>{faq.question}<ChevronRightIcon size={20} /></summary><p>{faq.answer}</p></details>)}
          </div>
        </section>

        <section className="sell-guide__closing" aria-labelledby="sell-closing-title"><div className="sell-guide__container"><div><p>책장 속 새 교재의 다음 시작</p><h2 id="sell-closing-title">이제, 수북에 맡겨보세요.</h2></div><ApplyLink source="sell_guide_bottom" light /></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}
