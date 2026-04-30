import { useEffect, useRef, useState } from "react";
import ContentContainer from "../ContentContainer";

const AUTO_ROTATION_MS = 3000;
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

function HeroBanner({ onSlideAction, slides = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const touchStartXRef = useRef(null);
  const interactionTimeoutRef = useRef(null);
  const slideCount = slides.length;

  useEffect(() => {
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex, slideCount));
  }, [slideCount]);

  useEffect(() => {
    if (slideCount <= 1 || isInteractionPaused || isPlaybackPaused) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => getWrappedIndex(currentIndex + 1, slideCount));
    }, AUTO_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isInteractionPaused, isPlaybackPaused, slideCount]);

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

  const handlePauseToggle = () => {
    setIsPlaybackPaused((currentValue) => !currentValue);
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
              aria-hidden={!isActive}
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
                  <h1 className="public-home-hero-banner__title">{renderLines(slide.titleLines)}</h1>
                  <p className="public-home-hero-banner__description">{renderLines(slide.descriptionLines)}</p>
                  <button
                    className="public-home-hero-banner__cta"
                    onClick={() => onSlideAction?.(slide)}
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
                <span aria-hidden="true">‹</span>
              </button>
              <button
                aria-label="다음 슬라이드 보기"
                className="public-home-hero-banner__arrow public-home-hero-banner__arrow--next"
                onClick={showNextSlide}
                type="button"
              >
                <span aria-hidden="true">›</span>
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

            <button
              aria-label={isPlaybackPaused ? "자동 전환 재생" : "자동 전환 일시정지"}
              className="public-home-hero-banner__playback"
              onClick={handlePauseToggle}
              type="button"
            >
              <span aria-hidden="true">{isPlaybackPaused ? "▶" : "⏸"}</span>
            </button>
          </ContentContainer>
        ) : null}
      </div>
    </section>
  );
}

export default HeroBanner;
