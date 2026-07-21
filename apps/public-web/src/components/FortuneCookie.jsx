import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { FORTUNE_COOKIE_MESSAGES } from "../lib/fortuneCookieMessages";
import "./FortuneCookie.css";

// 홈 화면에 🥠 포춘쿠키가 둥둥 떠다니고, 톡 누르면 오늘의 한마디가 뜬다.
// - 하루 1회만 뽑을 수 있다(localStorage 날짜 기록). 이미 뽑은 날은 조용히 잠든다.
// - "이제 그만 볼래요"로 영구 opt-out 가능(localStorage).
// - 모션 최소화 사용자는 index.css 전역 룰이 애니메이션을 끄므로 쿠키가 제자리에 뜬다.

const OPTOUT_KEY = "subook_fortune_optout";
const LAST_KEY = "subook_fortune_last";
const APPEAR_DELAY_MS = 1500;

// 화면에 떠다닐 쿠키. pointer-events는 쿠키에만 부여해 나머지 화면 클릭을 방해하지 않는다.
const COOKIES = [
  { pos: { top: "24%", right: "13%" }, size: 46, drift: "b", dur: 12 },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode 등에서 setItem 실패는 무시 (기능만 못 쓸 뿐) */
  }
}

function FortuneCookie() {
  // idle → floating(쿠키 노출) → open(모달) → closed(끝)
  const [phase, setPhase] = useState("idle");
  const [fortune, setFortune] = useState("");
  const overlayRef = useRef(null);
  const cardRef = useRef(null);

  const isOpen = phase === "open";
  useFocusTrap(cardRef, isOpen);

  // 노출 자격 판단: opt-out 했거나 오늘 이미 뽑았으면 안 띄운다.
  useEffect(() => {
    if (readLocal(OPTOUT_KEY) === "1") return undefined;
    if (readLocal(LAST_KEY) === todayStr()) return undefined;
    const timer = window.setTimeout(() => setPhase("floating"), APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // 모달 열림 동안: ESC 닫기 + 배경 스크롤 잠금 + 첫 버튼 포커스
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPhase("closed");
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const draw = () => {
    const list = FORTUNE_COOKIE_MESSAGES;
    setFortune(list[Math.floor(Math.random() * list.length)] ?? "");
    writeLocal(LAST_KEY, todayStr()); // 하루 1회 — 뽑는 순간 오늘 날짜 기록
    setPhase("open");
  };

  const closeModal = () => setPhase("closed");

  const optOut = () => {
    writeLocal(OPTOUT_KEY, "1");
    setPhase("closed");
  };

  if (phase === "floating") {
    return (
      <div className="fc-layer" aria-hidden="false">
        {COOKIES.map((cookie, index) => (
          <button
            aria-label="포춘쿠키 열기 — 오늘의 한마디"
            className="fc-cookie"
            key={index}
            onClick={draw}
            style={{ ...cookie.pos, fontSize: `${cookie.size}px`, animationDelay: `${index * 0.12}s` }}
            type="button"
          >
            <span
              aria-hidden="true"
              className="fc-cookie__inner"
              style={{ animationName: `fc-drift-${cookie.drift}`, animationDuration: `${cookie.dur}s` }}
            >
              🥠
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (isOpen) {
    return (
      <div
        aria-label="오늘의 포춘쿠키"
        aria-modal="true"
        className="fc-modal"
        onClick={(event) => {
          if (event.target === overlayRef.current) closeModal();
        }}
        ref={overlayRef}
        role="dialog"
      >
        <div className="fc-modal__card" ref={cardRef}>
          <button aria-label="닫기" className="fc-modal__close" onClick={closeModal} type="button">
            ✕
          </button>
          <span aria-hidden="true" className="fc-modal__cookie">🥠</span>
          <p className="fc-modal__label">오늘의 포춘쿠키</p>
          <p className="fc-modal__msg">{fortune}</p>
          <p className="fc-modal__sub">내일 또 만나요</p>
          <button className="fc-modal__optout" onClick={optOut} type="button">
            앞으로 포춘쿠키를 보지 않을래요
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default FortuneCookie;
