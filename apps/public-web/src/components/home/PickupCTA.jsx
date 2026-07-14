import ContentContainer from "../ContentContainer";
import { ArrowRightIcon } from "../icons";

function PickupCTA({ onRequestPickup }) {
  return (
    <section aria-label="교재 판매 안내" className="public-home-sell-banner">
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
