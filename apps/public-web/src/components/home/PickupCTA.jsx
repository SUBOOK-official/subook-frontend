import ContentContainer from "../ContentContainer";

function PickupCTA({ onRequestPickup }) {
  return (
    <section aria-label="교재 판매 안내" className="public-home-sell-banner">
      <ContentContainer className="public-home-sell-banner__shell">
        <button className="public-home-sell-banner__button" onClick={onRequestPickup} type="button">
          <span className="public-home-sell-banner__text">
            <span className="public-home-sell-banner__label">교재 팔고 싶으신가요?</span>
            <span className="public-home-sell-banner__sub">포장만 하면 수거부터 정산까지 전부 대행</span>
          </span>
          <span aria-hidden="true" className="public-home-sell-banner__arrow">→</span>
        </button>
      </ContentContainer>
    </section>
  );
}

export default PickupCTA;
