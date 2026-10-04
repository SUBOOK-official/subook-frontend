import { Link } from "react-router-dom";
import { PICKUP_FEE_POLICY } from "@shared-domain/settlement";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon } from "../components/icons";
import { PICKUP_INTRO_NOTES } from "../lib/pickupGuideContent";
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

const steps = [
  { title: "판매 신청과 수거", image: processImg1, description: "예상 교재 수, 수거 정보와 정산 계좌를 입력해 주세요. 교재를 포장해 문 앞에 두시면 수북이 수거해요." },
  { title: "검수와 상품 등록", image: processImg2, description: "수북이 한 권씩 상태를 확인하고 사진·교재 정보·판매가를 등록해요. 직접 상품을 올릴 필요 없어요." },
  { title: "판매와 배송", image: processImg3, description: "검수를 통과한 교재는 스토어에서 판매돼요. 판매 현황은 마이페이지에서 확인할 수 있어요." },
  { title: "판매 대금 정산", image: processImg4, description: "구매확정된 판매분에서 수수료와 상품화 비용을 차감한 금액을 매월 1일 등록 계좌로 보내드려요." },
];

const rejectedExamples = [
  { image: bookImg1, label: "필기·형광펜 자국", description: "풀이와 메모가 남아 있는 교재" },
  { image: bookImg2, label: "찢어짐·얼룩", description: "표지나 내지가 손상된 교재" },
  { image: bookImg3, label: "답지 분실", description: "필요한 구성품이 없는 교재" },
];

const faqs = [
  { id: "registration", question: "교재마다 사진과 정보를 직접 등록해야 하나요?", answer: "아니요. 예상 교재 수와 수거 주소·연락처, 정산 계좌만 입력해 주세요. 상세 교재 정보와 사진은 수북이 검수 과정에서 등록합니다." },
  { id: "packing", question: "교재는 어떻게 포장하면 되나요?", answer: "튼튼하고 크기가 맞는 박스에 담아 교재가 흔들리지 않게 포장해 주세요. 한 박스당 20kg 이하여야 하며, 포장을 마친 뒤 신청서에서 박스별 크기와 무게에 맞는 규격을 선택해 주세요. 수거 주소의 문 앞에 두시면 됩니다." },
  { id: "cost", question: "수거할 때 미리 내야 하는 비용이 있나요?", answer: "수거는 무료예요. 다만 박스 1개당 상품화 비용 5,000원이 발생하며, 미리 결제하지 않고 판매 후 정산 과정에서 차감합니다. 여러 박스라면 박스 수 × 5,000원이 적용돼요." },
  { id: "price", question: "판매 가격은 누가 정하나요? 모두 판매되나요?", answer: "판매가는 수북 자체 가격 산출 알고리즘에 따라 결정됩니다. 검수를 통과하면 스토어에 등록되지만, 교재의 수요 등에 따라 판매되지 않을 수도 있어요. 진행 상황은 마이페이지에서 확인할 수 있습니다." },
  { id: "rejected", question: "검수 기준에 맞지 않는 교재는 어떻게 되나요?", answer: "검수 기준에 미달하는 교재는 판매할 수 없으며 자체 폐기됩니다. 반송되지 않으니, 보내기 전에 필기·손상·답지 유무와 교재 연도를 꼭 확인해 주세요." },
];

function ApplyLink({ source, light = false }) {
  return (
    <Link className={`sell-guide__apply${light ? " sell-guide__apply--light" : ""}`} onClick={() => trackPickupCtaClick(source)} to="/pickup/new">
      판매 신청하기 <ArrowRightIcon size={20} />
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
    <div className="sell-guide-page">
      <PublicSiteHeader />
      <main className="sell-guide">
        <section className="sell-guide__hero sell-guide__container" aria-labelledby="sell-guide-title">
          <div className="sell-guide__hero-copy">
            <p className="sell-guide__eyebrow">교재 판매 안내</p>
            <h1 id="sell-guide-title">책장에 남은 교재,<br />다음 공부로<br className="sell-guide__desktop-break" /> 이어지게.</h1>
            <p className="sell-guide__lead">안 쓰는 새 교재를 보내주세요.<br />수거부터 검수, 판매, 정산까지 수북이 함께합니다.</p>
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
            <div className="sell-guide__section-heading"><div><p className="sell-guide__eyebrow">판매 가능한 교재</p><h2 id="sell-conditions-title">이런 교재를<br />기다리고 있어요.</h2></div><p>아직 펼치지 않은 새 교재가<br />다음 수험생에게 이어질 수 있도록.</p></div>
            <div>
              <ul className="sell-guide__checklist">
                <li><CheckIcon size={22} /><div><h3>필기 없는 새 교재</h3><p>풀이·메모·형광펜 자국이 없고, 표지와 내지가 양호한 미사용 교재</p></div></li>
                <li><CheckIcon size={22} /><div><h3>현재 수능 기준 최근 2개년</h3><p>2026·2027 교재를 접수할 수 있어요.</p></div></li>
                <li><CheckIcon size={22} /><div><h3>수능·고교 내신 대비 교재</h3><p>과목·출판사에 관계없이 개념서, 기출, 모의고사, N제 등을 보내주세요.</p></div></li>
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
            {faqs.map((faq) => <details key={faq.id} onToggle={(event) => { if (event.currentTarget.open) trackFaqOpen({ faqId: `sell-guide-${faq.id}`, question: faq.question, category: "판매", source: "sell_guide" }); }}><summary>{faq.question}<ChevronRightIcon size={20} /></summary><p>{faq.answer}</p></details>)}
          </div>
        </section>

        <section className="sell-guide__closing" aria-labelledby="sell-closing-title"><div className="sell-guide__container"><div><p>책장 속 새 교재의 다음 시작</p><h2 id="sell-closing-title">이제, 수북에 맡겨보세요.</h2></div><ApplyLink source="sell_guide_bottom" light /></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}
