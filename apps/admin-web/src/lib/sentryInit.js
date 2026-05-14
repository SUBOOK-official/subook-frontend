import * as Sentry from "@sentry/react";

/**
 * 어드민 Sentry 초기화 (선택).
 * VITE_SENTRY_DSN_ADMIN 또는 VITE_SENTRY_DSN 환경변수가 있을 때만 활성화.
 * 미설정 시 silent — ErrorBoundary + console.error만 동작.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN_ADMIN || import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || "production",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    initialScope: {
      tags: { app: "admin-web" },
    },
    beforeSend(event) {
      // 추가 PII 필터
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

export { Sentry };
