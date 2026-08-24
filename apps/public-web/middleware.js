// 홈(/) 봇 프리렌더 라우팅 미들웨어 (배포 스테이징 루트에 복사됨 — deploy_public_web.ps1)
//
// vercel.deploy.json의 UA 조건부 rewrite는 정적 파일이 없는 경로(/faq, /store/…)에서만
// 동작한다 — Vercel이 파일시스템(dist/index.html)을 rewrite보다 먼저 확인해서, 루트(/)는
// rewrite로는 프리렌더에 연결할 수 없다(2026-08-24 preview 실측: /faq 프리렌더 OK·/ SPA).
// Routing Middleware는 파일시스템보다 먼저 실행되므로 / 요청만 여기서 UA로 분기한다.
//
// ⚠ api/와 동일한 의존성 제로 제약 — @vercel/functions의 rewrite()/next() 대신 그 헬퍼가
//   만드는 와이어 프로토콜 헤더(x-middleware-rewrite / x-middleware-next)를 직접 반환.
// ⚠ BOT 정규식은 vercel.deploy.json의 UA 정규식과 반드시 동기 유지
//   (복제 지점: /store/subject·series·instructor·/store/:id·/faq rewrite + 이 파일)

export const config = { matcher: "/" };

const BOT_UA_RE =
  /(yeti|naverbot|googlebot|google-inspectiontool|bingbot|kakaotalk-scrap|kakaostory-og-reader|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot|discordbot|applebot|petalbot|duckduckbot|baiduspider|yandexbot|daumoa|daum\/|daumwebmastertool|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|perplexitybot|perplexity-user|meta-externalagent|meta-externalfetcher|meta-webindexer|amazonbot|ccbot|bytespider|mistralai-user)/i;

export default function middleware(request) {
  try {
    const userAgent = request.headers.get("user-agent") || "";
    if (BOT_UA_RE.test(userAgent)) {
      return new Response(null, {
        headers: {
          "x-middleware-rewrite": new URL("/api/prerender-home", request.url).toString(),
        },
      });
    }
  } catch {
    // UA 판별 실패 시 사람 트래픽과 동일하게 통과 — 미들웨어 때문에 홈이 죽는 일은 없어야 한다
  }
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
