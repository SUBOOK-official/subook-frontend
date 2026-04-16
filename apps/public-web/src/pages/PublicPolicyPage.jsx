import { Link, useLocation } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import "./PublicPolicyPage.css";

const termsSections = [
  {
    title: "서비스 이용",
    paragraphs: [
      "수북은 회원이 등록한 수능 교재의 위탁 판매를 중개하고, 구매자가 상품 상태와 가격을 확인한 뒤 거래할 수 있도록 지원합니다.",
      "회원은 가입 및 거래 과정에서 정확한 정보를 제공해야 하며, 타인의 정보를 도용하거나 허위 정보를 등록할 수 없습니다.",
    ],
  },
  {
    title: "상품 등록과 검수",
    paragraphs: [
      "수거된 교재는 입고 후 상태 검수를 거쳐 판매 가능 여부, 등급, 판매가가 정해집니다.",
      "필기, 훼손, 구성품 누락 등으로 판매가 어렵다고 판단되는 교재는 운영 정책에 따라 판매가 제한될 수 있습니다.",
    ],
  },
  {
    title: "정산과 책임",
    paragraphs: [
      "판매 정산은 구매확정 후 3영업일 기준으로 처리되며, 판매 수수료와 필요한 비용이 차감될 수 있습니다.",
      "천재지변, 통신 장애, 물류사 사정 등 수북의 합리적인 통제 범위를 벗어난 사유로 발생한 지연에는 별도 기준이 적용될 수 있습니다.",
    ],
  },
];

const privacySections = [
  {
    title: "수집하는 정보",
    paragraphs: [
      "수북은 회원 식별, 주문 처리, 수거와 배송, 판매 정산, 고객 응대를 위해 이름, 이메일, 연락처, 주소, 정산 계좌 정보를 처리합니다.",
      "정산 계좌번호는 서버에서 암호화해 저장하며, 화면에는 마지막 4자리 중심의 마스킹 정보만 표시합니다.",
    ],
  },
  {
    title: "이용과 보관",
    paragraphs: [
      "개인정보는 서비스 제공과 법령상 의무 이행에 필요한 범위에서만 사용합니다.",
      "회원탈퇴 신청 시 30일 유예 기간을 두고, 유예 기간이 지난 뒤 배송지와 정산 계좌 등 개인정보를 파기하거나 비식별 처리합니다.",
    ],
  },
  {
    title: "회원의 권리",
    paragraphs: [
      "회원은 마이페이지에서 기본 정보를 수정할 수 있으며, 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.",
      "법령에 따라 보관해야 하는 거래 기록은 정해진 기간 동안 분리 보관한 뒤 파기합니다.",
    ],
  },
];

function PublicPolicyPage({ type = "privacy" }) {
  const location = useLocation();
  const pageType = location.pathname === "/terms" ? "terms" : type;
  const isTerms = pageType === "terms";
  const sections = isTerms ? termsSections : privacySections;

  return (
    <PublicPageFrame>
      <div className="public-policy-page">
        <PublicSiteHeader />
        <main className="public-policy-route">
          <ContentContainer className="public-policy-shell">
            <nav aria-label="정책 문서" className="public-policy-tabs">
              <Link className={`public-policy-tab ${!isTerms ? "is-active" : ""}`} to="/privacy">
                개인정보처리방침
              </Link>
              <Link className={`public-policy-tab ${isTerms ? "is-active" : ""}`} to="/terms">
                이용약관
              </Link>
            </nav>

            <article className="public-policy-document">
              <p className="public-policy-eyebrow">SUBOOK Policy</p>
              <h1>{isTerms ? "이용약관" : "개인정보처리방침"}</h1>
              <p className="public-policy-updated">시행일: 2026년 4월 12일</p>

              <div className="public-policy-section-list">
                {sections.map((section) => (
                  <section className="public-policy-section" key={section.title}>
                    <h2>{section.title}</h2>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </section>
                ))}
              </div>
            </article>
          </ContentContainer>
        </main>
        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicPolicyPage;
