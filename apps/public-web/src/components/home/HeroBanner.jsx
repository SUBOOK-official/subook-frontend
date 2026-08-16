import { useEffect, useRef, useState } from "react";
import { trackSelectPromotion, trackViewPromotion } from "../../lib/analytics";
import ContentContainer from "../ContentContainer";

// GA4 프로모션 파라미터 — 슬라이드 id 그대로 promotion_id, 노출 위치는 hero_N.
function toPromotionParams(slide, slideIndex) {
  return {
    promotionId: slide.id,
    promotionName: slide.eyebrow ?? slide.imageAlt ?? slide.id,
    creativeSlot: `hero_${slideIndex + 1}`,
  };
}

// WCAG 2.2.2: 자동 회전은 사용자가 한 슬라이드를 읽을 충분한 시간이 필요.
// 첫 인상 슬라이드로 3초는 짧아 텍스트를 읽기 전에 사라지는 사례가 있어 5초로 늘림.
const AUTO_ROTATION_MS = 5000;
const INTERACTION_PAUSE_MS = 10000;
const SWIPE_THRESHOLD_PX = 50;
// 이 거리 이상 움직이면 첫 이동 방향으로 제스처 축을 잠근다(가로=스와이프, 세로=페이지 스크롤).
const DRAG_AXIS_LOCK_PX = 8;
// 트랙 전환 시간·이징. 인라인 스타일과 클론 정리 fallback 타이머가 함께 쓰므로 JS가 단일 소스.
const TRACK_TRANSITION_MS = 450;
const TRACK_TRANSITION_EASING = "cubic-bezier(0.25, 0.8, 0.35, 1)";
// 모바일/데스크톱 배너 이미지 전환 기준. index.css의 hero-banner 브레이크포인트와 동일하게 맞춘다.
const MOBILE_IMAGE_MEDIA_QUERY = "(max-width: 767px)";

function getWrappedIndex(index, length) {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

// 무한 루프용 클론 슬롯(-1, slideCount)에 도착해 있으면
// 화면상 동일하게 보이는 실제 슬라이드 위치로 애니메이션 없이 재배치한다.
function settleCloneParking(state, slideCount) {
  if (state.virtualIndex !== -1 && state.virtualIndex !== slideCount) {
    return state;
  }

  return {
    virtualIndex: getWrappedIndex(state.virtualIndex, slideCount),
    animated: false,
    dragOffset: 0,
  };
}

function findTouchByIdentifier(touchList, identifier) {
  for (let index = 0; index < touchList.length; index += 1) {
    if (touchList[index].identifier === identifier) {
      return touchList[index];
    }
  }

  return null;
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
  // virtualIndex: 클론 포함 트랙 위치(-1 ~ slideCount). 실제 활성 슬라이드는 wrap해서 계산.
  // animated: 트랙 transform에 transition을 걸지 여부 (드래그 중·즉시 재배치는 false)
  // dragOffset: 드래그 중 손가락을 따라가는 px 오프셋
  const [trackState, setTrackState] = useState({ virtualIndex: 0, animated: false, dragOffset: 0 });
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  // prefers-reduced-motion 사용자는 자동회전을 완전히 끄고 수동 전환도 즉시 이동시킨다 (WCAG 2.3.3).
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const interactionTimeoutRef = useRef(null);
  const slideCount = slides.length;
  const hasLoop = slideCount > 1;
  const leadingCloneCount = hasLoop ? 1 : 0;
  const activeIndex = getWrappedIndex(trackState.virtualIndex, slideCount);

  // GA4 view_promotion — 활성 슬라이드가 바뀔 때, 슬라이드별 마운트당 1회만.
  const viewedPromotionIdsRef = useRef(new Set());
  useEffect(() => {
    const slide = slides[activeIndex];
    if (!slide || viewedPromotionIdsRef.current.has(slide.id)) return;
    viewedPromotionIdsRef.current.add(slide.id);
    trackViewPromotion(toPromotionParams(slide, activeIndex));
  }, [activeIndex, slides]);

  useEffect(() => {
    setTrackState((state) => {
      const settledIndex = getWrappedIndex(state.virtualIndex, slideCount);

      if (settledIndex === state.virtualIndex && !state.animated && state.dragOffset === 0) {
        return state;
      }

      return { virtualIndex: settledIndex, animated: false, dragOffset: 0 };
    });
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
      setTrackState((state) => ({
        virtualIndex: getWrappedIndex(state.virtualIndex, slideCount) + 1,
        animated: true,
        dragOffset: 0,
      }));
    }, AUTO_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isInteractionPaused, prefersReducedMotion, slideCount]);

  // 클론 슬롯 정리는 기본적으로 transitionend가 담당하지만, 백그라운드 탭 등에서
  // 이벤트가 유실될 수 있어 전환 시간 + 여유 뒤에 한 번 더 정리한다(멱등).
  useEffect(() => {
    if (!trackState.animated) {
      return undefined;
    }

    if (trackState.virtualIndex !== -1 && trackState.virtualIndex !== slideCount) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTrackState((state) => settleCloneParking(state, slideCount));
    }, TRACK_TRANSITION_MS + 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [trackState, slideCount]);

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

  const goToNeighbor = (delta) => {
    setTrackState((state) => {
      const baseIndex = getWrappedIndex(state.virtualIndex, slideCount);
      const targetIndex = baseIndex + delta;

      if (prefersReducedMotion) {
        return { virtualIndex: getWrappedIndex(targetIndex, slideCount), animated: false, dragOffset: 0 };
      }

      return { virtualIndex: targetIndex, animated: true, dragOffset: 0 };
    });
  };

  const showSlide = (index) => {
    pauseAfterInteraction();
    setTrackState({
      virtualIndex: getWrappedIndex(index, slideCount),
      animated: !prefersReducedMotion,
      dragOffset: 0,
    });
  };

  const showPreviousSlide = () => {
    pauseAfterInteraction();
    goToNeighbor(-1);
  };

  const showNextSlide = () => {
    pauseAfterInteraction();
    goToNeighbor(1);
  };

  const handleTouchStart = (event) => {
    if (dragRef.current !== null) {
      return;
    }

    const touch = event.changedTouches[0];

    if (!touch) {
      return;
    }

    const viewportWidth = viewportRef.current?.offsetWidth ?? 0;

    // 전환 애니메이션 도중 손가락으로 잡으면 지금 보이는 위치 그대로 얼려서 이어 드래그한다.
    let frozenState = null;
    const trackElement = trackRef.current;

    if (trackElement && viewportWidth > 0) {
      const transformValue = window.getComputedStyle(trackElement).transform;

      if (transformValue && transformValue !== "none") {
        const currentX = new DOMMatrixReadOnly(transformValue).m41;
        const rawIndex = -currentX / viewportWidth - leadingCloneCount;
        const baseIndex = Math.round(rawIndex);

        frozenState = {
          virtualIndex: getWrappedIndex(baseIndex, slideCount),
          animated: false,
          dragOffset: (baseIndex - rawIndex) * viewportWidth,
        };
      }
    }

    dragRef.current = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      axis: null,
      viewportWidth,
      baseOffset: frozenState ? frozenState.dragOffset : 0,
    };
    suppressClickRef.current = false;

    setTrackState((state) => {
      if (!state.animated && state.dragOffset === 0) {
        return state;
      }

      if (frozenState) {
        return frozenState;
      }

      return { virtualIndex: getWrappedIndex(state.virtualIndex, slideCount), animated: false, dragOffset: 0 };
    });
  };

  const handleTouchMove = (event) => {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const touch = findTouchByIdentifier(event.changedTouches, drag.identifier);

    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - drag.startX;
    const deltaY = touch.clientY - drag.startY;

    if (drag.axis === null) {
      if (Math.abs(deltaX) < DRAG_AXIS_LOCK_PX && Math.abs(deltaY) < DRAG_AXIS_LOCK_PX) {
        return;
      }

      // 첫 유의미한 이동 방향으로 축 고정 — 세로가 이기면 페이지 스크롤에 양보한다.
      drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";

      if (drag.axis === "x") {
        pauseAfterInteraction();
      }
    }

    if (drag.axis !== "x") {
      return;
    }

    suppressClickRef.current = true;

    // 클론은 양끝 1장씩뿐이라 한 슬라이드 폭 이상은 끌 수 없게 막는다.
    const maxOffset = drag.viewportWidth > 0 ? drag.viewportWidth : Number.POSITIVE_INFINITY;
    const nextOffset = Math.max(-maxOffset, Math.min(maxOffset, drag.baseOffset + deltaX));

    setTrackState((state) => ({ ...state, animated: false, dragOffset: nextOffset }));
  };

  const finishDrag = (event, { cancelled }) => {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const touch = findTouchByIdentifier(event.changedTouches, drag.identifier);

    if (!touch) {
      return;
    }

    dragRef.current = null;

    if (drag.axis !== "x") {
      // 드래그가 아니었어도(탭·세로 스크롤) 얼려둔 오프셋이 남아 있으면 가까운 슬라이드로 스냅.
      setTrackState((state) => {
        if (state.dragOffset === 0) {
          return state;
        }

        return { ...state, animated: !prefersReducedMotion, dragOffset: 0 };
      });
      return;
    }

    const totalOffset = drag.baseOffset + (touch.clientX - drag.startX);

    if (!cancelled && Math.abs(totalOffset) >= SWIPE_THRESHOLD_PX) {
      goToNeighbor(totalOffset < 0 ? 1 : -1);
      return;
    }

    // 임계값 미달이거나 취소되면 현재 슬라이드로 되돌린다.
    setTrackState((state) => ({ ...state, animated: !prefersReducedMotion, dragOffset: 0 }));
  };

  const handleTouchEnd = (event) => {
    finishDrag(event, { cancelled: false });
  };

  const handleTouchCancel = (event) => {
    finishDrag(event, { cancelled: true });
  };

  // 드래그로 넘긴 직후 발생하는 클릭이 배너 CTA를 실행하지 않도록 캡처 단계에서 삼킨다.
  const handleViewportClickCapture = (event) => {
    if (!suppressClickRef.current) {
      return;
    }

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // CTA 클릭 — select_promotion 발화 후 페이지 액션 위임.
  const handleSlideCta = (slide, slideIndex) => {
    trackSelectPromotion(toPromotionParams(slide, slideIndex));
    onSlideAction?.(slide);
  };

  const handleTrackTransitionEnd = (event) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
      return;
    }

    setTrackState((state) => settleCloneParking(state, slideCount));
  };

  // 트랙은 width: 100%(뷰포트 폭)라 translateX의 %가 슬라이드 1장 폭과 일치한다.
  const trackStyle = {
    transform: `translateX(calc(${(trackState.virtualIndex + leadingCloneCount) * -100}% + ${trackState.dragOffset}px))`,
    transition: trackState.animated
      ? `transform ${TRACK_TRANSITION_MS}ms ${TRACK_TRANSITION_EASING}`
      : "none",
  };

  // 무한 루프용으로 앞뒤에 마지막/첫 슬라이드 클론을 붙인다. 클론은 항상 보조 화면(aria-hidden).
  const trackEntries = slides.map((slide, index) => ({ slide, slideIndex: index, cloneKey: null }));

  if (hasLoop) {
    trackEntries.unshift({ slide: slides[slideCount - 1], slideIndex: slideCount - 1, cloneKey: "tail" });
    trackEntries.push({ slide: slides[0], slideIndex: 0, cloneKey: "head" });
  }

  return (
    <section className="public-home-hero-banner" role="region" aria-label="히어로 배너">
      <div
        aria-atomic="true"
        aria-live="polite"
        className="public-home-hero-banner__viewport"
        onClickCapture={handleViewportClickCapture}
        onTouchCancel={hasLoop ? handleTouchCancel : undefined}
        onTouchEnd={hasLoop ? handleTouchEnd : undefined}
        onTouchMove={hasLoop ? handleTouchMove : undefined}
        onTouchStart={hasLoop ? handleTouchStart : undefined}
        ref={viewportRef}
      >
        <div
          className="public-home-hero-banner__track"
          onTransitionEnd={handleTrackTransitionEnd}
          ref={trackRef}
          style={trackStyle}
        >
          {trackEntries.map(({ slide, slideIndex, cloneKey }) => {
            const isActive = cloneKey === null && slideIndex === activeIndex;
            const hasImage = Boolean(slide.imageDesktop);
            const hasClickAction = Boolean(slide.actionType || slide.href);
            // 초기 LCP 이미지 = 첫 번째 실제 슬라이드(클론 제외)만 eager + 우선 로드.
            // 활성 슬라이드 기준이 아니라 마운트 시점 기준이라 회전해도 로딩 정책이 바뀌지 않는다.
            const isInitialLcpSlide = cloneKey === null && slideIndex === 0;

            const imageContent = (
              <picture>
                {slide.imageMobile ? <source media={MOBILE_IMAGE_MEDIA_QUERY} srcSet={slide.imageMobile} /> : null}
                <img
                  alt={slide.imageAlt ?? ""}
                  className="public-home-hero-banner__image"
                  decoding={isInitialLcpSlide ? undefined : "async"}
                  /* React 18은 camelCase fetchPriority 미지원 — 소문자 속성으로 DOM에 그대로 전달 */
                  fetchpriority={isInitialLcpSlide ? "high" : undefined}
                  loading={isInitialLcpSlide ? undefined : "lazy"}
                  src={slide.imageDesktop}
                />
              </picture>
            );

            return (
              <article
                aria-hidden={isActive ? "false" : "true"}
                aria-label={`슬라이드 ${slideIndex + 1}/${slideCount}`}
                aria-roledescription="slide"
                className={`public-home-hero-banner__slide ${isActive ? "is-active" : ""}`}
                key={cloneKey ? `${slide.id}-clone-${cloneKey}` : slide.id}
                style={
                  hasImage
                    ? undefined
                    : {
                        "--public-home-hero-cta-color": slide.ctaTextColor,
                        "--public-home-hero-gradient": `linear-gradient(${slide.gradient})`,
                      }
                }
              >
                {hasImage && hasClickAction ? (
                  <button
                    aria-hidden={isActive ? undefined : "true"}
                    className="public-home-hero-banner__image-button"
                    onClick={() => handleSlideCta(slide, slideIndex)}
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                  >
                    {imageContent}
                  </button>
                ) : hasImage ? (
                  <div aria-hidden={isActive ? undefined : "true"} className="public-home-hero-banner__image-static">
                    {imageContent}
                  </div>
                ) : (
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
                        onClick={() => handleSlideCta(slide, slideIndex)}
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        <span>{slide.ctaLabel}</span>
                      </button>
                    </div>
                  </ContentContainer>
                )}
              </article>
            );
          })}
        </div>

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
