import { useNavigate } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicPageFrame from "../components/PublicPageFrame";
import BestBooksSection from "../components/home/BestBooksSection";
import HeroBanner from "../components/home/HeroBanner";
import HomeStoreGrid from "../components/home/HomeStoreGrid";
import LatestArrivalsSection from "../components/home/LatestArrivalsSection";
import PickupCTA from "../components/home/PickupCTA";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { usePageMeta } from "../lib/usePageMeta";

const PICKUP_REQUEST_PATH = "/pickup/new";

// 첫 슬라이드는 구매자 가치 전달(수능 끝, 검수된 중고 교재 최대 60% 할인).
// 두번째는 판매자 동기 부여. FAQ 슬라이드("정말 믿고 사도 되는걸까요?")는
// negative framing이므로 제거했다 (2026-05-19).
const HOME_HERO_SLIDES = [
  {
    id: "shop-textbooks",
    eyebrow: "BUY USED TEXTBOOKS",
    titleLines: ["수능 끝, 검수된", "중고 교재를 합리적으로"],
    descriptionLines: [
      "S·A+급 위주, 정가 대비 최대 60% 할인",
      "지금 바로 원하는 교재를 찾아보세요",
    ],
    ctaLabel: "교재 보러가기",
    ctaTextColor: "#0B1F47",
    gradient: "135deg, #1D4ED8 0%, #3B82F6 50%, #60A5FA 100%",
    actionType: "shop",
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

    if (slide.actionType === "shop") {
      // 쇼핑 CTA는 검색어 없이 그리드로 점프해 "교재 보러가기" 의도를 반영.
      navigate("/?q=", { state: { scrollToStorefront: true } });
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

      {/* 시각적으로 숨겨진 단일 <h1>. SEO·스크린리더용 페이지 제목. */}
      <h1 className="public-visually-hidden">수능 중고 교재 위탁판매 | 수북</h1>

      <HeroBanner onSlideAction={handleHeroAction} slides={HOME_HERO_SLIDES} />
      <BestBooksSection
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
      />
      <LatestArrivalsSection
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
