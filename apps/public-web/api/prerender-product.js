// 상품 상세 봇 프리렌더 (public-web /api/prerender-product?id=N)
//
// 네이버 Yeti 등 JS 미실행 크롤러와 링크 스크래퍼(카톡·슬랙 미리보기)는 SPA를 못 읽는다.
// vercel.deploy.json의 UA 조건부 rewrite가 봇의 /store/:id 요청만 이 함수로 보내고,
// 여기서 실데이터 기반의 완성된 HTML(제목·가격·OG·JSON-LD·본문)을 돌려준다.
// 일반 사용자는 기존 SPA를 그대로 받는다 (dynamic rendering — 콘텐츠는 SPA와 동일 소스).
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (sitemap-products.js와 동일).
// ⚠ books는 RLS가 익명 조회를 막아(스토어는 RPC 경유) service 키로 읽되,
//   스토어프론트 공개 조건(status=on_sale AND is_public=true)만 그대로 적용한다.
// ⚠ 메타 문구·타이틀 패턴은 SPA(usePageMeta + PublicProductDetailPage)와 동일하게 유지 —
//   봇/사람 간 내용 불일치(클로킹 오해)를 만들지 않는 것이 원칙.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;

function resolveSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLIC_ANON_KEY ||
    "";
  return { url: url.replace(/\/+$/, ""), key };
}

async function fetchJson(requestUrl, key) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`PostgREST HTTP ${response.status}`);
    }
    return await response.json();
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

// storageImage.js(toSupabaseRenderUrl)의 최소 복제 — 원본 2MB 커버를 변환 URL로
function toRenderImageUrl(url, width, quality) {
  if (typeof url !== "string" || !url.includes("/storage/v1/object/public/")) {
    return url;
  }
  const [pathPart, existingQuery = ""] = url
    .replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
    .split("?", 2);
  const params = new URLSearchParams(existingQuery);
  params.set("width", String(width));
  params.set("quality", String(quality));
  params.set("resize", "contain");
  return `${pathPart}?${params.toString()}`;
}

// ai_summary(간단 마크다운)를 안전한 HTML로 — escape 후 **강조**와 줄바꿈만 변환
function aiSummaryToHtml(text) {
  if (!text) return "";
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

const GRADE_LABELS = { S: "S(새책)", "A+": "A+", A_PLUS: "A+", A: "A" };

function summarizeBooks(books) {
  const prices = books
    .map((book) => Number(book.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const gradeCounts = new Map();
  for (const book of books) {
    const grade = GRADE_LABELS[book.condition_grade] || book.condition_grade;
    if (!grade) continue;
    gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
  }
  return {
    stockCount: books.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    gradeSummary: [...gradeCounts.entries()]
      .map(([grade, count]) => `${grade} ${count}권`)
      .join(" · "),
    optionLabels: [...new Set(books.map((book) => book.option).filter(Boolean))],
  };
}

function buildHtml({ product, stock }) {
  // SPA(usePageMeta 호출부)와 동일한 타이틀·설명 패턴
  const pageTitle = `${product.title}${product.subject ? ` · ${product.subject}` : ""} | 수북 SUBOOK`;
  const description = `${product.title}${
    product.instructor_name ? ` (${product.instructor_name})` : ""
  } ${product.subject ?? ""} 위탁판매 — 검수 완료된 새 책 수준의 교재를 합리적인 가격에.`;
  const canonicalUrl = `${SITE_ORIGIN}/store/${product.id}`;
  const coverUrl = product.cover_image_url
    ? toRenderImageUrl(product.cover_image_url, 1200, 80)
    : `${SITE_ORIGIN}/og-image.png`;
  const isSoldOut = stock.stockCount === 0;
  const priceText =
    stock.minPrice != null ? `${stock.minPrice.toLocaleString("ko-KR")}원` : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: [coverUrl],
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    category: product.subject ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "KRW",
      ...(stock.minPrice != null ? { price: stock.minPrice } : {}),
      itemCondition: "https://schema.org/UsedCondition",
      availability: isSoldOut
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url: canonicalUrl,
    },
  };

  const infoRows = [
    ["과목", product.subject],
    ["출판사·브랜드", product.brand],
    ["교재 유형", product.book_type],
    ["연도", product.published_year],
    ["강사", product.instructor_name],
    ["구성·옵션", stock.optionLabels.join(", ")],
    ["검수 등급 재고", stock.gradeSummary],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("\n        ");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="수북 SUBOOK" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${escapeHtml(coverUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(coverUrl)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <main>
      <p><a href="${SITE_ORIGIN}/">수북 SUBOOK — 수능 교재 위탁판매 플랫폼</a></p>
      <article>
        <h1>${escapeHtml(product.title)}${product.option ? ` ${escapeHtml(product.option)}` : ""}</h1>
        <img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(product.title)} 표지" width="600" />
        <p>
          ${isSoldOut ? "현재 품절 — 재입고 알림을 신청할 수 있습니다." : `판매 중 · 재고 ${stock.stockCount}권`}
          ${priceText ? ` · <strong>${escapeHtml(priceText)}</strong>${stock.stockCount > 1 ? "부터" : ""}` : ""}
        </p>
        <table>
          <caption>상품 정보</caption>
        ${infoRows}
        </table>
        ${
          product.ai_summary
            ? `<section><h2>교재 소개</h2><p>${aiSummaryToHtml(product.ai_summary)}</p></section>`
            : ""
        }
        <p>
          모든 교재는 전문 검수를 거친 새 책 수준의 상품입니다.
          <a href="${canonicalUrl}">상품 페이지에서 구매하기</a>
        </p>
      </article>
      <nav>
        <a href="${SITE_ORIGIN}/">홈</a> · <a href="${SITE_ORIGIN}/pickup/new">교재 판매(수거 신청)</a> ·
        <a href="${SITE_ORIGIN}/faq">자주 묻는 질문</a>
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
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  res.status(statusCode).send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const id = String(req.query?.id ?? "");
  if (!/^\d+$/.test(id)) {
    sendHtml(res, 404, "<!doctype html><html lang=\"ko\"><head><title>상품을 찾을 수 없습니다</title></head><body><p>상품을 찾을 수 없습니다. <a href=\"https://subook.kr/\">수북 홈으로</a></p></body></html>");
    return;
  }

  const { url, key } = resolveSupabaseEnv();
  if (!url || !key) {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  try {
    const productSelect =
      "id,title,option,subject,brand,book_type,published_year,instructor_name,cover_image_url,status,ai_summary";
    const [productRows, bookRows] = await Promise.all([
      fetchJson(
        `${url}/rest/v1/products?id=eq.${id}&status=neq.hidden&select=${productSelect}&limit=1`,
        key,
      ),
      fetchJson(
        `${url}/rest/v1/books?product_id=eq.${id}&status=eq.on_sale&is_public=eq.true&select=price,condition_grade,option`,
        key,
      ),
    ]);

    const product = Array.isArray(productRows) ? productRows[0] : null;
    if (!product) {
      sendHtml(res, 404, "<!doctype html><html lang=\"ko\"><head><title>상품을 찾을 수 없습니다</title></head><body><p>상품을 찾을 수 없습니다. <a href=\"https://subook.kr/\">수북 홈으로</a></p></body></html>");
      return;
    }

    const stock = summarizeBooks(Array.isArray(bookRows) ? bookRows : []);
    sendHtml(res, 200, buildHtml({ product, stock }));
  } catch {
    // 실패 시 503 — 크롤러가 나중에 재시도 (빈 페이지를 색인시키지 않는다)
    res.status(503).json({ error: "prerender unavailable", code: 503 });
  }
}
