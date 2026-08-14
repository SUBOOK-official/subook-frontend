// PG 전자결제 심사 모드 (2026-08-14, 토스페이먼츠 카드사 심사 대응)
//
// 카드사 심사역이 실서비스 카드결제(나이스페이)에 영향을 주지 않고 토스 결제위젯을
// 확인할 수 있도록, `?pg=toss`로 진입한 브라우저 세션에 한해 주문서 결제창을 토스
// 결제위젯으로 강제한다. 파라미터 없는 일반 고객 흐름은 기존 그대로다.
// `?pg=off`로 진입하면 세션 강제를 해제한다.
//
// ⚠ 페이지 모듈이 전부 lazy라 /order 도착 시점엔 진입 URL의 파라미터가 사라져 있다.
//   반드시 App 부트 시점(App.jsx의 side-effect import)에 이 모듈이 평가되어야 한다.
// 토스 라이브 키 전환(고라이브) 시 이 파일과 사용처를 함께 제거한다.

const STORAGE_KEY = "subook-pg-override";

function capture() {
  try {
    const value = new URLSearchParams(window.location.search).get("pg");
    if (value === "toss") {
      window.sessionStorage.setItem(STORAGE_KEY, value);
      return value;
    }
    if (value === "off") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // 파라미터 없는 재진입(새로고침·결제 리다이렉트 복귀)은 같은 탭의 세션 값을 유지
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // sessionStorage 접근 불가 환경 — 심사 모드 없이 정상 동작
  }
}

export const PG_OVERRIDE = capture();
