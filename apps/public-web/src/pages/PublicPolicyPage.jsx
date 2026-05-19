import { Link, useLocation } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicPolicyPage.css";

const POLICY_TITLES = {
  privacy: "개인정보처리방침",
  terms: "이용약관",
  refund: "환불 정책",
};

// 정책별 시행일 — 각 문서 개정 시 여기만 갱신.
const POLICY_EFFECTIVE_DATES = {
  privacy: "2026년 4월 12일",
  terms: "2026년 4월 12일",
  refund: "2026년 4월 12일",
};

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

const refundSections = [
  {
    title: "주문 취소 (배송 전)",
    paragraphs: [
      "구매자는 '입금대기 / 결제완료 / 상품 준비 중' 상태에서는 마이페이지에서 직접 주문을 취소할 수 있습니다.",
      "미입금 상태로 24시간이 지나면 주문은 자동으로 취소되고, 사용된 쿠폰이 있다면 자동 복구됩니다.",
      "이미 입금이 완료된 주문은 1~2영업일 이내에 입금하신 계좌로 환불됩니다.",
    ],
  },
  {
    title: "청약철회 (배송 후 단순 변심)",
    paragraphs: [
      "전자상거래법에 따라, 상품을 받으신 날로부터 7일 이내에 단순 변심에 의한 청약철회를 요청할 수 있습니다.",
      "다만 위탁판매 특성상 수령 후 필기·표시·훼손 흔적이 생긴 경우 청약철회가 제한될 수 있습니다 (소비자분쟁해결기준 준용).",
      "단순 변심 환불 시 왕복 배송비(편도 3,500원 × 2)는 구매자가 부담합니다. 환불 금액에서 차감됩니다.",
      "환불 신청은 1:1 문의(subook2025@gmail.com) 또는 카카오톡 채널로 주문번호와 함께 접수해 주세요.",
    ],
  },
  {
    title: "상품 하자 / 표기와 다른 상품",
    paragraphs: [
      "상품 등급(S/A+) 표기와 실제 상태가 명백히 다르거나, 파본·구성품 누락 등 하자가 있는 경우 100% 환불 또는 동일 상품 교환을 보장합니다.",
      "이 경우 왕복 배송비는 수북에서 부담합니다.",
      "수령일로부터 7일 이내에 문제 상태를 확인할 수 있는 사진과 함께 1:1 문의로 접수해 주세요.",
    ],
  },
  {
    title: "환불 처리 시기와 방법",
    paragraphs: [
      "환불 사유 확인 후 영업일 기준 3일 이내에 입금하신 계좌로 환불됩니다.",
      "은행 영업일·공휴일·금융사 사정에 따라 1~2일 지연될 수 있습니다.",
      "환불 진행 상황은 카카오톡 알림 또는 마이페이지의 주문 상세에서 확인할 수 있습니다.",
    ],
  },
];

function PublicPolicyPage({ type = "privacy" }) {
  const location = useLocation();
  let pageType = type;
  if (location.pathname === "/terms") pageType = "terms";
  else if (location.pathname === "/refund") pageType = "refund";
  else if (location.pathname === "/privacy") pageType = "privacy";

  usePageMeta({
    title: POLICY_TITLES[pageType] ?? "정책",
    description: `수북(SUBOOK) ${POLICY_TITLES[pageType] ?? "정책"} 안내.`,
  });

  const isTerms = pageType === "terms";
  const isRefund = pageType === "refund";
  const sections = isTerms ? termsSections : isRefund ? refundSections : privacySections;
  const title = isTerms ? "이용약관" : isRefund ? "환불 및 청약철회 정책" : "개인정보처리방침";

  return (
    <PublicPageFrame>
      <div className="public-policy-page">
        <PublicSiteHeader />
        <main className="public-policy-route">
          <ContentContainer className="public-policy-shell">
            <nav aria-label="정책 문서" className="public-policy-tabs">
              <Link className={`public-policy-tab ${pageType === "privacy" ? "is-active" : ""}`} to="/privacy">
                개인정보처리방침
              </Link>
              <Link className={`public-policy-tab ${isTerms ? "is-active" : ""}`} to="/terms">
                이용약관
              </Link>
              <Link className={`public-policy-tab ${isRefund ? "is-active" : ""}`} to="/refund">
                환불정책
              </Link>
            </nav>

            <article className="public-policy-document">
              <p className="public-policy-eyebrow">SUBOOK Policy</p>
              <h1>{title}</h1>
              <p className="public-policy-updated">시행일: {POLICY_EFFECTIVE_DATES[pageType] ?? POLICY_EFFECTIVE_DATES.privacy}</p>

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
