// FAQ 프리렌더 (public-web /api/prerender-faq)
//
// /faq는 SPA 전용이라 JS 미실행 크롤러(네이버 Yeti, GPTBot·ClaudeBot·PerplexityBot 등
// AI 크롤러)가 내용을 전혀 읽지 못했다. vercel.deploy.json의 UA 조건부 rewrite가 봇의
// /faq 요청만 이 함수로 보내고, SPA와 동일 소스(list_public_faqs RPC)의 Q&A를 완성된
// HTML(FAQPage JSON-LD 포함)로 돌려준다. 일반 사용자는 기존 SPA를 그대로 받는다.
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (prerender-product.js와 동일).
// ⚠ 메타 문구·타이틀은 SPA(PublicFaqPage usePageMeta)와 동일하게 유지 — 클로킹 오해 방지 원칙.
// ⚠ 어드민 리치텍스트(HTML) 답변은 서버에서 richText.js 새니타이저를 쓸 수 없어(브라우저 전용)
//   태그를 전부 제거한 플레인 텍스트로 렌더한다. 텍스트 내용 자체는 SPA와 동일.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;

// SPA(PublicFaqPage usePageMeta)와 동일 문구
const PAGE_TITLE = "자주 묻는 질문 | 수북 SUBOOK";
const PAGE_DESCRIPTION =
  "수북 위탁판매 서비스의 수거·검수·등급·정산·결제·반품에 대한 자주 묻는 질문 모음.";
const CANONICAL_URL = `${SITE_ORIGIN}/faq`;

function resolveSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  // list_public_faqs는 공개 RPC라 anon 키가 정석. 런타임에 없으면 service 키 폴백.
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  return { url: url.replace(/\/+$/, ""), key };
}

async function fetchFaqs({ url, key }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/list_public_faqs`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`PostgREST HTTP ${response.status}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 어드민 리치텍스트(HTML) 답변 → 플레인 텍스트. 태그 제거 후 기본 엔티티만 복원.
// (이후 escapeHtml을 다시 거치므로 주입 위험 없음)
function htmlToPlainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function looksLikeRichHtml(value) {
  return /<[a-z][\s\S]*>/i.test(String(value ?? ""));
}

// DB row → { category, question, paragraphs } (SPA normalizeDbFaq와 동일 의미)
function normalizeFaqRow(row) {
  const rawAnswer = String(row.answer ?? "");
  const plainAnswer = looksLikeRichHtml(rawAnswer) ? htmlToPlainText(rawAnswer) : rawAnswer;
  const paragraphs = plainAnswer
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    category: String(row.category ?? "기타"),
    question: String(row.question ?? ""),
    paragraphs: paragraphs.length > 0 ? paragraphs : [plainAnswer],
  };
}

function buildHtml(faqs) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.paragraphs.join(" ") },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "자주 묻는 질문" },
      ],
    },
  ];

  const faqSections = faqs
    .map(
      (item) => `
      <section>
        <h2>[${escapeHtml(item.category)}] ${escapeHtml(item.question)}</h2>
        ${item.paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n        ")}
      </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(PAGE_TITLE)}</title>
    <meta name="description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <link rel="canonical" href="${CANONICAL_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(PAGE_TITLE)}" />
    <meta property="og:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <meta property="og:site_name" content="수북 SUBOOK" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:url" content="${CANONICAL_URL}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(PAGE_TITLE)}" />
    <meta name="twitter:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <main>
      <p><a href="${SITE_ORIGIN}/">수북 SUBOOK — 수능 교재 위탁판매 플랫폼</a> › 자주 묻는 질문</p>
      <article>
        <h1>자주 묻는 질문</h1>
${faqSections}
      </article>
      <nav>
        <a href="${SITE_ORIGIN}/">홈</a> · <a href="${SITE_ORIGIN}/pickup/new">교재 판매(수거 신청)</a> ·
        <a href="${SITE_ORIGIN}/notices">공지사항</a>
      </nav>
    </main>
  </body>
</html>
`;
}

function sendHtml(res, statusCode, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // 같은 URL이 사람(SPA)/봇(프리렌더)으로 갈리므로 캐시는 UA로 분리
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=604800");
  res.status(statusCode).send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const { url, key } = resolveSupabaseEnv();
  if (!url || !key) {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  try {
    const rows = await fetchFaqs({ url, key });
    const faqs = rows.map(normalizeFaqRow).filter((item) => item.question);
    if (faqs.length === 0) {
      // DB가 비어 있으면 SPA는 하드코딩 fallback을 쓰지만, 여기서 내용을 복제하면
      // 이중 관리가 되므로 503으로 크롤러 재시도를 유도한다 (빈 페이지 색인 방지).
      res.status(503).json({ error: "prerender unavailable", code: 503 });
      return;
    }
    sendHtml(res, 200, buildHtml(faqs));
  } catch {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
  }
}
