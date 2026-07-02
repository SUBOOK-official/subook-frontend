import { useRef } from "react";
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

// 2026-05-19 사업 방향성 전환: 신규 입고는 모두 안 쓴(미사용) 교재 중심.
// 기존 중고 재고는 재고 소진까지 함께 노출. 슬라이드 카피도 새 책 톤으로.
const HOME_HERO_SLIDES = [
  {
    id: "shop-textbooks",
    eyebrow: "BUY UNUSED TEXTBOOKS",
    titleLines: ["수능 끝, 안 쓴 교재를", "합리적인 가격에"],
    descriptionLines: [
      "검수 완료, 정가 대비 최대 60% 할인",
      "지금 바로 원하는 교재를 찾아보세요",
    ],
    ctaLabel: "교재 보러가기",
    ctaTextColor: "#0B1F47",
    gradient: "135deg, #1D4ED8 0%, #3B82F6 50%, #60A5FA 100%",
    actionType: "shop",
    imageDesktop: "/banners/hero-banner-1-desktop.png",
    imageMobile: "/banners/hero-banner-1-mobile.png",
    imageAlt: "수능 끝, 안 쓴 교재를 합리적인 가격에 - 교재 보러가기",
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
    imageDesktop: "/banners/hero-banner-2-desktop.png",
    imageMobile: "/banners/hero-banner-2-mobile.png",
    imageAlt: "집에 쌓인 교재를 합리적인 정산금으로 - 판매 신청하기",
  },
  {
    id: "banner-3",
    actionType: "faq",
    imageDesktop: "/banners/hero-banner-3-desktop.png",
    imageMobile: "/banners/hero-banner-3-mobile.png",
    imageAlt: "수북, 정말 믿고 사도 되는걸까요? 자주 묻는 질문 FAQ 바로가기",
  },
];

function PublicHomePage() {
  usePageMeta({
    description:
      "수험생을 위한 안 쓴(미사용) 수능 교재 위탁판매. CJ 픽업, 검수, 안전결제까지 수북이 책임집니다. 시대인재·강남대성·이투스 등 인기 교재를 합리적인 가격에 만나보세요.",
  });
  const navigate = useNavigate();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  // 배너(대치동 현강/교재 보러가기) 클릭 시 스크롤 도착 지점 — 배너 바로 아래 상품 구역.
  const productsRef = useRef(null);

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
      // 같은 홈 화면이므로 URL 이동 없이 배너 바로 아래 상품 구역으로 부드럽게 스크롤.
      // (기존 navigate('/?q=', scrollToStorefront) 방식은 홈에서 클릭 시 스크롤이 안 걸리는
      //  케이스가 있어, 같은 페이지 앵커로 직접 스크롤한다. 모바일/데스크탑 공통 동작.)
      productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (slide.actionType === "faq") {
      navigate("/faq");
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
      <h1 className="public-visually-hidden">수능 교재 위탁판매 — 안 쓴 교재를 합리적인 가격에 | 수북</h1>

      <HeroBanner onSlideAction={handleHeroAction} slides={HOME_HERO_SLIDES} />
      {/* 배너 클릭 스크롤 도착 지점. sticky 헤더에 가리지 않도록 scroll-margin-top 확보. */}
      <div aria-hidden="true" ref={productsRef} style={{ scrollMarginTop: "80px" }} />
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
