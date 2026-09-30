import { useEffect, useRef, useState } from "react";
import { getDetailImageUrl } from "../../lib/storageImage";
import { trackSelectPromotion, trackViewPromotion } from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";
import "./AutomaticHeroBanner.css";

function BannerArrow({ next = false }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={next ? { transform: "rotate(180deg)" } : undefined}>
    <path d="M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z" />
  </svg>;
}

function BannerCard({ slide, index, onSlideAction }) {
  const ref = useRef(null);
  const [failedImage, setFailedImage] = useState(false);
  const analytics = { promotionId: slide.id, promotionName: slide.title || slide.imageAlt, creativeSlot: `home_hero_${index + 1}` };
  useInViewOnce(ref, () => trackViewPromotion(analytics), { threshold: 0.5 });
  const content = <>
    {!failedImage && slide.imageDesktop && <picture>
      {slide.imageMobile && <source media="(max-width: 767px)" srcSet={slide.imageMobile} />}
      <img src={slide.productId ? getDetailImageUrl(slide.imageDesktop) : slide.imageDesktop} alt={slide.productId ? "" : slide.imageAlt || "수북 이벤트"}
        loading={index < 3 ? "eager" : "lazy"} fetchpriority={index === 0 ? "high" : "auto"} onError={() => setFailedImage(true)} />
    </picture>}
    {slide.productId && <>
      <span className="automatic-hero__shade" />
      <span className="automatic-hero__copy">
        <strong>{slide.summary}</strong>
        <span className="automatic-hero__title">{slide.title}</span>
        <small>{slide.isSoldOut ? "품절 · " : ""}{slide.priceLabel}</small>
      </span>
    </>}
  </>;
  const className = `automatic-hero__card${slide.productId ? " automatic-hero__card--book" : " automatic-hero__card--image"}`;
  return slide.href ? <a ref={ref} className={className} href={slide.href} onClick={(event) => {
    trackSelectPromotion(analytics);
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      onSlideAction(slide);
    }
  }}>{content}</a> : <div ref={ref} className={className}>{content}</div>;
}

export default function AutomaticHeroBanner({ slides, onSlideAction }) {
  const railRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const updatePagination = () => {
      const cardWidth = rail.firstElementChild?.getBoundingClientRect().width;
      if (!cardWidth || !rail.clientWidth) return;
      const perPage = Math.max(1, Math.round(rail.clientWidth / cardWidth));
      const total = Math.max(1, Math.ceil(slides.length / perPage));
      const current = Math.min(total, Math.max(1, Math.round(rail.scrollLeft / rail.clientWidth) + 1));
      setPagination((previous) => previous.current === current && previous.total === total ? previous : { current, total });
    };
    updatePagination();
    rail.addEventListener("scroll", updatePagination, { passive: true });
    const observer = new ResizeObserver(updatePagination);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", updatePagination);
      observer.disconnect();
    };
  }, [slides.length]);
  const move = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const target = direction > 0
      ? (rail.scrollLeft >= max - 4 ? 0 : Math.min(max, rail.scrollLeft + rail.clientWidth))
      : (rail.scrollLeft <= 4 ? max : Math.max(0, rail.scrollLeft - rail.clientWidth));
    rail.scrollTo({ left: target, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  useEffect(() => {
    if (paused || interacting || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let timer;
    const advance = () => {
      if (document.hidden) return;
      const rail = railRef.current;
      if (!rail || rail.getBoundingClientRect().bottom <= 0) return;
      const max = rail.scrollWidth - rail.clientWidth;
      rail.scrollTo({ left: rail.scrollLeft >= max - 4 ? 0 : Math.min(max, rail.scrollLeft + rail.clientWidth), behavior: "smooth" });
    };
    const startTimer = () => {
      window.clearInterval(timer);
      timer = window.setInterval(advance, mobileQuery.matches ? 1200 : 2500);
    };
    startTimer();
    mobileQuery.addEventListener("change", startTimer);
    return () => {
      window.clearInterval(timer);
      mobileQuery.removeEventListener("change", startTimer);
    };
  }, [paused, interacting, slides.length]);
  if (!slides.length) return null;
  return <section className="automatic-hero" aria-label="추천 교재와 이벤트 배너" aria-roledescription="캐러셀"
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocusCapture={() => setInteracting(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
    <div className="automatic-hero__rail" ref={railRef} onTouchStart={() => setPaused(true)}>
      {slides.map((slide, index) => <BannerCard key={slide.id} slide={slide} index={index} onSlideAction={onSlideAction} />)}
    </div>
    <div className="automatic-hero__controls">
      <span aria-label={`${pagination.total}페이지 중 ${pagination.current}페이지`}>{pagination.current} / {pagination.total}</span>
      <button type="button" aria-label="이전 배너" onClick={() => move(-1)}><BannerArrow /></button>
      <button type="button" aria-label={paused ? "배너 자동 넘김 시작" : "배너 자동 넘김 정지"} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "▶" : "Ⅱ"}</button>
      <button type="button" aria-label="다음 배너" onClick={() => move(1)}><BannerArrow next /></button>
    </div>
  </section>;
}
