import { useEffect, useRef, useState } from "react";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";
import JeonilCouponDialog from "../components/JeonilCouponDialog";
import heroBg from "../assets/jeonil/hero-bg.webp";
import bookmarkImg from "../assets/jeonil/bookmark.webp";
import jeongwonImg from "../assets/jeonil/jeongwon.webp";
import gangsaCollage from "../assets/jeonil/gangsa-collage.webp";
import ansContent from "../assets/jeonil/ans-content.webp";
import card1Img from "../assets/jeonil/card-1.webp";
import card2Img from "../assets/jeonil/card-2.webp";
import card3Img from "../assets/jeonil/card-3.webp";
import secCoupon from "../assets/jeonil/sec-coupon.webp";
import seonggwaBg from "../assets/jeonil/seonggwa-bg.webp";
import j1Logo from "../assets/jeonil/j1.webp";
import cursorImg from "../assets/jeonil/cursor.webp";
import couponTicket from "../assets/jeonil/coupon-ticket.webp";
import "./PublicJeonilEventPage.css";

const JEONGWON_RATIO = "1600 / 362";
const R_GANGSA_C = "1493 / 653";
const R_ANS_C = "1493 / 629";
const R_CARD = "1508 / 715";
const R_COUPON = "1493 / 976";

const OPEN_YEAR = 2026;
const OPEN_MONTH = 9;
const OPEN_DAY = 3;
function getDDayLabel() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const open = new Date(OPEN_YEAR, OPEN_MONTH - 1, OPEN_DAY);
  const days = Math.round((open.getTime() - today.getTime()) / 86400000);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return "OPEN";
}

const REVIEWS = [
  {
    text: "수능이라는 자기자신과의 싸움에서 전일학원이 제 페이스에 맞춰 관리를 해주고 편안함을 주어서 성공할 수 있던 것 같습니다.",
    name: "이*호 · 연세대 의예과 합격",
  },
  {
    text: "압박이 심하고 강압적인 분위기의 다른 학원들과 다르게 학생들이 자율적으로 학습에 집중할 수 있도록 분위기를 조성해 주셔서 합격할 수 있었습니다.",
    name: "김*록 · 가톨릭대 의예과 합격",
  },
  {
    text: "이해가 부족한 부분을 정확하게 짚어주셔서 끈기 있게 공부할 수 있었습니다. 힘든 수험생 시기를 견디는 힘을 길러주셔서 감사합니다.",
    name: "조*우 · 서울대 자유전공학부 합격",
  },
  {
    text: "전일학원에서 공부하면서 제가 몰랐던 개념을 명확하게 알 수 있었습니다. 또 하나의 문제를 깊게 고민하며 여러 가지 풀이 방법을 체득할 수 있도록 도와주셔서 많은 도움이 되었습니다.",
    name: "서*훈 · 고려대 수학교육과 합격",
  },
];

// 성과 키워드 — 디자인 좌표(1920×1124 기준) 그대로 흩뿌려 배치
const ACHIEVEMENTS = [
  { label: "32년 입시교육", size: "lg", left: "9.8%", top: "40%" },
  { label: "SINCE 1994", size: "md", left: "15.3%", top: "49.4%" },
  { label: "토마토스쿨", size: "md", left: "6.7%", top: "59.9%" },
  { label: "고퀄리티 자체제작 교재", size: "lg", left: "8.2%", top: "77.3%" },
  { label: "재원생 약 140명", size: "md", left: "58.4%", top: "42.4%" },
  { label: "2026 SKY 46명·의치한약수 21명", size: "lg", accent: true, left: "52%", top: "54.2%" },
  { label: "강남대성 출신 강사팀", size: "lg", left: "65.3%", top: "73.2%" },
];

function HeroSection({ onNotify }) {
  return (
    <section className="jeonil-hero" style={{ backgroundImage: `url(${heroBg})` }}>
      <img
        className="jeonil-hero__bookmark"
        src={bookmarkImg}
        alt="한정판매 LIMITED EDITION"
        draggable={false}
      />
      <p className="jeonil-hero__line jeonil-hero__line--1">
        <b className="is-cyan">강남대성</b> 출신 강사진과의 <b>역대급</b> 콜라보!
      </p>
      <p className="jeonil-hero__line jeonil-hero__line--2">
        <b>대치동 상위 1%의 현강</b> 교재를 오직 <b>SUBOOK</b>에서 만나보세요
      </p>
      <h1 className="jeonil-hero__title">
        <span>전일</span>
        <i aria-hidden="true">✕</i>
        <span>수북</span>
      </h1>
      <button type="button" className="jeonil-hero__cta" onClick={onNotify}>
        <span aria-hidden="true">🚨</span> 지금 바로 알림 신청하러 가기{" "}
        <span aria-hidden="true">🚨</span>
      </button>
    </section>
  );
}

function ReviewsSection() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % REVIEWS.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="jeonil-reviews">
      <span className="jeonil-emoji jeonil-emoji--1" aria-hidden="true">
        😍
      </span>
      <span className="jeonil-emoji jeonil-emoji--2" aria-hidden="true">
        🥰
      </span>
      <p className="jeonil-reviews__eyebrow reveal-up">수강생 만족도 99%로 검증된</p>
      <h2 className="jeonil-reviews__title reveal-up">학생들의 이유있는 선택</h2>
      <div className="jeonil-reviews__stage">
        {REVIEWS.map((review, index) => {
          const rel = (index - active + REVIEWS.length) % REVIEWS.length;
          const pos =
            rel === 0 ? "center" : rel === 1 ? "right" : rel === REVIEWS.length - 1 ? "left" : "hidden";
          return (
            <article
              key={review.name}
              className={`jeonil-review jeonil-review--${pos}`}
              aria-hidden={pos !== "center"}
            >
              <p className="jeonil-review__text">{review.text}</p>
              <p className="jeonil-review__name">{review.name}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AchieveSection() {
  const stageRef = useRef(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      el?.classList.add("is-visible");
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.45 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="jeonil-achieve" style={{ backgroundImage: `url(${seonggwaBg})` }}>
      <div className="jeonil-achieve__veil" />
      <div className="jeonil-achieve__stage" ref={stageRef}>
        <p className="jeonil-achieve__sub reveal-up">30년의 대치동 입시 경력,</p>
        <h2 className="jeonil-achieve__title reveal-up">
          전일학원은 <span>성과</span>로 증명합니다.
        </h2>
        <img className="jeonil-achieve__logo" src={j1Logo} alt="" draggable={false} />
        {ACHIEVEMENTS.map((item, index) => (
          <span
            key={item.label}
            className={`jeonil-pill jeonil-pill--${item.size}${item.accent ? " jeonil-pill--accent" : ""}`}
            style={{ left: item.left, top: item.top, transitionDelay: `${index * 0.1}s` }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function PublicJeonilEventPage() {
  usePageMeta({
    title: "전일학원 × 수북 이벤트",
    description:
      "대치동 상위 1%의 현강 교재를 수북에서. 전일학원 × 수북 콜라보 한정판 교재 출시 알림 신청.",
  });

  const [couponOpen, setCouponOpen] = useState(false);
  const [dday] = useState(getDDayLabel);
  const couponRef = useRef(null);

  useEffect(() => {
    const selector =
      ".jeonil-page .jeonil-band, .jeonil-page .jeonil-books, .jeonil-page .jeonil-books-sec, .jeonil-page .jeonil-gangsa-sec, .jeonil-page .jeonil-answer-sec, .jeonil-page .reveal-up";
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(selector).forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(selector).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // 5초 동안 아무 조작이 없으면 아래로 자동 스크롤 (한 화면씩)
  useEffect(() => {
    if (couponOpen) {
      return undefined;
    }
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(autoScroll, 5000);
    };
    function autoScroll() {
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;
      if (!atBottom) {
        window.scrollBy({ top: Math.round(window.innerHeight * 0.82), behavior: "smooth" });
      }
      reset(); // 유휴 지속 시 5초마다 반복 (바닥이면 스크롤 없이 대기)
    }
    const events = ["wheel", "touchstart", "keydown", "pointerdown", "mousemove"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [couponOpen]);

  const blockCopy = (event) => event.preventDefault();
  const openCoupon = () => setCouponOpen(true);
  const scrollToCoupon = () => {
    couponRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <PublicPageFrame>
      <div
        className="jeonil-page"
        onContextMenu={blockCopy}
        onCopy={blockCopy}
        onDragStart={blockCopy}
      >
        <PublicSiteHeader />

        <main className="jeonil-main">
          <div className="jeonil-dday">
            <span className="jeonil-dday__label">
              전일학원 X 수북 콜라보 한정판 교재 출시까지
            </span>
            <span className="jeonil-dday__count">{dday}</span>
          </div>

          <HeroSection onNotify={scrollToCoupon} />

          <div className="jeonil-openbar">
            <span className="jeonil-openbar__text">
              <strong>9월 3일</strong>, 수북 단독 <strong>OPEN</strong>
            </span>
            <span className="jeonil-openbar__shine" aria-hidden="true" />
          </div>

          <img
            className="jeonil-band jeonil-band--flush"
            src={jeongwonImg}
            alt="지역이 달라도 좋은 교재를 만날 수 있도록 — 전일학원"
            draggable={false}
            style={{ aspectRatio: JEONGWON_RATIO }}
          />

          <ReviewsSection />
          <AchieveSection />

          {/* 강사진 (배경 그대로 · 타이틀 텍스트만 HTML로 순차 rise-up) */}
          <div className="jeonil-gangsa-sec">
            <div className="jeonil-gangsa-head">
              <span className="jeonil-htitle jeonil-gangsa-pill">강남대성 출신 강사팀</span>
              <p className="jeonil-htitle jeonil-gangsa-sub">수험생들을 1등급으로 이끌어줄</p>
              <h2 className="jeonil-htitle jeonil-gangsa-title">초호화 라인업 강사진 14인</h2>
            </div>
            <img className="jeonil-band jeonil-gangsa-collage" src={gangsaCollage} alt="전일학원 강사진" draggable={false} style={{ aspectRatio: R_GANGSA_C }} />
          </div>
          {/* 해답은 전일 X 수북에서 (남색 · 타이틀 텍스트만 HTML 순차 rise-up) */}
          <div className="jeonil-answer-sec">
            <div className="jeonil-answer-head">
              <p className="jeonil-htitle jeonil-answer-sub">2027 수능을 매듭짓는 마지막 선택,</p>
              <h2 className="jeonil-htitle jeonil-answer-title">
                해답은 전일 <span className="jeonil-x">×</span> 수북에서
              </h2>
            </div>
            <img className="jeonil-band" src={ansContent} alt="전일학원 × 수북 특장점" draggable={false} style={{ aspectRatio: R_ANS_C }} />
          </div>
          {/* 이제는 클릭 + 교재 (연라벤더 배경 · 타이틀 텍스트만 HTML 순차 rise-up) */}
          <section className="jeonil-books-sec">
            <div className="jeonil-click-head">
              <p className="jeonil-htitle jeonil-click-sub">대치동 학원에서만 풀던 콘텐츠,</p>
              <h2 className="jeonil-htitle jeonil-click-title">
                이제는 클릭 한 번에 집 앞까지 <span aria-hidden="true">🚚</span>
              </h2>
            </div>
            {/* 교재 3권 — 배경 위에 떠서 차례대로 등장 + 호버 확대 */}
            <div className="jeonil-books">
              <img className="jeonil-book" src={card1Img} alt="2027 J1 원트 미니모의고사 국어" draggable={false} style={{ aspectRatio: R_CARD }} />
              <img className="jeonil-book" src={card2Img} alt="2027 J1 원트 FULL 모의고사 국어" draggable={false} style={{ aspectRatio: R_CARD }} />
              <img className="jeonil-book" src={card3Img} alt="2027 J1 약술논술 토마토 모의고사" draggable={false} style={{ aspectRatio: R_CARD }} />
            </div>
          </section>

          {/* 쿠폰 + 마무리 (핫스팟/티켓/커서) */}
          <div className="jeonil-canvas jeonil-coupon-sec">
            <img className="jeonil-band" src={secCoupon} alt="지금 바로 신청하세요" draggable={false} style={{ aspectRatio: R_COUPON }} />
            <button
              ref={couponRef}
              type="button"
              className="jeonil-coupon-hotspot"
              onClick={openCoupon}
              aria-label="출시 알림 신청하고 쿠폰 받기"
            />
            <img className="jeonil-coupon-ticket" src={couponTicket} alt="" aria-hidden="true" draggable={false} />
            <img className="jeonil-cursor-img" src={cursorImg} alt="" aria-hidden="true" draggable={false} />
          </div>
        </main>

        <PublicFooter />
      </div>

      <JeonilCouponDialog open={couponOpen} onClose={() => setCouponOpen(false)} />
    </PublicPageFrame>
  );
}

export default PublicJeonilEventPage;
