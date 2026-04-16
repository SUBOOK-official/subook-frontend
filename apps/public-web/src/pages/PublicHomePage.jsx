import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicSiteHeader from "../components/PublicSiteHeader";
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
    id: "quality-guarantee",
    eyebrow: "QUALITY FIRST",
    titleLines: ["4단계 전문 검수,", "믿고 구매하세요"],
    descriptionLines: [
      "S · A+ · A 등급별 상태 투명 공개",
      "기대와 다르면 100% 환불 보장",
    ],
    ctaLabel: "검수 기준 보기",
    ctaTextColor: "#1E3A5F",
    gradient: "135deg, #0F172A 0%, #1E3A5F 50%, #334155 100%",
    href: "/store",
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
        <PublicSiteHeader onCartClick={handleGoToCart} />
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
