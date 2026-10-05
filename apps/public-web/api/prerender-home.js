// 홈(/) 프리렌더 (public-web /api/prerender-home)
//
// 상품 상세·과목/시리즈/강사 랜딩·FAQ는 봇 프리렌더가 있는데 정작 브랜드 검색("수북"/
// "subook")의 핵심 페이지인 홈만 SPA 빈 셸 + noscript 폴백이었다. Yeti가 JS 렌더를 하기도
// 하지만(2026-08-20 서치어드바이저 실측) 항상은 아니고, JS 미실행 시 홈 콘텐츠가 통째로
// 비어 보인다. middleware.js가 봇의 / 요청만 이 함수로 보내고, 비로그인 홈과 동일한
// BEST 교재(list_public_store_products RPC)·판매/B2B 안내를 완성된 HTML로 돌려준다.
// (근거: 네이버 통합검색 "수북" 실측 2026-08-24 — subook.kr이 2페이지 웹문서로 밀림)
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (prerender-faq.js와 동일).
// ⚠ 타이틀·설명·h1·섹션 카피는 SPA(index.html, usePageMeta DEFAULT_*, PublicHomePage,
//   BestBooksSection/PickupCTA/B2bCTA)와 반드시 동기 유지.
// 홈에서 제거한 소개·신규 입고·SEO 링크 목록을 검색로봇 응답에만 남기지 않는다.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;
const BEST_BOOK_LIMIT = 12; // SPA publicHomeBestBooks HOME_BEST_BOOK_LIMIT와 동일

// SPA usePageMeta DEFAULT_TITLE / DEFAULT_DESCRIPTION 및 index.html과 동일
const PAGE_TITLE = "수북 SUBOOK | 수능 교재 구매·위탁판매";
const PAGE_DESCRIPTION =
  "수북(SUBOOK)은 수능 교재 구매·위탁판매 플랫폼입니다. 검수된 교재를 구매하고, 안 쓰는 교재는 수거부터 판매·정산까지 맡기세요.";
// index.html keywords와 동일 (구글은 무시하지만 네이버 등 국내 검색 대비)
const PAGE_KEYWORDS =
  "수북, subook, 수능, 교재, 책, 중고, 대치동, 거래, 중고 거래, 중고 교재, 수능 중고 교재, 대입, 입시, 수능 교재";
// PublicHomePage의 스크린리더용 단일 <h1>과 동일
const PAGE_H1 = "수북 SUBOOK, 수능 교재 구매·위탁판매";

function resolveSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  // list_public_store_products는 공개 RPC라 anon 키가 정석. 없으면 service 키 폴백.
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  return { url: url.replace(/\/+$/, ""), key };
}

// 비로그인 홈 BEST와 동일한 공개 RPC·인자. 일시 오류만 한 번 재시도한다.
async function fetchStoreProducts({ url, key }, attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/list_public_store_products`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_sort: "popular", p_limit: BEST_BOOK_LIMIT, p_offset: 0 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`PostgREST HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid product list");
    return rows;
  } catch (error) {
    if (attempt === 0 && (!error.status || error.status >= 500 || error.status === 429)) {
      return fetchStoreProducts({ url, key }, attempt + 1);
    }
    throw error;
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

// RPC row → 링크 목록 항목 (prerender-collection.js와 동일 실측 필드)
function normalizeRow(row) {
  const productId = row.product_id ?? row.id;
  if (productId == null) return null;
  const price = Number(row.price);
  const availableOptionCount = Number(row.available_option_count);
  return {
    productId: String(productId),
    title: String(row.title ?? "").trim(),
    price: Number.isFinite(price) && price > 0 ? price : null,
    isSoldOut: Number.isFinite(availableOptionCount) ? availableOptionCount === 0 : false,
  };
}

function dedupeItems(rows) {
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const item = normalizeRow(row);
    if (!item || !item.title || seen.has(item.productId)) continue;
    seen.add(item.productId);
    items.push(item);
  }
  return items;
}

function renderProductList(items) {
  return items
    .map((item) => {
      const priceText = item.price != null ? ` — ${item.price.toLocaleString("ko-KR")}원` : "";
      const soldOutText = item.isSoldOut ? " · 품절" : "";
      return `        <li><a href="${SITE_ORIGIN}/store/${item.productId}">${escapeHtml(item.title)}</a>${escapeHtml(priceText)}${soldOutText}</li>`;
    })
    .join("\n");
}

function buildHtml(bestItems) {
  const canonicalUrl = `${SITE_ORIGIN}/`;

  const jsonLd = [
    // index.html의 Organization·WebSite 구조화 데이터와 동일 — 브랜드 검색 결과용
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "수북 SUBOOK",
      url: "https://subook.kr",
      logo: "https://subook.kr/og-image.png",
      description: "수험생을 위한 수능 교재 위탁판매 플랫폼 — 수거·검수·판매·정산까지.",
      sameAs: [
        "https://blog.naver.com/subook_official",
        "https://instagram.com/subook.official",
        "https://pf.kakao.com/_xdhxdyn",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: "subook2025@gmail.com",
        availableLanguage: "Korean",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "수북",
      alternateName: ["SUBOOK", "수북 SUBOOK"],
      url: "https://subook.kr",
    },
    ...(bestItems.length === 0
      ? []
      : [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "BEST 교재",
            numberOfItems: bestItems.length,
            itemListElement: bestItems.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.title,
              url: `${SITE_ORIGIN}/store/${item.productId}`,
            })),
          },
        ]),
  ];

  // 섹션 타이틀·서브타이틀은 SPA BestBooksSection과 동일 카피.
  const bestSection =
    bestItems.length === 0
      ? ""
      : `      <section>
        <h2>BEST 교재</h2>
        <p>최근 30일, 가장 많은 주문에서 선택한 교재</p>
        <ul>
${renderProductList(bestItems)}
        </ul>
      </section>`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" sizes="64x64" href="https://subook.kr/favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="https://subook.kr/apple-touch-icon.png" />
    <title>${escapeHtml(PAGE_TITLE)}</title>
    <meta name="description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <meta name="keywords" content="${escapeHtml(PAGE_KEYWORDS)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(PAGE_TITLE)}" />
    <meta property="og:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <meta property="og:site_name" content="수북 SUBOOK" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og-image.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(PAGE_TITLE)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(PAGE_TITLE)}" />
    <meta name="twitter:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
    <meta name="twitter:image" content="${SITE_ORIGIN}/og-image.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(PAGE_H1)}</h1>
${bestSection}
      <section aria-label="교재 판매 안내">
        <p><a href="${SITE_ORIGIN}/sell">풀지않은 교재를 쉽게 판매하고 싶으신가요?</a></p>
        <p>교재를 집 밖에 꺼내놓기만 하면 수거 검수 판매 정산까지 전부 대행합니다</p>
      </section>
      <section aria-label="B2B 교재 공급 문의">
        <p><a href="${SITE_ORIGIN}/b2b">학원·교육기관 교재 B2B 공급 문의</a></p>
        <p>신간·모의고사·N제를 필요한 수량과 일정에 맞춰 공급해 드립니다.</p>
      </section>
      <nav>
        <p><a href="${SITE_ORIGIN}/sell">교재 판매 이용 안내</a> ·
        <a href="${SITE_ORIGIN}/b2b">학원·교육기관 B2B 교재 공급</a> ·
        <a href="${SITE_ORIGIN}/faq">자주 묻는 질문</a> ·
        <a href="${SITE_ORIGIN}/notices">공지사항</a> ·
        <a href="https://blog.naver.com/subook_official">수북 공식 블로그</a></p>
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
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  let bestRows;
  try {
    bestRows = await fetchStoreProducts({ url, key });
  } catch {
    // 수집 실패를 빈 재고로 색인시키지 않는다.
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }
  const bestItems = dedupeItems(bestRows);
  // 홈은 재고가 0이어도 브랜드 페이지로서 항상 색인 대상 (컬렉션과 달리 noindex 없음)
  sendHtml(res, 200, buildHtml(bestItems));
}
