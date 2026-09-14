import { useRef } from "react";
import { Link } from "react-router-dom";
import ContentContainer from "../ContentContainer";
import { ArrowRightIcon } from "../icons";
import { trackSelectPromotion, trackViewPromotion } from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";

const B2B_CTA_PROMOTION = {
  promotionId: "home_b2b_inquiry",
  promotionName: "홈 하단 B2B 공급 문의",
  creativeSlot: "home_bottom_b2b",
};

function B2bCTA() {
  const sectionRef = useRef(null);
  useInViewOnce(sectionRef, () => trackViewPromotion(B2B_CTA_PROMOTION));

  return (
    <section aria-label="B2B 교재 공급 문의" className="public-home-sell-banner public-home-b2b-banner" ref={sectionRef}>
      <ContentContainer className="public-home-sell-banner__shell">
        <Link
          className="public-home-sell-banner__button"
          onClick={() => trackSelectPromotion(B2B_CTA_PROMOTION)}
          to="/b2b"
        >
          <span className="public-home-sell-banner__text">
            <span className="public-home-sell-banner__label">학원·교육기관 교재 B2B 공급 문의</span>
            <span className="public-home-sell-banner__sub">
              <span className="public-home-sell-banner__sub-detail">
                신간·모의고사·N제를 필요한 수량과 일정에 맞춰 공급해 드립니다.
              </span>
            </span>
          </span>
          <ArrowRightIcon size={18} className="public-home-sell-banner__arrow" />
        </Link>
      </ContentContainer>
    </section>
  );
}

export default B2bCTA;
