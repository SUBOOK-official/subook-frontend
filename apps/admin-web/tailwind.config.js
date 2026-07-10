import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/* ── 브랜드 램프 ──────────────────────────────────────────────
   Tailwind 기본 팔레트(slate/blue/rose/emerald/amber…)를 브랜드 파생
   램프로 오버라이드한다. 클래스명은 그대로 두고 렌더 색만 바뀌는 구조라
   기존 799곳의 유틸리티 사용처를 수정할 필요가 없다.
   명도는 Tailwind 원본 스텝과 근사하게 유지 → 기존 대비(AA) 조합 보존.
   public-web의 --public-ds-* 토큰과 같은 앵커를 쓴다:
   네이비 #080F47 · 레드 #D0342C · 그린 #2E7D4F · 웜 #C9861B · 순수 뉴트럴 */

// slate/gray 혼용을 막기 위해 두 이름 모두 같은 뉴트럴 램프를 가리킨다.
const neutralRamp = {
  50: "#f9f9f9",
  100: "#f2f2f3",
  200: "#e4e4e6",
  300: "#d1d1d4",
  400: "#9d9da3",
  500: "#6e6e73",
  600: "#55565b",
  700: "#3f4045",
  800: "#2a2b2f",
  900: "#1c1d20",
  950: "#121215",
};

// 브랜드 네이비 — blue/sky 공용. 앵커: 700=#080F47(primary), 50=#F3FBFF(secondary)
const navyRamp = {
  50: "#f3fbff",
  100: "#e2ecf9",
  200: "#c6d4ef",
  300: "#9fb0e0",
  400: "#7186c9",
  500: "#4859ab",
  600: "#25308b",
  700: "#080f47",
  800: "#070c3a",
  900: "#050a2e",
  950: "#03061d",
};

// 브랜드 레드(danger) — rose/red 공용 (admin은 danger를 rose-*로 사용)
const dangerRamp = {
  50: "#fdf1f0",
  100: "#f9dedb",
  200: "#f2c7c3",
  300: "#e8a19a",
  400: "#de6f64",
  500: "#d94b40",
  600: "#d0342c",
  700: "#b02a23",
  800: "#8f231d",
  900: "#741d18",
  950: "#400e0b",
};

// 브랜드 그린 — emerald/green 공용
const successRamp = {
  50: "#ecf5ef",
  100: "#d6e9dd",
  200: "#b5d7c3",
  300: "#8abfa0",
  400: "#57a077",
  500: "#3b8f60",
  600: "#2e7d4f",
  700: "#276b44",
  800: "#22573a",
  900: "#1d4830",
  950: "#0e2a1b",
};

// 웜 앰버(경고·보류 상태)
const warmRamp = {
  50: "#fdf8ec",
  100: "#f8f0db",
  200: "#edd9a3",
  300: "#e2c377",
  400: "#d9a62e",
  500: "#c9861b",
  600: "#b3741a",
  700: "#96600f",
  800: "#7d5514",
  900: "#6b4a12",
  950: "#3f2b0a",
};

// 페리윙클(보조 배지) — public --public-type(#939ed2) 계열
const periwinkleRamp = {
  50: "#eef0f8",
  100: "#e0e3f2",
  200: "#c8cde6",
  300: "#a9b1d8",
  400: "#8d97c8",
  500: "#6f79b0",
  600: "#565e9e",
  700: "#474e8c",
  800: "#3a4070",
  900: "#303456",
  950: "#1d2038",
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(appRoot, "index.html"), resolve(appRoot, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        brand: "#080F47",
        "brand-soft": "#111D73",
        slate: neutralRamp,
        gray: neutralRamp,
        blue: navyRamp,
        sky: navyRamp,
        indigo: periwinkleRamp,
        rose: dangerRamp,
        red: dangerRamp,
        emerald: successRamp,
        green: successRamp,
        amber: warmRamp,
      },
      fontFamily: {
        // index.html에서 실제 로드하는 폰트만 선언
        sans: ["Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 24px rgba(20, 24, 28, 0.08)",
      },
    },
  },
  plugins: [],
};
