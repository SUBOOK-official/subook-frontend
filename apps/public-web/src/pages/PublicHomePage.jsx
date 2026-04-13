import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import searchIconImage from "../assets/search-icon.svg";
import searchActionImage from "../assets/search-action.svg";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import BestBooksSection from "../components/home/BestBooksSection";
import HeroBanner from "../components/home/HeroBanner";
import LatestArrivalsSection from "../components/home/LatestArrivalsSection";
import PickupCTA from "../components/home/PickupCTA";
import SubjectGrid from "../components/home/SubjectGrid";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";

const PICKUP_REQUEST_PATH = "/pickup/new";

const HOME_HERO_SLIDES = [
  {
    id: "store-discovery",
    eyebrow: "SUBOOK",
    titleLines: ["수능 교재,", "똑똑하게 거래하세요"],
    descriptionLines: [
      "대치동 학원 교재를 최대 80% 할인으로",
      "전문 검수 완료된 교재만 판매합니다",
    ],
    ctaLabel: "교재 둘러보기",
    ctaTextColor: "#1B3A5C",
    gradient: "135deg, #1B3A5C 0%, #2563EB 50%, #3B82F6 100%",
    href: "/store",
  },
  {
    id: "sell-with-subook",
    eyebrow: "SELL WITH SUBOOK",
    titleLines: ["집에 잠자는 교재,", "돈이 됩니다"],
    descriptionLines: [
      "포장만 하면 수거부터 판매까지 전부 대행",
      "검수 · 촬영 · 등록 · 정산 모두 수북이",
    ],
    ctaLabel: "수거 요청하기",
    ctaTextColor: "#065F46",
    gradient: "135deg, #065F46 0%, #059669 50%, #10B981 100%",
    actionType: "pickup",
  },
  {
    id: "new-arrival",
    eyebrow: "NEW ARRIVAL",
    titleLines: ["2026 시대인재", "신규 대량 입고!"],
    descriptionLines: ["수학 · 국어 · 영어 인기 교재", "한정 수량, 지금 바로 확인하세요"],
    ctaLabel: "지금 보러가기",
    ctaTextColor: "#4C1D95",
    gradient: "135deg, #4C1D95 0%, #7C3AED 50%, #8B5CF6 100%",
    href: "/store?brand=시대인재",
  },
];

function PublicHomePage() {
  const navigate = useNavigate();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  const [selectedMenu, setSelectedMenu] = useState(null);

  const handleGoToCart = () => {
    if (!requireMember("cart", "/cart")) {
      return;
    }

    navigate("/cart");
  };

  const handlePickupRequest = () => {
    if (!requireMember("pickupRequest", PICKUP_REQUEST_PATH)) {
      return;
    }

    setSelectedMenu("sell");
    navigate(PICKUP_REQUEST_PATH);
  };

  const handleHeroAction = (slide) => {
    if (slide.actionType === "pickup") {
      handlePickupRequest();
      return;
    }

    if (slide.href?.startsWith("/store")) {
      setSelectedMenu("store");
    }

    if (slide.href) {
      navigate(slide.href);
    }
  };

  const handleToggleFavorite = async (productId) => {
    if (!requireMember("favorite")) {
      return;
    }

    await toggleFavorite(productId);
  };

  const pageContent = (
    <div className="public-home-route">
      <div className="public-top-area public-top-area--home">
        <ContentContainer as="header" className="public-nav">
          <Link className="public-brand" to="/">
            SUBOOK®
          </Link>

          <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
            <button className="public-nav-link public-nav-link--cart" onClick={handleGoToCart} type="button">
              <span>장바구니</span>
            </button>
            <Link className="public-nav-link" to="/mypage">
              마이페이지
            </Link>
            <Link className="public-nav-link public-nav-button" to="/login">
              로그인/회원가입
            </Link>
          </nav>
        </ContentContainer>

        <ContentContainer className="public-menu" role="tablist" aria-label="상단 메뉴">
          <Link
            aria-selected={selectedMenu === "store"}
            className={`public-menu-tab ${selectedMenu === "store" ? "public-menu-tab--active" : ""}`}
            onClick={() => setSelectedMenu("store")}
            role="tab"
            to="/store"
          >
            스토어
          </Link>
          <button
            aria-selected={selectedMenu === "sell"}
            className={`public-menu-tab ${selectedMenu === "sell" ? "public-menu-tab--active" : ""}`}
            onClick={handlePickupRequest}
            role="tab"
            type="button"
          >
            판매하기
          </button>
        </ContentContainer>

        <ContentContainer as="section" className="public-search-section" aria-label="교재 검색">
          <form className="public-search">
            <img alt="" className="public-search__icon" src={searchIconImage} />
            <input
              aria-label="교재 검색"
              className="public-search__input"
              placeholder="교재명, 저자, ISBN, 학교, 학원명을 입력해주세요."
              type="search"
            />
            <button aria-label="검색 필터" className="public-search__action" type="button">
              <img alt="" src={searchActionImage} />
            </button>
          </form>
        </ContentContainer>
      </div>

      <HeroBanner onSlideAction={handleHeroAction} slides={HOME_HERO_SLIDES} />
      <SubjectGrid />
      <BestBooksSection
        favoriteIds={favoriteIds}
        onStoreEnter={() => setSelectedMenu("store")}
        onToggleFavorite={handleToggleFavorite}
      />
      <LatestArrivalsSection
        favoriteIds={favoriteIds}
        onStoreEnter={() => setSelectedMenu("store")}
        onToggleFavorite={handleToggleFavorite}
      />
      <PickupCTA onRequestPickup={handlePickupRequest} />

      <PublicFooter />
      {memberGateDialog}
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicHomePage;
