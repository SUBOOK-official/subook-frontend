import { useRef } from "react";
import ContentContainer from "../ContentContainer";
import { ArrowRightIcon } from "../icons";
import { trackViewPromotion } from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";

const PICKUP_CTA_PROMOTION = {
  promotionId: "home_bottom_cta",
  promotionName: "홈 하단 수거 CTA",
  creativeSlot: "home_bottom",
};

function PickupCTA({ onRequestPickup }) {
  const sectionRef = useRef(null);
  // GA4 view_promotion — 홈 최하단이라 마운트가 아니라 실제 노출 시점 1회로 잡는다.
  // (pickup_cta_click home_bottom_cta의 분모)
  useInViewOnce(sectionRef, () => trackViewPromotion(PICKUP_CTA_PROMOTION));

  return (
    <section aria-label="교재 판매 안내" className="public-home-sell-banner" ref={sectionRef}>
      <ContentContainer className="public-home-sell-banner__shell">
        <button className="public-home-sell-banner__button" onClick={onRequestPickup} type="button">
          <span className="public-home-sell-banner__text">
            <span className="public-home-sell-banner__label">풀지않은 교재를 쉽게 판매하고 싶으신가요?</span>
            <span className="public-home-sell-banner__sub">
              <span className="public-home-sell-banner__sub-detail">
                교재를 집 밖에 꺼내놓기만 하면 수거 검수 판매 정산까지 전부 대행합니다
              </span>
            </span>
          </span>
          <ArrowRightIcon size={18} className="public-home-sell-banner__arrow" />
        </button>
      </ContentContainer>
    </section>
  );
}

export default PickupCTA;
