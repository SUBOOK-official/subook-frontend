import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicPageFrame from "../components/PublicPageFrame";
import BestBooksSection from "../components/home/BestBooksSection";
import B2bCTA from "../components/home/B2bCTA";
import HeroBanner from "../components/home/HeroBanner";
import HomeStoreGrid from "../components/home/HomeStoreGrid";
import LatestArrivalsSection from "../components/home/LatestArrivalsSection";
import PickupCTA from "../components/home/PickupCTA";
import FortuneCookie from "../components/FortuneCookie";
import PublicPopupBanner from "../components/PublicPopupBanner";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { trackEvent, trackPickupCtaClick } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import useSitePromotions from "../lib/useSitePromotions";
import { isPromotionUrl } from "@shared-domain/sitePromotions";

const SELL_GUIDE_PATH = "/sell";

function PublicHomePage() {
  // 홈은 기본 타이틀·설명(usePageMeta DEFAULT_*, 구 식스샵 SEO 카피)을 그대로 사용
  usePageMeta({});
  const navigate = useNavigate();
  const promotions = useSitePromotions();
  const heroSlides = promotions.filter((row) => row.placement === "home_hero").map((row) => ({
    id: row.id, imageDesktop: row.image_url,
    imageMobile: isPromotionUrl(row.mobile_image_url) ? row.mobile_image_url : null,
    imageAlt: row.alt_text, href: isPromotionUrl(row.link_url) ? row.link_url : null,
  }));
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  // 배너(대치동 현강/교재 보러가기) 클릭 시 스크롤 도착 지점 — 배너 바로 아래 상품 구역.
  const productsRef = useRef(null);

  // GA4 cart_open은 헤더(handleCartClick)가 단일 지점에서 발화한다 — 여기서 중복 발화 금지.
  const handleGoToCart = () => {
    if (!requireMember("cart", "/cart")) {
      return;
    }

    navigate("/cart");
  };

  const handlePickupRequest = (ctaSource) => {
    // 공개 안내 진입 의도. 실제 신청은 안내 페이지 CTA에서 별도로 계측한다.
    trackPickupCtaClick(ctaSource);
    navigate(SELL_GUIDE_PATH);
  };

  const handleHeroAction = (slide) => {
    if (slide.href === "/sell") {
      handlePickupRequest("hero_banner");
      return;
    }

    if (slide.href === "/#products") {
      // 같은 홈 화면이므로 URL 이동 없이 배너 바로 아래 상품 구역으로 부드럽게 스크롤.
      // (기존 navigate('/?q=', scrollToStorefront) 방식은 홈에서 클릭 시 스크롤이 안 걸리는
      //  케이스가 있어, 같은 페이지 앵커로 직접 스크롤한다. 모바일/데스크탑 공통 동작.)
      // GA4 — 배너발 "교재 보러가기"는 페이지 이동이 없어 select_promotion 외 도달을 따로 남긴다.
      trackEvent("home_scroll_to_products", { promotionId: slide.id });
      productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (isPromotionUrl(slide.href)) {
      if (slide.href.startsWith("/")) navigate(slide.href);
      else window.location.assign(slide.href);
    }
  };

  const handleToggleFavorite = async (productId) => {
    if (!requireMember("favorite")) {
      return;
    }

    // 찜 계측(add_to_wishlist)은 PublicWishlistContext가 단일 지점에서 발화 — 표면만 알려준다.
    await toggleFavorite(productId, { uiSurface: "home_card" });
  };

  const pageContent = (
    <div className="public-home-route">
      <PublicSiteHeader onCartClick={handleGoToCart} />

      {/* 시각적으로 숨겨진 단일 <h1>. SEO·스크린리더용 페이지 제목. */}
      <h1 className="public-visually-hidden">수능 교재 위탁판매 — 안 쓴 교재를 합리적인 가격에 | 수북</h1>

      {heroSlides.length > 0 && <HeroBanner onSlideAction={handleHeroAction} slides={heroSlides} />}
      {/* 배너 클릭 스크롤 도착 지점. sticky 헤더에 가리지 않도록 scroll-margin-top 확보. */}
      <div id="products" aria-hidden="true" ref={productsRef} style={{ scrollMarginTop: "80px" }} />
      {/* 2026-08-31: 신규 입고를 BEST 위로 — 콜라보 신상품 노출을 최우선으로 */}
      <LatestArrivalsSection
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
      />
      <BestBooksSection
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
      />
      <HomeStoreGrid favoriteIds={favoriteIds} onToggleFavorite={handleToggleFavorite} />
      <PickupCTA onRequestPickup={() => handlePickupRequest("home_bottom_cta")} />
      <B2bCTA />

      <PublicFooter />
      {memberGateDialog}
      <FortuneCookie />
      <PublicPopupBanner popups={promotions.filter((row) => row.placement === "home_popup")} />
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicHomePage;
