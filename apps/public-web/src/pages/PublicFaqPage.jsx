import { useState } from "react";
import { Link } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import "./PublicFaqPage.css";

const FAQ_ITEMS = [
  {
    id: "what-books",
    category: "판매",
    question: "어떤 책들을 판매할 수 있나요? 학원 교재나 비매품도 판매 가능한가요?",
    answer: [
      "수북에서는 수능 및 고교 내신 대비용 교재를 중심으로 판매를 진행하고 있습니다.",
      "개념서, 기출문제집, 모의고사, N제, 주간지 등 대부분의 수험 대비 교재가 판매 대상에 포함됩니다.",
      "비매품 교재의 경우, 개인 배포용 교재는 취급하지 않으며 대형 학원의 자체 제작 교재에 한해 판매를 받고 있습니다.",
      "아울러 수북은 적법하게 유통된 실물 중고 교재만을 취급하며, 무단 복제본·스캔본·PDF 등은 어떠한 경우에도 취급하지 않습니다.",
    ],
  },
  {
    id: "grading",
    category: "등급",
    question: "S / A+ 등급은 어떤 기준으로 나뉘나요?",
    answer: [
      "수북은 교재의 필기 여부와 사용감을 기준으로 다음과 같이 등급을 구분합니다.",
      { type: "subheading", text: "S급 (미사용 새책)" },
      "랩핑이 제거되지 않았거나, 사용감이 전혀 느껴지지 않는 완전한 새 책 상태의 교재입니다.",
      { type: "subheading", text: "A+급 (극미한 사용감)" },
      "필기율 10% 미만의 교재로, 연필 필기 또는 이름만 적힌 수준에 해당합니다. 전반적인 상태는 새책에 가깝고, 학습에 전혀 지장이 없는 상태입니다.",
      { type: "note", text: "필기율은 필기가 있는 페이지 수 ÷ 전체 페이지 수를 기준으로 산정되며, 기준을 초과한 교재는 판매 대상에서 제외될 수 있습니다." },
    ],
  },
  {
    id: "shipping-pickup",
    category: "수거",
    question: "책은 어떤 방식으로 보내면 되나요? 수거·배송비는 제가 부담하나요?",
    answer: [
      "교재는 박스에 포장하신 뒤, 판매 신청 시 입력하신 주소의 집 앞에 두시면 수북이 직접 수거합니다.",
      "공동현관 비밀번호가 필요한 경우, 원활한 수거를 위해 신청 시 함께 입력해 주세요.",
      "검수를 통과한 교재가 20권 이상일 경우 수북에서 무료 수거를 진행하며, 20권 미만일 경우에는 첫 정산 금액에서 배송비를 차감하여 처리됩니다.",
    ],
  },
  {
    id: "is-selling",
    category: "판매",
    question: "제가 보낸 책이 실제로 판매되고 있나요?",
    answer: [
      "검수를 통과한 교재는 모두 수북 플랫폼에 등록되어 판매가 진행됩니다.",
      "다만 교재의 연도, 상태, 수요 등에 따라 노출 순서나 판매 속도에는 차이가 있을 수 있습니다.",
      "판매 정산내역은 마이페이지에서 진행 현황을 볼 수 있습니다. 교재가 판매되고 구매 확정이 완료되면, 입력해 주신 계좌로 정산이 진행됩니다.",
    ],
  },
  {
    id: "listing-time",
    category: "검수",
    question: "제가 맡긴 책은 언제 판매 페이지에 올라가나요?",
    answer: [
      "보내주신 교재는 수거 후, 수북의 검수팀이 한 권씩 꼼꼼하게 검수를 진행한 뒤 상품으로 등록됩니다.",
      "검수 및 등록까지는 운영일 기준 약 5~10일 정도 소요되며, 검수가 완료되면 상품 페이지에서 직접 확인하실 수 있습니다. (검수 물량에 따라 소요 기간은 달라질 수 있습니다.)",
    ],
  },
  {
    id: "settlement-timing",
    category: "정산",
    question: "판매 대금(정산)은 언제 입금되나요?",
    answer: [
      "교재가 판매된 후 배송이 완료되면, 약 7일 뒤 구매 확정 처리가 이루어집니다.",
      "구매 확정 시점에 수수료를 제외한 금액이 회원가입 시 등록한 계좌로 자동 정산됩니다.",
    ],
  },
  {
    id: "legal",
    category: "안내",
    question: "수북의 판매 방식은 법적으로 문제가 없는 구조인가요?",
    answer: [
      "수북은 중고 교재를 매입한 뒤 검수 후 재판매하는 구조로 운영되며, 관련 법령을 준수하는 범위 내에서 서비스를 제공하고 있습니다.",
      "저작권법 제20조에 따라 정상적으로 구매된 교재는 최초 판매 이후 배포권이 소진되므로, 이를 재판매하는 행위는 저작권 침해에 해당하지 않습니다.",
      "또한 수북은 저작권법 제136조에 따른 불법 복제물 유통을 방지하기 위해 복제본·스캔본·개인 배포용 자료 등을 판매 단계에서 철저히 차단하는 검수 시스템을 운영하고 있습니다.",
    ],
  },
  {
    id: "delivery",
    category: "배송",
    question: "배송은 얼마나 걸리나요?",
    answer: [
      "주문 확인 후 영업일 기준 1~2일 이내에 발송됩니다.",
      "수북은 검수가 완료된 재고만 판매하기 때문에, 빠르고 안정적인 배송이 가능합니다.",
    ],
  },
  {
    id: "return",
    category: "반품",
    question: "단순 변심으로 반품하고 싶은 경우에는 어떻게 하나요?",
    answer: [
      "상품 수령 후 7일 이내에 반품 신청이 가능하며, 단순 변심에 의한 반품의 경우 왕복 배송비는 고객님 부담입니다.",
      "상품 수령 후 7일이 경과하면 구매 확정 처리되어 반품이 어려울 수 있습니다.",
    ],
  },
];

function renderAnswerLine(line, index) {
  if (typeof line === "string") {
    return (
      <p className="public-faq-item__paragraph" key={`p-${index}`}>
        {line}
      </p>
    );
  }

  if (line.type === "subheading") {
    return (
      <h4 className="public-faq-item__subheading" key={`h-${index}`}>
        {line.text}
      </h4>
    );
  }

  if (line.type === "note") {
    return (
      <p className="public-faq-item__note" key={`n-${index}`}>
        ※ {line.text}
      </p>
    );
  }

  return null;
}

function PublicFaqPage() {
  const [openIds, setOpenIds] = useState(() => new Set([FAQ_ITEMS[0]?.id]));

  const handleToggle = (id) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setOpenIds(new Set(FAQ_ITEMS.map((item) => item.id)));
  };

  const handleCollapseAll = () => {
    setOpenIds(new Set());
  };

  const pageContent = (
    <div className="public-faq-page">
      <PublicSiteHeader />

      <ContentContainer as="section" className="public-faq-route" aria-label="페이지 경로">
        <div className="public-faq-route__crumbs">
          <Link className="public-faq-route__crumb-link" to="/">
            홈
          </Link>
          <span aria-hidden="true">›</span>
          <span className="is-muted">자주 묻는 질문</span>
        </div>
      </ContentContainer>

      <ContentContainer as="section" className="public-faq-hero" aria-label="페이지 안내">
        <p className="public-faq-hero__eyebrow">FAQ</p>
        <h1 className="public-faq-hero__title">자주 묻는 질문</h1>
        <p className="public-faq-hero__subtitle">
          수북 이용 전후 가장 많이 받는 질문을 모았어요.
        </p>
      </ContentContainer>

      <ContentContainer as="section" className="public-faq-list" aria-label="자주 묻는 질문">
        <div className="public-faq-list__toolbar">
          <span className="public-faq-list__count">총 {FAQ_ITEMS.length}개의 질문</span>
          <div className="public-faq-list__actions">
            <button className="public-faq-list__action" onClick={handleExpandAll} type="button">
              모두 펼치기
            </button>
            <span className="public-faq-list__action-divider" aria-hidden="true">|</span>
            <button className="public-faq-list__action" onClick={handleCollapseAll} type="button">
              모두 접기
            </button>
          </div>
        </div>

        <ul className="public-faq-list__items" role="list">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openIds.has(item.id);
            return (
              <li className="public-faq-item" key={item.id}>
                <button
                  aria-controls={`faq-panel-${item.id}`}
                  aria-expanded={isOpen}
                  className={`public-faq-item__head ${isOpen ? "is-open" : ""}`}
                  id={`faq-trigger-${item.id}`}
                  onClick={() => handleToggle(item.id)}
                  type="button"
                >
                  <span className="public-faq-item__category">{item.category}</span>
                  <span className="public-faq-item__question">{item.question}</span>
                  <span aria-hidden="true" className={`public-faq-item__chevron ${isOpen ? "is-open" : ""}`}>
                    ▾
                  </span>
                </button>
                {isOpen ? (
                  <div
                    aria-labelledby={`faq-trigger-${item.id}`}
                    className="public-faq-item__panel"
                    id={`faq-panel-${item.id}`}
                    role="region"
                  >
                    {item.answer.map((line, index) => renderAnswerLine(line, index))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </ContentContainer>

      <PublicFooter />
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicFaqPage;
