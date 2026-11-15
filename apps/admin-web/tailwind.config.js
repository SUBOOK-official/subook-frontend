import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/* ── 어드민 색 램프 (2026-11 토스 스타일 개편) ─────────────────────
   Tailwind 기본 팔레트 이름(slate/blue/rose/emerald/amber…)을 그대로 두고
   렌더 색만 바꾸는 구조다. 화면 코드의 유틸리티 클래스는 수정하지 않는다.
   기준값은 토스 디자인 시스템 공개 문서의 색상표:
   https://tossmini-docs.toss.im/tds-mobile/foundation/colors/
   글자로 쓰이는 단계(500 이상)는 흰 배경에서 읽히도록 한 단계씩 진하게 잡았다.
   ⚠ 이 오버라이드를 지우거나 램프 밖 계열(purple/cyan 등)을 새로 쓰지 말 것. */

// slate/gray 혼용을 막기 위해 두 이름 모두 같은 회색 램프를 가리킨다.
// 100 = 페이지 배경(#f2f4f6), 200 = 구분선, 500 = 보조 글자, 900 = 본문 글자.
const greyRamp = {
  50: "#f9fafb",
  100: "#f2f4f6",
  200: "#e5e8eb",
  300: "#d1d6db",
  400: "#8b95a1",
  500: "#6b7684",
  600: "#4e5968",
  700: "#333d4b",
  800: "#252c37",
  900: "#191f28",
  950: "#10151c",
};

// 토스 블루 — blue/sky 공용. 500 = 주요 버튼(#3182f6)
const blueRamp = {
  50: "#e8f3ff",
  100: "#c9e2ff",
  200: "#90c2ff",
  300: "#64a8ff",
  400: "#4593fc",
  500: "#3182f6",
  600: "#2272eb",
  700: "#1b64da",
  800: "#1957c2",
  900: "#194aa6",
  950: "#12357a",
};

// 레드(위험·오류) — rose/red 공용
const redRamp = {
  50: "#ffeeee",
  100: "#ffd4d6",
  200: "#feafb4",
  300: "#fb8890",
  400: "#f66570",
  500: "#f04452",
  600: "#e42939",
  700: "#d22030",
  800: "#bc1b2a",
  900: "#a51926",
  950: "#5e0e16",
};

// 그린(완료·정상) — emerald/green 공용. 600 이상은 흰 글자 대비를 위해 진하게.
const greenRamp = {
  50: "#f0faf6",
  100: "#d3f5e6",
  200: "#aeefd5",
  300: "#76e4b8",
  400: "#3fd599",
  500: "#03b26c",
  600: "#028450",
  700: "#066a42",
  800: "#06573a",
  900: "#064630",
  950: "#032b1c",
};

// 오렌지(경고·보류) — amber. 700 이상은 연한 배경 위 글자용으로 진하게.
const orangeRamp = {
  50: "#fff8e6",
  100: "#ffefc2",
  200: "#ffe0a0",
  300: "#ffcb6b",
  400: "#ffa927",
  500: "#fe9800",
  600: "#e67700",
  700: "#a85400",
  800: "#8f4700",
  900: "#733a00",
  950: "#452200",
};

// 보조 배지(indigo) — 블루와 구분되는 보라 기운의 중간색
const indigoRamp = {
  50: "#f1f1fd",
  100: "#e3e4fb",
  200: "#cacdf6",
  300: "#a8adee",
  400: "#858be3",
  500: "#676dd6",
  600: "#5158c4",
  700: "#4349a8",
  800: "#383d88",
  900: "#31356d",
  950: "#1e2042",
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(appRoot, "index.html"), resolve(appRoot, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        // 주요 동작색. 버튼 배경·테두리·포커스 링에 쓴다.
        brand: "#3182f6",
        "brand-soft": "#1b64da",
        slate: greyRamp,
        gray: greyRamp,
        blue: blueRamp,
        sky: blueRamp,
        indigo: indigoRamp,
        rose: redRamp,
        red: redRamp,
        emerald: greenRamp,
        green: greenRamp,
        amber: orangeRamp,
      },
      // 글자로 쓰는 brand는 흰 배경에서 읽히도록 한 단계 진한 블루.
      textColor: {
        brand: "#2272eb",
      },
      fontFamily: {
        // index.html에서 실제 로드하는 폰트만 선언
        sans: ["Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
      },
      // 모서리 단계를 한 칸씩 둥글게: 작은 버튼 8 · 버튼 10 · 카드 16 · 큰 카드/모달 20
      borderRadius: {
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
      // 카드는 그림자 없이, 떠 있는 요소(모달·토스트)만 옅고 넓게.
      boxShadow: {
        sm: "0 1px 2px rgba(2, 32, 71, 0.04)",
        DEFAULT: "0 2px 8px rgba(2, 32, 71, 0.06)",
        md: "0 4px 14px rgba(2, 32, 71, 0.08)",
        lg: "0 8px 24px rgba(2, 32, 71, 0.10)",
        xl: "0 12px 32px rgba(2, 32, 71, 0.12)",
        "2xl": "0 20px 48px rgba(2, 32, 71, 0.16)",
        soft: "0 8px 24px rgba(2, 32, 71, 0.08)",
      },
    },
  },
  plugins: [],
};
