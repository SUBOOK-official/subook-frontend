import { useState } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import brandLogo from "../assets/brand/logo-horizontal.png";
import { usePageMeta } from "../lib/usePageMeta";
import fullCover from "../assets/catalog/full.png";
import miniCover from "../assets/catalog/mini.png";
import qr from "../assets/catalog/kakao-qr.png";
import "./PublicCatalogPage.css";

const CHAT = "http://pf.kakao.com/_xdhxdyn/chat";
const EMAIL = "subook2025@gmail.com";
const detailModules = import.meta.glob("../assets/product-detail/*/*.webp", { eager: true, query: "?url", import: "default" });
const products = [
  { key: "j1-full", name: "FULL", count: "7회분", price: 59000, cover: fullCover, id: 2370, points: ["모의고사 점수가 회차마다 크게 흔들리는 학생", "수능 전 80분 실전 운영을 훈련하고 싶은 학생", "고퀄리티의 선택과목 포함 전체 45문항 국어 실모를 원하는 학생"] },
  { key: "j1-mini", name: "MINI", count: "30회분", price: 69000, cover: miniCover, id: 2371, points: ["FULL 한 회를 매일 풀기에는 부담스러운 학생", "매일 아침 국어 루틴을 통해 감각을 유지하고 싶은 학생", "독서·문학 공통 12문항 선지들에 익숙해지고 싶은 학생"] },
];
// 2026-09-20 제공된 카탈로그 기준 수량과 가격. 실시간 판매 재고와 분리해 표시한다.
const inventory = [
  ["시대인재", "2027 시대인재 엑셀러레이터 Accelerator 주간지 국어", 11, 8000],
  ["시대인재", "2026 시대인재 엑셀러레이터 Accelerator 주간지 국어", 11, 5000],
  ["시대인재", "2025 시대인재 엑셀러레이터 Accelerator 주간지 국어", 65, 3600],
  ["시대인재", "2025 시대인재 엑셀러레이터 Accelerator 주간지 수학", 16, 5000],
  ["시대인재", "2025 시대인재 엑셀러레이터 Accelerator 주간지 미적분", 24, 5500],
  ["시대인재", "2025 시대인재 엑셀러레이터 전국 주간지 수학", 36, 5500],
  ["시대인재", "2026 시대인재 큐레이션 CURATION 모의고사 국어", 51, 3500],
  ["시대인재", "2025 시대인재 파이널 브릿지 전국 모의고사 화학1", 17, 5000],
  ["시대인재", "2025 시대인재 브릿지 전국 모의고사 영어", 16, 5500],
  ["시대인재", "2026 시대인재 파이널 브릿지 모의고사 수학", 11, 6000],
  ["시대인재", "2026 시대인재 브릿지 N전용 모의고사 수학", 10, 6000],
  ["시대인재", "2025 시대인재 숏컷 SHORTCUT 파이널 미적분", 16, 6500],
  ["시대인재", "2025 시대인재 Limit X 수학 박종민T", 20, 3500],
  ["시대인재", "2026 시대인재 단하나의대답 E 국어 강은양T", 10, 4000],
  ["시대인재", "2026 시대인재 단하나의대답 K 국어 강은양T", 10, 4000],
  ["시대인재", "2025 시대인재 마지막 수능, 그리고 마무리 커튼콜 CURTAIN CALL 화학1 김강민T", 18, 5000],
  ["시대인재", "2025 시대인재 이신혁 모의평가 시즌2 알파 지구과학1", 16, 5000],
  ["시대인재", "2025 시대인재 아폴로N Apollo.N 지구과학1 이신혁T", 14, 4000],
  ["시대인재", "2025 시대인재 저스트인피니티 Just Infinity 수학 이동준T", 21, 7000],
  ["시대인재", "2025 시대인재 신지호 시너지 모의고사 화학1", 13, 5000],
  ["시대인재", "2025 시대인재 매치포인트 MATCHPOINT 국어 황용일T", 11, 8000],
  ["시대인재", "2025 시대인재 화잘쥬스 HWAJAI JUICE 화학1 강준호T", 17, 5000],
  ["이감/한수", "2026 이감 간쓸개 파이널2 국어", 11, 5950],
  ["이감/한수", "2026 이감 간쓸개 SEASON1 국어", 11, 6000],
  ["이감/한수", "2026 한수 데일리 일간지 국어", 82, 3000],
  ["강남대성", "2025 강남대성 크럭스 CRUX 공통국어 독서와 문학", 12, 6000],
  ["강남대성", "2025 강남대성 SOLID CONSTANT 모의고사 수학", 10, 3000],
  ["강남대성", "2025 강남대성 드리프트 셀렉션 DRIFT SELECTION 생명과학1", 10, 4000],
  ["메가스터디", "2026 메가스터디 영대주간 지구과학1 엄영대T", 35, 4000],
];
const money = (amount) => `${amount.toLocaleString("ko-KR")}원`;

function ContactLinks() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailHovered, setEmailHovered] = useState(false);
  const showEmail = emailOpen || emailHovered;
  return <div className="catalog-contact-links">
    <a className="catalog-button" href={CHAT} target="_blank" rel="noreferrer">카카오채널로 문의하기 <span>↗</span></a>
    <div className="catalog-email-wrap" onMouseEnter={() => setEmailHovered(true)} onMouseLeave={() => setEmailHovered(false)} onKeyDown={(event) => { if (event.key === "Escape") { setEmailOpen(false); setEmailHovered(false); } }}>
      <button className="catalog-email" type="button" aria-expanded={showEmail} onClick={() => setEmailOpen((open) => !open)}>이메일로 문의하기 ↗</button>
      {showEmail && <div className="catalog-email-popover"><a href={`mailto:${EMAIL}`}>{EMAIL}</a></div>}
    </div>
  </div>;
}

export default function PublicCatalogPage() {
  const [brand, setBrand] = useState("전체");
  const [query, setQuery] = useState("");
  usePageMeta({ title: "B2B CONTENT CATALOG", description: "학원·학교·교육기관을 위한 수북 B2B 콘텐츠 카탈로그. 전일학원 J1 원트와 한정 보유 입시 콘텐츠, 단체 구매 및 정기 공급 안내.", canonicalPath: "/catalog" });
  const filtered = inventory.filter(([group, title]) => (brand === "전체" || group === brand) && title.toLowerCase().includes(query.trim().toLowerCase()));
  return <><div className="catalog">
    <a className="catalog-skip" href="#catalog-main">본문으로 이동</a>
    <header className="catalog-nav"><Link to="/" className="catalog-logo"><img src={brandLogo} alt="수북 SUBOOK" /></Link><a className="catalog-nav-contact" href="#pricing">공급 문의 ↗</a></header>
    <main id="catalog-main">
      <section className="catalog-cover">
        <div className="catalog-hero-content">
          <p className="catalog-kicker">SUBOOK B2B CONTENT CATALOG</p>
          <h1>대치동 입시 콘텐츠부터<br />시즌별 교재·모의고사까지</h1>
          <p className="catalog-hero-description">필요한 콘텐츠를 수북에서 공급합니다.</p>
          <p className="catalog-audience">학원 · 독학재수학원 · 학교 · 교육기관 전용</p>
          <div className="catalog-hero-actions"><a className="catalog-button catalog-button--outline" href="#series">콘텐츠 살펴보기</a><a className="catalog-button" href="#pricing">단체 공급 문의하기 ↗</a></div>
        </div>
        <div className="catalog-cover-meta"><span>카탈로그 내 상품 기준: 2026/9/20</span></div>
      </section>
      <section id="overview" className="catalog-section">
        <div className="catalog-kicker">02 / OVERVIEW</div><h2>필요한 콘텐츠,<br />맞는 공급 방식으로.</h2>
        <div className="catalog-overview-grid">
          <article><span className="catalog-status">현재 정식 공급 가능</span><h3>함께 만든 콘텐츠를<br />필요한 수량만큼.</h3><p>제작 학원과 협업하여 필요한 수량에 맞춰 공급 가능한 콘텐츠</p><h4>전일학원</h4><ul><li>J1 원트 FULL 모의고사 7회분 — 국어</li><li>J1 원트 MINI 모의고사 30회분 — 국어</li></ul><a href="#series">시리즈 살펴보기 ↗</a></article>
          <article><span className="catalog-status catalog-status--muted">출판·공급 예정</span><h3>다음 시즌을 위한<br />새로운 선택.</h3><p>현재 콘텐츠 확보 및 출판 준비 중인 상품</p><ul><li>전일학원 J1 원트 FULL 모의고사 7회분 — 수학</li><li>TOMATO 약술논술 — 인문</li><li>TOMATO 약술논술 — 자연</li></ul><p className="catalog-note">도입을 희망하는 학원은 사전 문의해주시면 출판 및 공급 일정 확정 시 우선 안내드립니다.</p></article>
          <article><span className="catalog-status catalog-status--muted">수북 한정 보유 콘텐츠</span><h3>대치동의 콘텐츠를<br />더 가까이.</h3><p>수북이 현재 확보하여 보유하고 있는 대치동 현강 교재 및 다양한 입시 콘텐츠</p><ul><li>시대인재 엑셀러레이터</li><li>시대인재 수능기출문제집 등</li></ul><p className="catalog-note">한정 콘텐츠는 확보 수량이 상품마다 다르기 때문에 동일 상품을 대량으로 공급하기 어려울 수 있습니다.</p></article>
        </div>
      </section>
      <section id="series" className="catalog-section catalog-series">
        <div className="catalog-kicker">03 / JEONIL × SUBOOK</div><div className="catalog-section-heading"><h2>대치동 전일학원<br />J1 원트 <em>SERIES</em></h2><p>실전의 완성부터 매일의 루틴까지.<br />학생에게 필요한 국어 훈련을 선택하세요.</p></div>
        <div className="catalog-products">{products.map((product) => <article key={product.key} className="catalog-product">
          <div className="catalog-product-art"><img src={product.cover} alt={`J1 원트 ${product.name} 모의고사 국어`} loading="lazy" /></div>
          <div className="catalog-product-body"><span className="catalog-status">국어 · 현재 B2B 공급 가능</span><h3>J1 원트 {product.name}<br /><span>모의고사 {product.count}</span></h3><p className="catalog-price">정가 <strong>{money(product.price)}</strong></p><p className="catalog-note">할인가 적용 시 10% 할인 · 자체 콘텐츠 45권 이상 구매 시</p><ul>{product.points.map((point) => <li key={point}>{point}</li>)}</ul>
          <details className="catalog-detail"><summary>상세페이지 펼쳐보기 <span>＋</span></summary><div className="catalog-detail-screen" tabIndex={0} role="region" aria-label={`${product.name} 상품 상세 이미지 스크롤`}>{Object.entries(detailModules).filter(([path]) => path.includes(`/${product.key}/`)).sort(([a], [b]) => a.localeCompare(b)).map(([path, src], index) => <img src={src} key={path} alt={`J1 원트 ${product.name} 상세 안내 ${index + 1}`} loading="lazy" />)}</div><Link className="catalog-product-link" to={`/store/${product.id}`} target="_blank" rel="noreferrer">상품 상세페이지 새 창으로 보기 ↗</Link></details></div>
        </article>)}</div>
      </section>
      <section id="limited" className="catalog-section">
        <div className="catalog-kicker">04 / LIMITED CONTENTS</div><div className="catalog-section-heading"><h2>다양한 대치동·입시<br />콘텐츠를 보유하고 있습니다.</h2><p>수북 한정 보유 콘텐츠<br /><strong>할인가 적용 시 7% 할인</strong></p></div>
        <div className="catalog-inventory-tools"><div className="catalog-filters" aria-label="브랜드 필터">{["전체", "시대인재", "이감/한수", "강남대성", "메가스터디"].map((item) => <button key={item} type="button" aria-pressed={brand === item} onClick={() => setBrand(item)}>{item}</button>)}</div><label className="catalog-search"><span className="catalog-sr-only">교재명 검색</span><input type="search" placeholder="교재명으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="catalog-inventory-caption"><span aria-live="polite">{filtered.length}개 콘텐츠</span><span>가격·보유 수량 기준 2026.09.20</span></div>
        <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th scope="col">브랜드</th><th scope="col">콘텐츠</th><th scope="col">보유 수량</th><th scope="col">정상가 / 권</th></tr></thead><tbody>{filtered.map(([group, title, quantity, price]) => <tr key={title}><td>{group}</td><th scope="row">{title}</th><td>{quantity}개</td><td>{money(price)}</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="catalog-empty">검색 결과가 없습니다. 다른 교재명이나 브랜드를 선택해주세요.</p>}</div>
        <div className="catalog-disclaimers"><p>* 한정 보유 콘텐츠는 상품별 재고가 상이하며, 현강용·시즌성 교재의 경우 동일 상품의 대량 주문이 어려울 수 있습니다.</p><p>* 한정 보유 콘텐츠는 수북이 확보한 실물 재고를 기반으로 제공되며, 해당 학원·브랜드와의 공식 공급 계약 상품을 의미하지 않습니다.</p></div>
      </section>
      <section id="pricing" className="catalog-section catalog-pricing">
        <div className="catalog-kicker">05 / GROUP ORDER</div><h2>함께 구매할수록,<br />더 좋은 조건으로.</h2>
        <div className="catalog-discount-grid"><article><p>수북 자체 콘텐츠 <span>전일 × 수북 등</span></p><h3>45권 이상 <strong>10%</strong></h3><p>전체 금액 할인 + 무료배송</p></article><article><p>수북 한정 보유 콘텐츠 <span>시대인재, 강남대성 등</span></p><h3>30권 이상 <strong>7%</strong></h3><p>전체 금액 할인 + 무료배송</p></article></div><ul className="catalog-pricing-notes"><li>동일 유형 내 교차 선택이 가능합니다.</li><li>할인가 기준 수량을 채우지 않으셔도 정상가로 단체 구매 가능합니다.</li></ul>
        <div className="catalog-order"><div><h3>단체 구매 / 정기 공급 문의 양식</h3><p>아래 내용을 카카오채널 또는 이메일로 보내주세요.</p><ol className="catalog-form-guide"><li><strong>담당자 이름</strong></li><li><strong>소속 기관</strong><span>학원 / 학교 이름 등</span></li><li><strong>구매하고 싶으신 교재명 & 수량</strong><span>예: J1 원트 FULL 모의고사 45개, 2025 시대인재 엑셀러레이터 Accelerator 주간지 수학 15개</span></li><li><strong>예상 사용 시기</strong><span>예: 10월 중순, 6월 모의고사 전, 12/19</span><span>자체 콘텐츠의 경우 재고가 없으면 배송까지 최대 7일 정도 소요됩니다.</span></li></ol><ContactLinks /></div><a className="catalog-qr" href={CHAT} target="_blank" rel="noreferrer"><img src={qr} alt="수북 카카오채널 상담으로 연결되는 QR 코드" width="180" height="180" loading="lazy" /><strong>단체 구매 / 정기 공급 문의</strong><span>스캔하여 카카오채널로 연결</span></a></div>
      </section>
      <section id="inquiry" className="catalog-section catalog-inquiry"><div className="catalog-kicker">06 / WHAT’S NEXT?</div><h2>찾으시는<br />콘텐츠가 없나요?</h2><div className="catalog-inquiry-intro"><p>수북은 현재 보유 콘텐츠뿐 아니라<br /><strong>다양한 학원·강사·콘텐츠 제작자와 B2B 공급 및 출판 협의를 진행하고 있습니다.</strong></p><p>카탈로그에 없는 콘텐츠라도 필요한 <strong>과목·유형·수량·사용 시기</strong>를 알려주시면 현재 공급 가능한 콘텐츠와 협의 중인 콘텐츠를 확인해 별도로 안내드립니다.</p></div>
        <h3>공급 및 출판 문의 양식</h3><div className="catalog-request-grid">{[["01", "과목", "국어 / 수학 / 영어 / 탐구"], ["02", "콘텐츠 유형", "N제 / 모의고사 / 주간지 / 논술 등"], ["03", "예상 수량", "예: 20부 / 50부 / 100부"], ["04", "사용 시기", "예: 여름특강 / 6월 모의평가 직전 / 9월 모의평가 이후 / 수능 직전"]].map(([number, title, desc]) => <div key={number}><span>{number}</span><h4>{title}</h4><p>{desc}</p></div>)}</div>
        <div className="catalog-closing"><h3>시즌별 · 단체 · 정기 공급 모두 가능합니다</h3><p>필요할 때 한 번만 주문하는 <strong>시즌별 공급</strong>부터<br />학원 일정에 맞춘 <strong>정기적인 교재 공급</strong>까지 상담 가능합니다.</p><p className="catalog-closing-message">필요한 콘텐츠를 말씀해주세요.<br />수북이 공급 가능한 방법을 찾아드립니다.</p><ContactLinks /></div>
      </section>
    </main>
  </div><PublicFooter /></>;
}
