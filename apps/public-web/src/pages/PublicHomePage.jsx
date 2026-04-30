import { useNavigate } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicPageFrame from "../components/PublicPageFrame";
import BestBooksSection from "../components/home/BestBooksSection";
import HeroBanner from "../components/home/HeroBanner";
import HomeStoreGrid from "../components/home/HomeStoreGrid";
import PickupCTA from "../components/home/PickupCTA";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";

const PICKUP_REQUEST_PATH = "/pickup/new";

const HOME_HERO_SLIDES = [
  {
    id: "store-discovery",
    eyebrow: "SUBOOK",
    titleLines: ["수능 교재,", "똑똑하게 구매하세요"],
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
    id: "pickup-request",
    eyebrow: "SELL YOUR BOOKS",
    titleLines: ["집에 쌓인 교재를", "합리적인 정산금으로!"],
    descriptionLines: [
      "수거부터 검수, 판매, 정산까지 한 번에",
      "지금 바로 판매 신청하세요",
    ],
    ctaLabel: "판매 신청하기",
    ctaTextColor: "#9F1239",
    gradient: "135deg, #BE123C 0%, #E11D48 50%, #F43F5E 100%",
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

    navigate(PICKUP_REQUEST_PATH);
  };

  const handleHeroAction = (slide) => {
    if (slide.actionType === "pickup") {
      handlePickupRequest();
      return;
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
      <PublicSiteHeader onCartClick={handleGoToCart} />

      <HeroBanner onSlideAction={handleHeroAction} slides={HOME_HERO_SLIDES} />
      <BestBooksSection
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
      />
      <HomeStoreGrid favoriteIds={favoriteIds} onToggleFavorite={handleToggleFavorite} />
      <PickupCTA onRequestPickup={handlePickupRequest} />

      <PublicFooter />
      {memberGateDialog}
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicHomePage;
