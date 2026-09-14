import { useState } from "react";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import { ArrowRightIcon } from "../components/icons";
import { usePageMeta } from "../lib/usePageMeta";
import booksImage from "../assets/b2b/books.png";
import groupOrderImage from "../assets/b2b/group-order.png";
import regularSupplyImage from "../assets/b2b/regular-supply.png";
import "./PublicB2bPage.css";

const BENEFITS = [
  [booksImage, "다양한 입시 교재를 한 번에", "수북에서 판매 중인 신간·모의고사·N제 등 다양한 입시 교재를 한 번에 주문할 수 있습니다."],
  [groupOrderImage, "학원 단체 주문", "수업용·특강용·학생 배부용 등 필요한 교재와 수량에 맞춰 주문할 수 있습니다."],
  [regularSupplyImage, "정기 교재 공급", "매주·매월 또는 학원 커리큘럼 일정에 맞춰 매번 새로 주문하지 않아도 정기적으로 교재를 받아볼 수 있습니다."],
];

export default function PublicB2bPage() {
  const [message, setMessage] = useState("");
  usePageMeta({ title: "학원·교육기관 B2B 교재 공급", description: "수북의 신간·인기 교재를 필요한 수량만큼 대량 주문하세요." });

  function handleSubmit(event) {
    event.preventDefault();
    // 접수 채널 확정 전에는 전송·접수 완료로 안내하지 않는다.
    setMessage("온라인 문의 접수 준비 중입니다. 아직 문의가 전송되지 않았습니다.");
  }

  return (
    <PublicPageFrame>
      <PublicSiteHeader />
      <div className="public-b2b">
        <header className="public-b2b__intro">
          <h1>학원·교육기관 전용 B2B 교재 공급</h1>
          <p className="public-b2b__lead">수북의 신간·인기 교재를 필요한 수량만큼 대량 주문하세요.</p>
          <p className="public-b2b__audience">학원 · 독서실 · 재수학원 · 공부방 · 교육기관</p>
        </header>

        <section className="public-b2b__benefits" aria-label="교재 공급 서비스 안내">
          {BENEFITS.map(([image, title, description]) => (
            <div className="public-b2b__benefit" key={title}>
              <img className="public-b2b__benefit-image" src={image} alt="" width={160} height={160} loading="lazy" />
              <div><h2>{title}</h2><p>{description}</p></div>
            </div>
          ))}
        </section>

        <section className="public-b2b__inquiry" aria-labelledby="b2b-inquiry-title">
          <div className="public-b2b__form-heading">
            <h2 id="b2b-inquiry-title">B2B 교재 공급 문의</h2>
            <span>* 필수 입력</span>
          </div>
          <form onSubmit={handleSubmit} className="public-b2b__form">
            <label className="public-b2b__field">학원/기관명 <span>*</span>
              <input name="organization" autoComplete="organization" required maxLength={100} placeholder="학원 또는 기관명을 입력해 주세요" />
            </label>
            <label className="public-b2b__field">담당자명 <span>*</span>
              <input name="name" autoComplete="name" required maxLength={50} placeholder="담당자 성함을 입력해 주세요" />
            </label>
            <label className="public-b2b__field">연락처 <span>*</span>
              <input name="phone" type="tel" autoComplete="tel" required maxLength={20} pattern="[0-9+ \-]{9,20}" placeholder="010-0000-0000" />
            </label>
            <label className="public-b2b__field">이메일 <span>(선택)</span>
              <input name="email" type="email" autoComplete="email" maxLength={254} placeholder="example@subook.kr" />
            </label>
            <label className="public-b2b__field public-b2b__field--wide">예상 주문 수량 <span>*</span>
              <div className="public-b2b__quantity"><input name="quantity" type="number" inputMode="numeric" required min={1} max={1000000} step={1} placeholder="예상 주문 권수를 입력해 주세요" /><span>권</span></div>
            </label>
            <label className="public-b2b__field public-b2b__field--wide">관심 과목 또는 관심 교재 <span>(선택)</span>
              <input name="interests" maxLength={500} placeholder="예: 수학, 실전 모의고사, N제" />
            </label>
            <label className="public-b2b__field public-b2b__field--wide">요청사항 <span>(선택)</span>
              <textarea name="request" rows={4} maxLength={2000} placeholder="희망 일정이나 정기 공급 등 요청사항을 남겨 주세요" />
            </label>
            <div className="public-b2b__field--wide public-b2b__submit-area">
              <button className="public-b2b__submit" type="submit">교재 공급 문의하기 <ArrowRightIcon size={18} /></button>
              <p>문의 내용을 확인한 후 담당자가 2–3일 내 순차적으로 연락드립니다.</p>
              {message && <p className="public-b2b__message" role="status">{message}</p>}
            </div>
          </form>
        </section>
      </div>
      <PublicFooter />
    </PublicPageFrame>
  );
}
