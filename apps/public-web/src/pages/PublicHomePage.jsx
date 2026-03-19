import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import arrowLeftImage from "../assets/arrow-left.svg";
import arrowRightImage from "../assets/arrow-right.svg";
import heartOutlineImage from "../assets/heart-outline.svg";
import searchIconImage from "../assets/search-icon.svg";
import searchActionImage from "../assets/search-action.svg";
import categoryAImage from "../assets/category-a.png";
import categoryBImage from "../assets/category-b.png";
import categoryCImage from "../assets/category-c.png";
import categoryDImage from "../assets/category-d.png";
import heroBooksBannerImage from "../assets/hero-books-banner.png";
import heroFaqBubbleImage from "../assets/hero-faq-bubble.svg";
import heroFaqMascotImage from "../assets/hero-faq-mascot.png";

const HERO_ROTATION_MS = 5000;
const DESKTOP_FRAME_WIDTH = 1920;
const DESKTOP_LOCK_MIN_WIDTH = 1280;
const HERO_SLIDE_COUNT = 2;

const categoryCards = [
  {
    id: "category-a",
    asset: categoryAImage,
    alt: "BEST 카테고리 카드",
    style: "neutral",
  },
  {
    id: "category-b",
    asset: categoryBImage,
    alt: "BEST 카테고리 카드",
    style: "full",
  },
  {
    id: "category-c",
    asset: categoryCImage,
    alt: "BEST 카테고리 카드",
    style: "teal",
  },
  {
    id: "category-d",
    asset: categoryDImage,
    alt: "BEST 카테고리 카드",
    style: "blue",
  },
];

const productLabels = [
  { label: "국어", tone: "subject" },
  { label: "기출", tone: "type" },
  { label: "시대인재", tone: "brand" },
  { label: "S(새책)", tone: "status" },
];

const productCards = Array.from({ length: 10 }, (_, index) => ({
  id: `product-${index + 1}`,
  title: "2026 시대인재 파이널 브릿지 전국 물리학1",
  discount: "80%",
  salePrice: "4,000원",
  originalPrice: "20,000원",
}));

function LabelPill({ label, tone }) {
  return <span className={`public-pill public-pill--${tone}`}>{label}</span>;
}

function CategoryCard({ asset, alt, style }) {
  const cardClassName =
    style === "full"
      ? "public-category-card public-category-card--full"
      : `public-category-card public-category-card--${style}`;

  return (
    <article className={cardClassName}>
      <img
        alt={alt}
        className={style === "full" ? "public-category-card__full-image" : "public-category-card__image"}
        src={asset}
      />
    </article>
  );
}

function ProductCard({ product }) {
  return (
    <article className="public-product-card">
      <div className="public-product-media">
        <button aria-label="찜하기" className="public-heart-button" type="button">
          <img alt="" src={heartOutlineImage} />
        </button>
      </div>

      <div className="public-product-content">
        <div className="public-pill-row">
          {productLabels.map((item) => (
            <LabelPill key={item.label} label={item.label} tone={item.tone} />
          ))}
        </div>

        <h3 className="public-product-title">{product.title}</h3>

        <div className="public-price-row">
          <span className="public-price-row__discount">{product.discount}</span>
          <span className="public-price-row__sale">{product.salePrice}</span>
          <span className="public-price-row__original">{product.originalPrice}</span>
        </div>
      </div>

      <div className="public-product-actions">
        <button className="public-outline-button" type="button">
          장바구니 담기
        </button>
        <button className="public-outline-button" type="button">
          바로 구매하기
        </button>
      </div>
    </article>
  );
}

function BooksHeroSlide() {
  return (
    <div className="public-hero-slide__surface public-hero-slide__surface--books">
      <img alt="" aria-hidden="true" className="public-hero-books__background" src={heroBooksBannerImage} />

      <div className="public-hero-books__copy">
        <p className="public-hero-books__headline">
          대치동 현강 <span>희귀 모의고사</span>부터
          <br />
          <span>S급</span> 기출 · 내신 교재까지
        </p>
        <p className="public-hero-books__subhead">수북에서 합리적인 가격으로 만나보세요</p>
        <p className="public-hero-books__caption">전문가 검수로 품질 걱정 없는 중고 교재 거래</p>
      </div>
    </div>
  );
}

function FaqHeroSlide() {
  return (
    <div className="public-hero-slide__surface public-hero-slide__surface--faq">
      <div className="public-hero-faq__glow public-hero-faq__glow--left" aria-hidden="true" />
      <div className="public-hero-faq__glow public-hero-faq__glow--right" aria-hidden="true" />

      <div className="public-hero-faq">
        <img alt="" aria-hidden="true" className="public-hero-faq__mascot" src={heroFaqMascotImage} />

        <div className="public-hero-faq__copy">
          <div className="public-hero-faq__bubble-wrap">
            <img alt="" aria-hidden="true" className="public-hero-faq__bubble" src={heroFaqBubbleImage} />
            <p className="public-hero-faq__bubble-copy">수북, 정말 믿고 사도 되는걸까요?</p>
          </div>

          <p className="public-hero-faq__cta">
            자주 묻는 질문 <span>FAQ</span> 바로가기 <strong>→</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

function PublicHomePage() {
  const [heroClock, setHeroClock] = useState(() => Math.floor(Date.now() / HERO_ROTATION_MS));
  const [heroOffset, setHeroOffset] = useState(0);
  const [desktopScale, setDesktopScale] = useState(1);
  const [desktopFrameHeight, setDesktopFrameHeight] = useState(0);
  const [isDesktopLocked, setIsDesktopLocked] = useState(false);
  const desktopFrameRef = useRef(null);

  useEffect(() => {
    const syncHeroClock = () => {
      setHeroClock(Math.floor(Date.now() / HERO_ROTATION_MS));
    };

    syncHeroClock();

    const intervalId = window.setInterval(syncHeroClock, 400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const syncDesktopFrame = () => {
      const shouldLockDesktop = window.innerWidth >= DESKTOP_LOCK_MIN_WIDTH;
      setIsDesktopLocked(shouldLockDesktop);

      if (!shouldLockDesktop) {
        setDesktopScale(1);
        return;
      }

      setDesktopScale(Math.min(1, window.innerWidth / DESKTOP_FRAME_WIDTH));
    };

    syncDesktopFrame();
    window.addEventListener("resize", syncDesktopFrame);

    return () => {
      window.removeEventListener("resize", syncDesktopFrame);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopLocked || !desktopFrameRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const syncDesktopHeight = () => {
      setDesktopFrameHeight(desktopFrameRef.current.offsetHeight);
    };

    syncDesktopHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncDesktopHeight();
    });

    resizeObserver.observe(desktopFrameRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isDesktopLocked]);

  const activeHeroIndex = ((heroClock + heroOffset) % HERO_SLIDE_COUNT + HERO_SLIDE_COUNT) % HERO_SLIDE_COUNT;

  const handlePreviousHero = () => {
    setHeroOffset((currentOffset) => currentOffset - 1);
  };

  const handleNextHero = () => {
    setHeroOffset((currentOffset) => currentOffset + 1);
  };

  const pageContent = (
    <>
      <div className="public-top-area">
        <header className="public-shell public-nav">
          <Link className="public-brand" to="/">
            SUBOOK®
          </Link>

          <nav aria-label="유틸리티 메뉴" className="public-nav-actions">
            <button className="public-nav-link public-nav-link--cart" type="button">
              <span>장바구니</span>
              <span className="public-cart-badge">5</span>
            </button>
            <button className="public-nav-link" type="button">
              마이페이지
            </button>
            <button className="public-nav-link public-nav-button" type="button">
              로그아웃
            </button>
          </nav>
        </header>

        <div className="public-shell public-menu" role="tablist" aria-label="상단 메뉴">
          <Link
            aria-selected="true"
            className="public-menu-tab public-menu-tab--active"
            role="tab"
            to="/store"
          >
            스토어
          </Link>
          <button aria-selected="false" className="public-menu-tab" role="tab" type="button">
            판매하기
          </button>
        </div>

        <section className="public-shell public-search-section" aria-label="교재 검색">
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
        </section>

        <section className="public-shell public-hero-section" aria-label="메인 배너">
          <div className="public-hero" aria-live="polite">
            <article
              aria-hidden={activeHeroIndex !== 0}
              className={`public-hero-slide ${activeHeroIndex === 0 ? "public-hero-slide--active" : ""}`}
            >
              <BooksHeroSlide />
            </article>

            <article
              aria-hidden={activeHeroIndex !== 1}
              className={`public-hero-slide ${activeHeroIndex === 1 ? "public-hero-slide--active" : ""}`}
            >
              <FaqHeroSlide />
            </article>

            <div className="public-hero__arrows">
              <button
                aria-label="이전 배너 보기"
                className="public-arrow-button public-arrow-button--prev"
                onClick={handlePreviousHero}
                type="button"
              >
                <img alt="" src={arrowLeftImage} />
              </button>
              <button aria-label="다음 배너 보기" className="public-arrow-button" onClick={handleNextHero} type="button">
                <img alt="" src={arrowRightImage} />
              </button>
            </div>

            <div className="public-hero__dots" aria-label="배너 선택">
              {[0, 1].map((index) => (
                <button
                  key={index}
                  aria-label={`${index + 1}번 배너 보기`}
                  aria-pressed={activeHeroIndex === index}
                  className={`public-hero__dot ${activeHeroIndex === index ? "public-hero__dot--active" : ""}`}
                  onClick={() => setHeroOffset(index - heroClock)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="public-shell public-category-section" aria-labelledby="public-best-category">
          <h2 className="public-section-title public-category-section__title" id="public-best-category">
            👑 BEST 카테고리
          </h2>

          <div className="public-category-list">
            {categoryCards.map((card) => (
              <CategoryCard key={card.id} {...card} />
            ))}
          </div>
        </section>
      </div>

      <section className="public-products" aria-labelledby="public-best-books">
        <div className="public-shell">
          <div className="public-products__header">
            <h2 className="public-section-title" id="public-best-books">
              📚 BEST 교재
            </h2>
          </div>

          <div className="public-product-grid">
            {productCards.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>
    </>
  );

  if (isDesktopLocked) {
    return (
      <main className="public-home public-home--locked">
        <div className="public-home__stage" style={{ height: `${desktopFrameHeight * desktopScale}px` }}>
          <div
            className="public-home__frame"
            ref={desktopFrameRef}
            style={{ transform: `translateX(-50%) scale(${desktopScale})` }}
          >
            {pageContent}
          </div>
        </div>
      </main>
    );
  }

  return <main className="public-home">{pageContent}</main>;
}

export default PublicHomePage;
