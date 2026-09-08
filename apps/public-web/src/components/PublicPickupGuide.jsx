import { BookIcon, BoxIcon, ClockIcon, CoinIcon, SlidersIcon, TruckIcon } from "./icons";
import processImg1 from "../assets/process1.jpg";
import processImg2 from "../assets/process2.jpg";
import processImg3 from "../assets/process3.jpg";
import processImg4 from "../assets/process4.jpg";
import bookImg1 from "../assets/book1.jpg";
import bookImg2 from "../assets/book2.jpg";
import bookImg3 from "../assets/book3.jpg";

// 공개 판매 안내와 신청서가 같은 조건·사진을 사용한다.
export default function PublicPickupGuide() {
  return (
    <>
      {/* 판매 과정 — 단계별 사진 + 설명 (사진은 추후 삽입) */}
      <section className="pickup-guide-section">
        <p className="pickup-guide-section__title">판매 과정</p>
        <div className="pickup-guide-steps">
          <div className="pickup-guide-step">
            <div className="pickup-guide-step__photo">
              <img src={processImg1} alt="" />
            </div>
            <div className="pickup-guide-step__text">
              <p className="pickup-guide-step__label">STEP 1. 판매 신청</p>
              <p className="pickup-guide-step__desc">
                예상 교재 수와 수거 주소·연락처, 정산 계좌를 입력해 주세요.
                자세한 교재 정보는 검수 과정에서 수북이 대신
                등록해드려요.
              </p>
            </div>
          </div>
          <div className="pickup-guide-step">
            <div className="pickup-guide-step__photo">
              <img src={processImg2} alt="" />
            </div>
            <div className="pickup-guide-step__text">
              <p className="pickup-guide-step__label">STEP 2. 상품 검수 및 준비</p>
              <p className="pickup-guide-step__desc">
                수거된 교재는 수북 검수 센터에서 상태별로 검수·등급 산정 후
                상품화 과정을 거쳐 스토어에 등록돼요.
              </p>
            </div>
          </div>
          <div className="pickup-guide-step">
            <div className="pickup-guide-step__photo">
              <img src={processImg3} alt="" />
            </div>
            <div className="pickup-guide-step__text">
              <p className="pickup-guide-step__label">STEP 3. 상품 판매</p>
              <p className="pickup-guide-step__desc">
                판매가 시작되면 스토어에 교재가 노출되고 구매자에게 판매돼요.
                판매 현황은 마이페이지에서 확인할 수 있어요.
              </p>
            </div>
          </div>
          <div className="pickup-guide-step">
            <div className="pickup-guide-step__photo">
              <img src={processImg4} alt="" />
            </div>
            <div className="pickup-guide-step__text">
              <p className="pickup-guide-step__label">STEP 4. 정산</p>
              <p className="pickup-guide-step__desc">
                판매·구매확정된 건은 수수료를 제외한 금액을 매월 1일 등록하신
                계좌로 정산해드려요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 수수료·정산 — Step 4 약관 동의 라벨·접힘 약관과 동일 수치. 변경 시 3곳 동시 수정 */}
      <section className="pickup-guide-section">
        <p className="pickup-guide-section__title">수수료·정산</p>
        <ul className="pickup-guide-list">
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <CoinIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>판매 수수료</strong>
              <span>
                판매가 1만원 초과 교재 40% · 1만원 이하 교재·모의고사 45%
              </span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <ClockIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>정산 일정</strong>
              <span>구매확정된 판매분을 매월 1일 등록 계좌로 일괄 지급</span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <BoxIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>상품화 비용</strong>
              <span>박스 1개당 5,000원 정산 시 차감</span>
            </div>
          </li>
        </ul>
      </section>

      {/* 판매 가능 상품 — 아이콘 + 설명 */}
      <section className="pickup-guide-section">
        <p className="pickup-guide-section__title">판매 가능 상품</p>
        <ul className="pickup-guide-list">
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <BookIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>수능·내신, 어떤 교재든 괜찮아요</strong>
              <span>과목·출판사 상관없이 접수할 수 있어요.</span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <SlidersIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>새 책만 판매 가능해요</strong>
              <span>반드시 교재에 필기가 있는지 확인해주세요.</span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <ClockIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>최근 2개년 이내 교재만 확인해주세요</strong>
              <span>현재 수능 기준 2개년(2026, 2027) 이내 교재만 접수 가능해요.</span>
            </div>
          </li>
        </ul>
      </section>

      {/* 판매 불가 상품 예시 — 사진 3장 (추후 삽입) */}
      <section className="pickup-guide-section">
        <p className="pickup-guide-section__title">판매 불가 상품 예시</p>
        <div className="pickup-guide-photos">
          <figure className="pickup-guide-photo">
            <div className="pickup-guide-photo__img">
              <img src={bookImg1} alt="" />
            </div>
            <figcaption className="pickup-guide-photo__caption">
              필기나 형광펜 자국이 있는 교재
            </figcaption>
          </figure>
          <figure className="pickup-guide-photo">
            <div className="pickup-guide-photo__img">
              <img src={bookImg2} alt="" />
            </div>
            <figcaption className="pickup-guide-photo__caption">
              찢어지거나 얼룩이 있는 교재
            </figcaption>
          </figure>
          <figure className="pickup-guide-photo">
            <div className="pickup-guide-photo__img">
              <img src={bookImg3} alt="" />
            </div>
            <figcaption className="pickup-guide-photo__caption">
              답지를 분실한 교재
            </figcaption>
          </figure>
        </div>
        <p className="pickup-guide-section__note">
          판매 가능 여부는 상품 검수 과정에서 최종적으로 판단됩니다.
        </p>
      </section>

      {/* 박스 포장 및 발송 규정 — 아이콘 + 설명 */}
      <section className="pickup-guide-section">
        <p className="pickup-guide-section__title">박스 포장 및 발송 규정</p>
        <ul className="pickup-guide-list">
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <BoxIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>딱 맞는 박스에 담아주세요</strong>
              <span>
                빈 공간 없이 딱 맞는 박스에 담아주세요. 한 박스당 20kg 이하만
                수거 가능해요.
              </span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <CoinIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>상품화 비용 5,000원</strong>
              <span>정산 시 박스 당 상품화 비용 5,000원이 차감돼요.</span>
            </div>
          </li>
          <li className="pickup-guide-list__item">
            <span className="pickup-guide-list__icon">
              <TruckIcon size={18} />
            </span>
            <div className="pickup-guide-list__text">
              <strong>수거는 무료예요</strong>
              <span>
                별도의 수거 비용은 없어요. 흔들리지 않게 포장해 문 앞에 두시면
                돼요.
              </span>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}
