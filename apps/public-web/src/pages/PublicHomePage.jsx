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
import { usePageMeta } from "../lib/usePageMeta";

const PICKUP_REQUEST_PATH = "/pickup/new";

const HOME_HERO_SLIDES = [
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
    id: "faq",
    eyebrow: "FAQ",
    titleLines: ["수북, 정말", "믿고 사도 되는걸까요?"],
    descriptionLines: ["판매·수거·등급·정산까지", "자주 묻는 질문을 한 번에 확인해 보세요"],
    ctaLabel: "자주 묻는 질문 보러가기",
    ctaTextColor: "#0F766E",
    gradient: "135deg, #0F766E 0%, #14B8A6 50%, #5EEAD4 100%",
    href: "/faq",
  },
];

function PublicHomePage() {
  usePageMeta({
    description:
      "수험생을 위한 안 쓰는 수능 교재 위탁판매. CJ 픽업, 검수, 안전결제까지 수북이 책임집니다. 시대인재·강남대성·이투스 등 인기 교재를 합리적인 가격에 만나보세요.",
  });
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
