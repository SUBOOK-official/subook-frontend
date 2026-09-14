import { useState } from "react";
import { Link } from "react-router-dom";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import { ArrowRightIcon } from "../components/icons";
import { trackB2bInquiryLead, trackEvent } from "../lib/analytics";
import { SUPPORT_EMAIL } from "../lib/supportChannels";
import { usePageMeta } from "../lib/usePageMeta";
import booksImage from "../assets/b2b/books.jpg";
import groupOrderImage from "../assets/b2b/group-order.jpg";
import regularSupplyImage from "../assets/b2b/regular-supply.jpg";
import "./PublicB2bPage.css";

const BENEFITS = [
  [booksImage, "다양한 입시 교재를 한 번에", "수북에서 판매 중인 신간·모의고사·N제 등 다양한 입시 교재를 한 번에 주문할 수 있습니다."],
  [groupOrderImage, "학원 단체 주문", "수업용·특강용·학생 배부용 등 필요한 교재와 수량에 맞춰 주문할 수 있습니다."],
  [regularSupplyImage, "정기 교재 공급", "매주·매월 또는 학원 커리큘럼 일정에 맞춰 매번 새로 주문하지 않아도 정기적으로 교재를 받아볼 수 있습니다."],
];

export default function PublicB2bPage() {
  const [submitState, setSubmitState] = useState({ status: "idle", message: "", referenceId: "" });
  usePageMeta({
    title: "학원·교육기관 B2B 교재 공급",
    description: "수북의 신간·인기 교재를 필요한 수량과 일정에 맞춰 공급받으세요.",
    canonicalPath: "/b2b",
  });

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const quantity = Number(formData.get("quantity"));

    setSubmitState({ status: "submitting", message: "", referenceId: "" });

    try {
      const response = await fetch("/api/b2b-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization: formData.get("organization"),
          contactName: formData.get("contactName"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          quantity,
          interests: formData.get("interests"),
          requestDetails: formData.get("requestDetails"),
          privacyConsent: formData.get("privacyConsent") === "on",
          website: formData.get("website"),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "문의 접수에 실패했습니다.");
      }

      trackB2bInquiryLead({ expectedBookCount: quantity, uiSurface: "b2b_form" });
      form.reset();
      setSubmitState({
        status: "success",
        message: "문의가 접수되었습니다. 담당자가 2영업일 이내에 연락드리겠습니다.",
        referenceId: result.referenceId || "",
      });
    } catch (error) {
      trackEvent("b2b_inquiry_submit_error", { result: "fail", errorReason: "delivery_failed" });
      setSubmitState({
        status: "error",
        message: error?.message || "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        referenceId: "",
      });
    }
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
              <img className="public-b2b__benefit-image" src={image} alt="" width={160} height={160} loading="lazy" decoding="async" />
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
              <input name="contactName" autoComplete="name" required maxLength={50} placeholder="담당자 성함을 입력해 주세요" />
            </label>
            <label className="public-b2b__field">연락처 <span>*</span>
              <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={13} pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" placeholder="010-0000-0000" />
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
              <textarea name="requestDetails" rows={4} maxLength={2000} placeholder="희망 일정이나 정기 공급 등 요청사항을 남겨 주세요" />
            </label>
            <label className="public-b2b__honeypot" aria-hidden="true">
              웹사이트
              <input name="website" autoComplete="off" tabIndex={-1} />
            </label>
            <label className="public-b2b__consent public-b2b__field--wide">
              <input name="privacyConsent" required type="checkbox" />
              <span>
                <strong>개인정보 수집·이용에 동의합니다. (필수)</strong>
                <small>
                  B2B 상담 및 견적 회신을 위해 기관명, 담당자명, 연락처, 예상 수량과 선택 입력 항목을 수집하며
                  접수일로부터 3년간 보관합니다. 동의를 거부할 수 있으나 문의 접수가 제한됩니다. {" "}
                  <Link to="/privacy">개인정보처리방침 보기</Link>
                </small>
              </span>
            </label>
            <div className="public-b2b__field--wide public-b2b__submit-area">
              <button className="public-b2b__submit" disabled={submitState.status === "submitting"} type="submit">
                {submitState.status === "submitting" ? "문의 접수 중…" : "교재 공급 문의하기"}
                {submitState.status !== "submitting" ? <ArrowRightIcon size={18} /> : null}
              </button>
              <p>접수 내용은 수북 팀 운영 채널로 전달되며 담당자가 2영업일 이내에 연락드립니다.</p>
              {submitState.status !== "idle" && submitState.status !== "submitting" ? (
                <div
                  className={`public-b2b__message public-b2b__message--${submitState.status}`}
                  role={submitState.status === "error" ? "alert" : "status"}
                >
                  <strong>{submitState.status === "success" ? "접수 완료" : "접수하지 못했습니다"}</strong>
                  <span>{submitState.message}</span>
                  {submitState.referenceId ? <span>접수번호 {submitState.referenceId}</span> : null}
                  {submitState.status === "error" ? (
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("B2B 교재 공급 문의")}`}>
                      이메일로 문의하기 · {SUPPORT_EMAIL}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </form>
        </section>
      </div>
      <PublicFooter />
    </PublicPageFrame>
  );
}
