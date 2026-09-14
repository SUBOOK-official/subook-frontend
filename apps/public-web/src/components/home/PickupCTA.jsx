import { useRef } from "react";
import { Link } from "react-router-dom";
import ContentContainer from "../ContentContainer";
import { ArrowRightIcon } from "../icons";
import { trackViewPromotion } from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";

const PICKUP_CTA_PROMOTION = {
  promotionId: "home_bottom_cta",
  promotionName: "홈 하단 B2B 공급 문의",
  creativeSlot: "home_bottom",
};

function PickupCTA() {
  const sectionRef = useRef(null);
  // GA4 view_promotion — 홈 최하단이라 마운트가 아니라 실제 노출 시점 1회로 잡는다.
  // 홈 하단 B2B 배너의 실제 노출을 기록한다.
  useInViewOnce(sectionRef, () => trackViewPromotion(PICKUP_CTA_PROMOTION));

  return (
    <section aria-label="B2B 교재 공급 문의" className="public-home-sell-banner public-home-b2b-banner" ref={sectionRef}>
      <ContentContainer className="public-home-sell-banner__shell">
        <Link className="public-home-sell-banner__button" to="/b2b">
          <span className="public-home-sell-banner__text">
            <span className="public-home-sell-banner__label">학원·교육기관 교재 B2B 공급 문의</span>
            <span className="public-home-sell-banner__sub">
              <span className="public-home-sell-banner__sub-detail">
                수북의 신간·인기 교재를 필요한 수량만큼 대량 주문하세요.
              </span>
            </span>
          </span>
          <ArrowRightIcon size={18} className="public-home-sell-banner__arrow" />
        </Link>
      </ContentContainer>
    </section>
  );
}

export default PickupCTA;
