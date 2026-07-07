import ContentContainer from "../ContentContainer";
import { ArrowRightIcon } from "../icons";

function PickupCTA({ onRequestPickup }) {
  return (
    <section aria-label="교재 판매 안내" className="public-home-sell-banner">
      <ContentContainer className="public-home-sell-banner__shell">
        <button className="public-home-sell-banner__button" onClick={onRequestPickup} type="button">
          <span className="public-home-sell-banner__text">
            <span className="public-home-sell-banner__label">교재 팔고 싶으신가요?</span>
            <span className="public-home-sell-banner__sub">
              <strong>안 쓴 교재(미사용) 한정</strong>
              <span aria-hidden="true" className="public-home-sell-banner__sub-sep"> · </span>
              <span className="public-home-sell-banner__sub-detail">포장만 하면 수거~정산까지 무료 대행</span>
            </span>
          </span>
          <ArrowRightIcon size={18} className="public-home-sell-banner__arrow" />
        </button>
      </ContentContainer>
    </section>
  );
}

export default PickupCTA;
