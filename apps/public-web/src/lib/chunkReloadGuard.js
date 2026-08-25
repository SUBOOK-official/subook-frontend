/**
 * 배포 후 스테일 청크 자동 복구.
 *
 * 새 배포로 옛 해시 자산(JS/CSS)이 CDN에서 사라진 뒤, 이전 index.html을 들고 있는
 * 탭에서 라우트를 이동하면 동적 import가 실패한다:
 *   - "Failed to fetch dynamically imported module: …" (Chrome)
 *   - "'text/html' is not a valid JavaScript MIME type." (Safari, SPA 폴백 HTML 수신)
 *   - "Unable to preload CSS for …" (CSS 프리로드)
 * Vite는 이때 `vite:preloadError` 이벤트를 쏜다 — 1회 새로고침해 새 index.html을
 * 받으면 정상 복구된다. https://vite.dev/guide/build#load-error-handling
 *
 * ⚠ admin-web에 동일 파일이 복제되어 있음 — 수정 시 양쪽 동기화할 것.
 */

const RELOAD_AT_KEY = "subook-chunk-reload-at";
export const RELOAD_RETRY_WINDOW_MS = 30_000;

let reloading = false;

/** 직전 자동 새로고침으로도 못 고친 실패(오프라인 등)는 재시도하지 않고 ErrorBoundary로 넘긴다. */
export function shouldAutoReload(lastReloadAt, now) {
  return now - lastReloadAt >= RELOAD_RETRY_WINDOW_MS;
}

/** 스테일 청크 로딩 실패 계열인지 판별 (Chrome/Safari/Firefox 메시지 전부 커버). */
export function isChunkLoadError(error) {
  const message = String(error?.message ?? error ?? "");
  return /dynamically imported module|Unable to preload CSS|valid JavaScript MIME type|Importing a module script failed/i.test(
    message,
  );
}

/** 자동 새로고침이 시작된 뒤 페이지 교체 전까지 true — ErrorBoundary 깜빡임/중복 리포트 억제용. */
export function isChunkReloadPending() {
  return reloading;
}

export function installChunkReloadGuard() {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("vite:preloadError", (event) => {
    if (reloading) {
      event.preventDefault();
      return;
    }
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(sessionStorage.getItem(RELOAD_AT_KEY)) || 0;
    } catch {
      /* 접근 불가 시 0으로 두고 아래 기록 시도에서 판정 */
    }
    if (!shouldAutoReload(lastReloadAt, Date.now())) {
      return;
    }
    try {
      sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    } catch {
      return; // 기록 못 하면 무한 새로고침 위험 — 수동 새로고침 안내(ErrorBoundary)로 폴백
    }
    event.preventDefault(); // 에러 throw 억제: 새로고침 직전 에러 화면 깜빡임·Sentry 중복 방지
    reloading = true;
    window.location.reload();
  });
}
