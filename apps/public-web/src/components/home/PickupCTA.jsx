import ContentContainer from "../ContentContainer";

const PICKUP_BENEFITS = ["집 앞 수거", "전문 검수", "자동 정산"];

function PickupCTA({ onRequestPickup }) {
  return (
    <section aria-labelledby="public-home-pickup-cta-title" className="public-home-pickup-cta">
      <ContentContainer className="public-home-pickup-cta__shell">
        <div className="public-home-pickup-cta__card">
          <div className="public-home-pickup-cta__content">
            <h2 className="public-home-pickup-cta__title" id="public-home-pickup-cta-title">
              <span>집에 잠자는 교재,</span>
              <span>수북이 대신 팔아드려요 💰</span>
            </h2>

            <p className="public-home-pickup-cta__description">
              <span>포장만 하면 수거부터 판매까지 전부 대행!</span>
              <span>수수료만 내면 나머지는 수북이 알아서.</span>
            </p>

            <ul className="public-home-pickup-cta__benefits">
              {PICKUP_BENEFITS.map((benefit) => (
                <li className="public-home-pickup-cta__benefit" key={benefit}>
                  <span aria-hidden="true" className="public-home-pickup-cta__check">
                    ✓
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <button className="public-home-pickup-cta__button" onClick={onRequestPickup} type="button">
              지금 수거 요청하기 →
            </button>
          </div>
        </div>
      </ContentContainer>
    </section>
  );
}

export default PickupCTA;
