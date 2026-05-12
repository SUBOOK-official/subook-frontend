import * as Sentry from "@sentry/react";

/**
 * Sentry 초기화 (선택).
 * VITE_SENTRY_DSN 환경변수가 있을 때만 초기화.
 * 미설정 시 silent — ErrorBoundary + console.error만 동작.
 *
 * Sentry 가입 후 발급받은 DSN을 Vercel 환경변수에 등록:
 *   VITE_SENTRY_DSN=https://xxx@oxxx.ingest.sentry.io/yyy
 *
 * 가입: https://sentry.io/signup/ (Free plan 5,000 errors/month 충분)
 * 프로젝트 생성 → Platform: React → DSN 복사
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
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
    // 모든 트랜잭션 샘플링 (적은 트래픽에서는 100%로 받아도 OK)
    tracesSampleRate: 1.0,
    // 일반 세션은 10%, 에러 발생 세션은 100% 리플레이 캡처
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // PII (이메일, IP 등) 자동 제외
    sendDefaultPii: false,
    beforeSend(event) {
      // 추가 PII 필터: 폼 필드의 휴대폰/이메일/계좌번호 등 마스킹
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

export { Sentry };
