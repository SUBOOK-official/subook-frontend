import { useEffect, useRef, useState } from "react";
import ContentContainer from "../ContentContainer";

// WCAG 2.2.2: 자동 회전은 사용자가 한 슬라이드를 읽을 충분한 시간이 필요.
// 첫 인상 슬라이드로 3초는 짧아 텍스트를 읽기 전에 사라지는 사례가 있어 5초로 늘림.
const AUTO_ROTATION_MS = 5000;
const INTERACTION_PAUSE_MS = 10000;
const SWIPE_THRESHOLD_PX = 50;

function getWrappedIndex(index, length) {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

function renderLines(lines) {
  return lines.map((line, index) => (
    <span key={`${line}-${index}`} className="public-home-hero-banner__line">
      {line}
    </span>
  ));
}

const HERO_BANNER_CHEVRON_PATH = {
  prev: "M8.3685 12L13.1162 3.03212L14.8838 3.9679L10.6315 12L14.8838 20.0321L13.1162 20.9679L8.3685 12Z",
  next: "M15.6315 12L10.8838 3.03212L9.11622 3.9679L13.3685 12L9.11622 20.0321L10.8838 20.9679L15.6315 12Z",
};

function HeroBannerChevronIcon({ direction }) {
  return (
    <svg
      aria-hidden="true"
      className={`public-home-hero-banner__arrow-icon public-home-hero-banner__arrow-icon--${direction}`}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={HERO_BANNER_CHEVRON_PATH[direction]} />
    </svg>
  );
}

function HeroBanner({ onSlideAction, slides = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  // prefers-reduced-motion 사용자는 자동회전을 완전히 끈다 (WCAG 2.3.3).
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartXRef = useRef(null);
  const interactionTimeoutRef = useRef(null);
  const slideCount = slides.length;

  useEffect(() => {
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex, slideCount));
  }, [slideCount]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = (event) => {
      setPrefersReducedMotion(event.matches);
    };

    syncReducedMotion(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncReducedMotion);
      return () => mediaQuery.removeEventListener("change", syncReducedMotion);
    }

    mediaQuery.addListener(syncReducedMotion);
    return () => mediaQuery.removeListener(syncReducedMotion);
  }, []);

  useEffect(() => {
    if (slideCount <= 1 || isInteractionPaused || prefersReducedMotion) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => getWrappedIndex(currentIndex + 1, slideCount));
    }, AUTO_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isInteractionPaused, prefersReducedMotion, slideCount]);

  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current !== null) {
        window.clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, []);

  if (slideCount === 0) {
    return null;
  }

  const pauseAfterInteraction = () => {
    setIsInteractionPaused(true);

    if (interactionTimeoutRef.current !== null) {
      window.clearTimeout(interactionTimeoutRef.current);
    }

    interactionTimeoutRef.current = window.setTimeout(() => {
      setIsInteractionPaused(false);
      interactionTimeoutRef.current = null;
    }, INTERACTION_PAUSE_MS);
  };

  const showSlide = (nextIndex, options = {}) => {
    const { pause = true } = options;

    if (pause) {
      pauseAfterInteraction();
    }

    setActiveIndex(getWrappedIndex(nextIndex, slideCount));
  };

  const showPreviousSlide = () => {
    pauseAfterInteraction();
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex - 1, slideCount));
  };

  const showNextSlide = () => {
    pauseAfterInteraction();
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex + 1, slideCount));
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    const touchStartX = touchStartXRef.current;
    const touchEndX = event.changedTouches[0]?.clientX ?? null;

    touchStartXRef.current = null;

    if (touchStartX === null || touchEndX === null) {
      return;
    }

    const distance = touchEndX - touchStartX;

    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) {
      return;
    }

    if (distance < 0) {
      showNextSlide();
      return;
    }

    showPreviousSlide();
  };

  const handleTouchCancel = () => {
    touchStartXRef.current = null;
  };

  return (
    <section className="public-home-hero-banner" role="region" aria-label="히어로 배너">
      <div
        aria-atomic="true"
        aria-live="polite"
        className="public-home-hero-banner__viewport"
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
      >
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;

          return (
            <article
              aria-hidden={isActive ? "false" : "true"}
              aria-label={`슬라이드 ${index + 1}/${slideCount}`}
              aria-roledescription="slide"
              className={`public-home-hero-banner__slide ${isActive ? "is-active" : ""}`}
              key={slide.id}
              style={{
                "--public-home-hero-cta-color": slide.ctaTextColor,
                "--public-home-hero-gradient": `linear-gradient(${slide.gradient})`,
              }}
            >
              <ContentContainer className="public-home-hero-banner__slide-shell">
                <div className="public-home-hero-banner__content">
                  <p className="public-home-hero-banner__eyebrow">{slide.eyebrow}</p>
                  {/* 페이지의 단일 <h1>은 PublicHomePage 최상단에서 시각적으로 숨겨 제공.
                      슬라이드 텍스트는 <h2>로 두고 비활성 슬라이드는 aria-hidden 처리. */}
                  <h2 className="public-home-hero-banner__title">{renderLines(slide.titleLines)}</h2>
                  <p className="public-home-hero-banner__description">{renderLines(slide.descriptionLines)}</p>
                  <button
                    aria-hidden={isActive ? undefined : "true"}
                    className="public-home-hero-banner__cta"
                    onClick={() => onSlideAction?.(slide)}
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                  >
                    <span>{slide.ctaLabel}</span>
                  </button>
                </div>
              </ContentContainer>
            </article>
          );
        })}

        {slideCount > 1 ? (
          <ContentContainer className="public-home-hero-banner__controls">
            <div className="public-home-hero-banner__arrow-group">
              <button
                aria-label="이전 슬라이드 보기"
                className="public-home-hero-banner__arrow public-home-hero-banner__arrow--prev"
                onClick={showPreviousSlide}
                type="button"
              >
                <HeroBannerChevronIcon direction="prev" />
              </button>
              <button
                aria-label="다음 슬라이드 보기"
                className="public-home-hero-banner__arrow public-home-hero-banner__arrow--next"
                onClick={showNextSlide}
                type="button"
              >
                <HeroBannerChevronIcon direction="next" />
              </button>
            </div>

            <div className="public-home-hero-banner__dots" aria-label="슬라이드 선택">
              {slides.map((slide, index) => (
                <button
                  aria-label={`${index + 1}번 슬라이드 보기`}
                  aria-pressed={index === activeIndex}
                  className={`public-home-hero-banner__dot ${index === activeIndex ? "is-active" : ""}`}
                  key={`${slide.id}-dot`}
                  onClick={() => showSlide(index)}
                  type="button"
                />
              ))}
            </div>
          </ContentContainer>
        ) : null}
      </div>
    </section>
  );
}

export default HeroBanner;
