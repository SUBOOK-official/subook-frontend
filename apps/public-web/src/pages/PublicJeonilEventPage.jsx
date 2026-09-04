import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { COLLAB_OPEN_AT } from "../lib/publicFeaturedProducts";
import { fetchFeaturedProductsByKey } from "../lib/publicFeaturedProductsApi";
import {
  makeOnceGuard,
  trackDialogOpen,
  trackEvent,
  trackException,
  trackSelectItem,
  trackSelectPromotion,
  trackViewPromotion,
} from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import JeonilCouponDialog from "../components/JeonilCouponDialog";
import JeonilProductChooserDialog from "../components/JeonilProductChooserDialog";
import heroBg from "../assets/jeonil/hero-bg.webp";
import bookmarkImg from "../assets/jeonil/bookmark.webp";
import gangsaCollage from "../assets/jeonil/gangsa-collage.webp";
import jeongwonImg from "../assets/jeonil/jeongwon.webp";
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

// 원장 사진 — 투명 배경 png 를 넣으면 자동으로 우선 사용 (없으면 webp 크롭 사용)
const wonjangModules = import.meta.glob("../assets/jeonil/wonjang.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});
const wonjangPhoto =
  Object.entries(wonjangModules).sort(
    ([a], [b]) => (b.endsWith(".png") ? 1 : 0) - (a.endsWith(".png") ? 1 : 0),
  )[0]?.[1] ?? null;

const R_GANGSA_C = "3840 / 1780";
const R_ANS_C = "3840 / 1605";
const JEONGWON_RATIO = "3840 / 883";
const R_CARD = "3009 / 1430";
const R_COUPON = "1493 / 976";

// GA4 프로모션 식별자 — 이벤트 페이지 전체가 하나의 프로모션 크리에이티브다.
const PROMOTION_ID = "jeonil_2026_09";
const PROMOTION_NAME = "전일학원 × 수북";
const BOOK_LIST_NAME = "전일학원 이벤트";

// 교재 카드 → 상품 상세 링크. key는 publicFeaturedProducts.js 레지스트리와 맞춘다.
// 아직 등록 전인 상품은 id를 못 찾으므로 링크 없이 이미지만 보여준다(죽은 링크 방지).
// choices: 카드 하나가 상품 여럿을 대표하면(미니 10회분/30일분) 링크 대신 선택 모달을 연다.
//   둘 중 하나만 등록돼 있으면 모달 없이 key 상품으로 바로 간다.
const BOOK_CARDS = [
  {
    key: "j1-mini",
    src: card1Img,
    alt: "2027 J1 원트 미니모의고사 국어",
    choices: [
      { key: "j1-mini-10", label: "10회분", desc: "SET A · SET B · SET C 중 선택" },
      { key: "j1-mini", label: "30일분", desc: "1-30회 전체 SET" },
    ],
  },
  { key: "j1-full", src: card2Img, alt: "2027 J1 원트 FULL 모의고사 국어" },
  { key: "j1-tomato", src: card3Img, alt: "2027 J1 약술논술 토마토 모의고사" },
];

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
  { label: "2026 SKY 46명\n의치한약수 21명", size: "lg", accent: true, left: "58%", top: "54.2%" },
  { label: "강남대성 출신 강사팀", size: "lg", left: "65.3%", top: "73.2%" },
];

function HeroSection({ isOpen, onNotify }) {
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
        <span aria-hidden="true">🚨</span>{" "}
        {isOpen ? "지금 바로 구매하러 가기" : "지금 바로 알림 신청하러 가기"}{" "}
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
  // 교재 카드 구성 선택 모달 — 열려 있으면 해당 카드(choices에 productId가 채워진 상태)
  const [chooserCard, setChooserCard] = useState(null);
  const [dday] = useState(getDDayLabel);
  const couponRef = useRef(null);
  const booksRef = useRef(null);
  // 판매 시작 여부 — 오픈 시각이 지나면 CTA가 '알림 신청'에서 '구매'로 바뀐다.
  // 상품 레지스트리와 같은 시각을 쓰므로 상품 화면과 어긋나지 않는다.
  const [isOpen] = useState(() => Date.now() >= Date.parse(COLLAB_OPEN_AT));
  // 교재 카드 링크용 상품 id — 등록 전이면 빈 객체라 카드는 링크 없이 그대로 보인다.
  const [featuredByKey, setFeaturedByKey] = useState({});
  // GA4 1회 발화 가드 — 프로모션 노출 / 링크 없는 카드 보고
  const promotionViewedRef = useRef(false);
  const unlinkedGuardRef = useRef(makeOnceGuard());

  // GA4 이벤트 페이지 노출 — 마운트당 1회, 오픈 전/후와 D-day를 함께 남긴다.
  useEffect(() => {
    if (promotionViewedRef.current) {
      return;
    }
    promotionViewedRef.current = true;
    trackViewPromotion({
      promotionId: PROMOTION_ID,
      promotionName: PROMOTION_NAME,
      creativeSlot: "event_page",
      releaseState: isOpen ? "open" : "pre",
      ddayLabel: dday,
    });
  }, [dday, isOpen]);

  useEffect(() => {
    let isCancelled = false;

    fetchFeaturedProductsByKey()
      .then((byKey) => {
        if (!isCancelled) {
          setFeaturedByKey(byKey);
        }
      })
      .catch((error) => {
        // GA4 — 교재 카드 링크용 상품 조회 실패(카드가 조용히 링크 없이 뜬다)
        trackException("jeonil_featured_load_failed", {
          errorMessage: error?.message ?? "",
        });
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // GA4 링크 없는 교재 카드 — 아직 등록 전이라 죽은 카드로 보이는 상태를 카드별 1회 보고.
  useEffect(() => {
    if (Object.keys(featuredByKey).length === 0) {
      return;
    }
    BOOK_CARDS.forEach((card) => {
      const linkedChoices = (card.choices ?? []).filter(
        (choice) => featuredByKey[choice.key]?.id != null,
      );
      const productId = featuredByKey[card.key]?.id ?? null;
      if (productId === null && linkedChoices.length <= 1 && unlinkedGuardRef.current(card.key)) {
        trackException("jeonil_book_card_unlinked", { cardKey: card.key });
      }
    });
  }, [featuredByKey]);

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

  // 상품 상세의 '알림 받기' 버튼 등에서 #coupon 으로 진입하면 쿠폰 신청 구역으로 스크롤.
  // 이미지 로드 후 레이아웃이 확정되도록 두 번(초기·지연) 스크롤한다.
  useEffect(() => {
    if (window.location.hash !== "#coupon") return undefined;
    // GA4 딥링크 진입 — 상품 상세의 '알림 받기'에서 넘어온 트래픽 구분용
    trackEvent("jeonil_coupon_scroll", { entry: "hash_deeplink" });
    const doScroll = () =>
      couponRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t1 = setTimeout(doScroll, 400);
    const t2 = setTimeout(doScroll, 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const blockCopy = (event) => event.preventDefault();
  const openCoupon = () => setCouponOpen(true);
  const scrollToCoupon = () => {
    couponRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // 오픈 후 CTA — 교재 카드로 보낸다 (카드마다 상품 상세로 이어진다).
  // 카드 묶음이 화면보다 길어서 center로 맞추면 첫 카드를 지나쳐 버린다 → start.
  const scrollToBooks = () => {
    booksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // GA4 히어로 CTA 클릭 — 오픈 전(알림 신청)·후(구매)로 목적지가 갈린다.
  const handleHeroCta = () => {
    trackSelectPromotion({
      promotionId: PROMOTION_ID,
      promotionName: PROMOTION_NAME,
      creativeSlot: "event_hero_cta",
      ctaAction: isOpen ? "scroll_books" : "scroll_coupon",
      releaseState: isOpen ? "open" : "pre",
    });
    if (isOpen) {
      scrollToBooks();
      return;
    }
    scrollToCoupon();
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

          <HeroSection isOpen={isOpen} onNotify={handleHeroCta} />

          <div className="jeonil-openbar">
            <span className="jeonil-openbar__text">
              <strong>9월 3일</strong>, 수북 단독 <strong>OPEN</strong>
            </span>
            <span className="jeonil-openbar__shine" aria-hidden="true" />
          </div>

          {/* 데스크탑: Figma 원본 이미지 그대로 */}
          <img
            className="jeonil-band jeonil-band--flush jeonil-jeongwon-img"
            src={jeongwonImg}
            alt="지역이 달라도 좋은 교재를 만날 수 있도록 — 전일학원"
            draggable={false}
            style={{ aspectRatio: JEONGWON_RATIO }}
          />
          {/* 모바일: 반응형 HTML */}
          <section className="jeonil-jeongwon">
            <div className="jeonil-jeongwon__inner">
              <div className="jeonil-jeongwon__lead">
                <p className="jeonil-jeongwon__l1">지역이 달라도, 좋은 교재를 만날 수 있도록.</p>
                <p className="jeonil-jeongwon__l2">
                  대치동과 유명 학원가에서만 접할 수 있었던 교재들을<br />
                  이제 수북이 전국의 학생들에게 연결합니다.
                </p>
                <p className="jeonil-jeongwon__l3">그 첫 번째 시작, 전일학원.</p>
              </div>
              <div className="jeonil-jeongwon__profile">
                <img className="jeonil-jeongwon__photo" src={wonjangPhoto} alt="전일권 전일학원 대표 원장" draggable={false} />
                <div className="jeonil-jeongwon__info">
                  <p className="jeonil-jeongwon__name">전일권<span>전일학원 대표 원장</span></p>
                  <ul className="jeonil-jeongwon__edu">
                    <li>고려대 교육대학원 국어교육학과</li>
                    <li>채널A &lsquo;성적을 부탁해 티처스&rsquo; 멘토 출연</li>
                    <li>117개 고등학교 특강 (포항제철고, 혜화여고, 부산외고 등)</li>
                  </ul>
                  <ul className="jeonil-jeongwon__career">
                    <li>전) 경향신문사 교육연구원장</li>
                    <li>전) 유웨이중앙교육 대표강사</li>
                    <li>전) 서초대일학원 공동원장</li>
                    <li>전) 박학천논술 대표강사</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <ReviewsSection />
          <AchieveSection />

          {/* 강사진 (배경 그대로 · 타이틀 텍스트만 HTML로 순차 rise-up) */}
          <div className="jeonil-gangsa-sec">
            <div className="jeonil-gangsa-head">
              <span className="jeonil-htitle jeonil-gangsa-pill">강남대성 출신 강사팀</span>
              <p className="jeonil-htitle jeonil-gangsa-sub">수험생들을 1등급으로 이끌어줄</p>
              <h2 className="jeonil-htitle jeonil-gangsa-title">초호화 라인업 강사진 14인</h2>
            </div>
            <div className="jeonil-gangsa-collage-wrap" style={{ aspectRatio: R_GANGSA_C }}>
              <img className="jeonil-band jeonil-gangsa-collage" src={gangsaCollage} alt="전일학원 강사진" draggable={false} />
              <figcaption className="jeonil-glabel jeonil-glabel--1">
                <b>이재호 선생님</b>
                <span>서울대 국어교육과</span>
                <span>前 강남 대성학원 강사</span>
                <span>前 대치 세정학원사 강사</span>
              </figcaption>
              <figcaption className="jeonil-glabel jeonil-glabel--2">
                <b>조승현 선생님</b>
                <span>서울대 영어교육과</span>
                <span>前 강남 대성학원 강사</span>
                <span>前 평가원/수능문제 개발</span>
              </figcaption>
              <figcaption className="jeonil-glabel jeonil-glabel--3">
                <b>허호승 선생님</b>
                <span>서울대 수학교육과</span>
                <span>前 강남대성 기숙(의대관) 강사</span>
              </figcaption>
              <figcaption className="jeonil-glabel jeonil-glabel--4">
                <b>권태진 선생님</b>
                <span>서울대 국어국문학과</span>
                <span>前 강남 대성학원 강사</span>
                <span>前 종로학원 본원 강사</span>
              </figcaption>
            </div>
          </div>
          {/* 해답은 전일 X 수북에서 (남색 · 타이틀 텍스트만 HTML 순차 rise-up) */}
          <div className="jeonil-answer-sec">
            <div className="jeonil-answer-head">
              <p className="jeonil-htitle jeonil-answer-sub">2027 수능을 매듭짓는 마지막 선택,</p>
              <h2 className="jeonil-htitle jeonil-answer-title">
                해답은 전일 <span className="jeonil-x">×</span> 수북에서
              </h2>
            </div>
            {/* 데스크탑: Figma 원본 이미지 */}
            <img className="jeonil-band jeonil-answer-img" src={ansContent} alt="전일학원 × 수북 특장점" draggable={false} style={{ aspectRatio: R_ANS_C }} />
            {/* 모바일: 반응형 HTML */}
            <div className="jeonil-compare">
              <div className="jeonil-compare__col jeonil-compare__col--jeonil">
                <span className="jeonil-compare__pill">전일학원</span>
                <p className="jeonil-compare__desc">
                  깊이 있는 교육 철학과 고퀄리티 자체 교재로
                  <b>상위권 학생들의 실력을 완성하는 대치동 재수 학원</b>
                </p>
                <div className="jeonil-compare__cards">
                  <div className="jeonil-compare__card">
                    <span className="jeonil-compare__ic jeonil-compare__ic--jeonil" aria-hidden="true">
                      <svg viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="15" r="6" stroke="currentColor" strokeWidth="3" />
                        <circle cx="11" cy="19" r="4.5" stroke="currentColor" strokeWidth="3" />
                        <circle cx="37" cy="19" r="4.5" stroke="currentColor" strokeWidth="3" />
                        <path d="M13 37c0-6 5-10 11-10s11 4 11 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        <path d="M4 35c0-4 3-7 7-7M44 35c0-4-3-7-7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <b>검증된 강사진</b>
                    <span>상위권 전문 강사진</span>
                  </div>
                  <div className="jeonil-compare__card">
                    <span className="jeonil-compare__ic jeonil-compare__ic--jeonil" aria-hidden="true">
                      <svg viewBox="0 0 48 48" fill="none">
                        <rect x="7" y="8" width="34" height="23" rx="2.5" stroke="currentColor" strokeWidth="3" />
                        <path d="M14 16h13M14 22h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        <circle cx="24" cy="38" r="3.5" stroke="currentColor" strokeWidth="3" />
                        <path d="M18 31v-4M30 31v-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <b>학생 중심 철학</b>
                    <span>&lsquo;토마토스쿨&rsquo; 운영</span>
                  </div>
                </div>
              </div>
              <div className="jeonil-compare__col jeonil-compare__col--subook">
                <span className="jeonil-compare__pill">수북</span>
                <p className="jeonil-compare__desc">
                  좋은 교재는 더 많은 학생들이 함께해야 한다는 믿음으로
                  <b>프리미엄 대치동 교재들을 전국으로 유통하는 수험서 전문 플랫폼</b>
                </p>
                <div className="jeonil-compare__cards">
                  <div className="jeonil-compare__card">
                    <span className="jeonil-compare__ic jeonil-compare__ic--subook" aria-hidden="true">
                      <svg viewBox="0 0 48 48" fill="none">
                        <circle cx="11" cy="24" r="5" stroke="currentColor" strokeWidth="3" />
                        <circle cx="36" cy="12" r="5" stroke="currentColor" strokeWidth="3" />
                        <circle cx="36" cy="36" r="5" stroke="currentColor" strokeWidth="3" />
                        <path d="M15.5 21.5 31.5 14M15.5 26.5 31.5 34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <b>전국 유통</b>
                    <span>지역의 한계를 넘어</span>
                  </div>
                  <div className="jeonil-compare__card">
                    <span className="jeonil-compare__ic jeonil-compare__ic--subook" aria-hidden="true">
                      <svg viewBox="0 0 48 48" fill="none">
                        <path d="M24 10 44 18 24 26 4 18 24 10Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                        <path d="M12 22v9c0 3 5.5 6 12 6s12-3 12-6v-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        <path d="M44 18v9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <b>더 많은 기회</b>
                    <span>모두에게 열린 교육</span>
                  </div>
                </div>
              </div>
            </div>
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
            <div className="jeonil-books" ref={booksRef}>
              {BOOK_CARDS.map((card, index) => {
                const productId = featuredByKey[card.key]?.id ?? null;
                const image = (
                  <img
                    className="jeonil-book"
                    src={card.src}
                    alt={card.alt}
                    draggable={false}
                    style={{ aspectRatio: R_CARD }}
                  />
                );

                // 카드가 상품 여럿을 대표하고 둘 이상 등록돼 있으면 링크 대신 선택 모달
                const choices = (card.choices ?? [])
                  .map((choice) => ({ ...choice, productId: featuredByKey[choice.key]?.id ?? null }))
                  .filter((choice) => choice.productId !== null);
                if (choices.length > 1) {
                  return (
                    <button
                      className="jeonil-book-link jeonil-book-link--button"
                      key={card.key}
                      type="button"
                      onClick={() => {
                        // GA4 구성 선택 모달 열기 (10회분/30일분 등 카드 하나가 상품 여럿)
                        trackDialogOpen("jeonil_product_chooser", {
                          cardKey: card.key,
                          itemCount: choices.length,
                          index,
                        });
                        setChooserCard({ ...card, choices });
                      }}
                      aria-haspopup="dialog"
                      aria-label={`${card.alt} 구성 선택`}
                    >
                      {image}
                    </button>
                  );
                }

                // 상품이 아직 등록되지 않았으면 링크 없이 이미지만 (죽은 링크 방지)
                return productId === null ? (
                  <span className="jeonil-book-link" key={card.key}>
                    {image}
                  </span>
                ) : (
                  <Link
                    className="jeonil-book-link"
                    key={card.key}
                    onClick={() =>
                      // GA4 이벤트 페이지 → 상품 상세 (목록 성과 비교용 select_item)
                      trackSelectItem(BOOK_LIST_NAME, {
                        productId,
                        title: card.alt,
                        quantity: 1,
                        index,
                      })
                    }
                    to={`/store/${productId}`}
                    aria-label={`${card.alt} 상품 보러가기`}
                  >
                    {image}
                  </Link>
                );
              })}
            </div>
          </section>

          {/* 쿠폰 + 마무리 (핫스팟/티켓/커서).
              판매가 시작되면 '출시 알림 신청' 자리는 통째로 걷어낸다. 다만 마무리 문구
              띠가 같은 이미지 아래쪽에 구워져 있어, 그 부분만 남기고 위를 잘라낸다
              (--closed). 잘라내는 높이는 CSS의 aspect-ratio로 맞춘다. */}
          {isOpen ? (
            <div className="jeonil-canvas jeonil-coupon-sec jeonil-coupon-sec--closed">
              <img
                className="jeonil-band"
                src={secCoupon}
                alt="여러분의 2027학년도 대입성공을 전일학원과 수북이 응원하겠습니다"
                draggable={false}
              />
            </div>
          ) : (
            <div className="jeonil-canvas jeonil-coupon-sec">
              <img className="jeonil-band" src={secCoupon} alt="" draggable={false} style={{ aspectRatio: R_COUPON }} />
              <h2 className="jeonil-coupon-title">지금 바로 신청하세요</h2>
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
          )}
        </main>

        <PublicFooter />
      </div>

      {/* dialog_open/close는 다이얼로그 내부에서 1회만 발화한다(entry는 진입 경로 힌트) */}
      <JeonilCouponDialog entry="hotspot" open={couponOpen} onClose={() => setCouponOpen(false)} />
      <JeonilProductChooserDialog card={chooserCard} onClose={() => setChooserCard(null)} />
    </PublicPageFrame>
  );
}

export default PublicJeonilEventPage;
