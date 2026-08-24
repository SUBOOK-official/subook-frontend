// 홈(/) 프리렌더 (public-web /api/prerender-home)
//
// 상품 상세·과목/시리즈/강사 랜딩·FAQ는 봇 프리렌더가 있는데 정작 브랜드 검색("수북"/
// "subook")의 핵심 페이지인 홈만 SPA 빈 셸 + noscript 폴백이었다. Yeti가 JS 렌더를 하기도
// 하지만(2026-08-20 서치어드바이저 실측) 항상은 아니고, JS 미실행 시 홈 콘텐츠가 통째로
// 비어 보인다. vercel.deploy.json의 UA 조건부 rewrite가 봇의 / 요청만 이 함수로 보내고,
// SPA 홈과 동일 소스(list_public_store_products RPC)의 BEST 교재·신규 입고 목록 +
// 브랜드 소개를 완성된 HTML로 돌려준다.
// (근거: 네이버 통합검색 "수북" 실측 2026-08-24 — subook.kr이 2페이지 웹문서로 밀림)
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (prerender-faq.js와 동일).
// ⚠ 타이틀·설명·h1·섹션 카피는 SPA(index.html, usePageMeta DEFAULT_*, PublicHomePage,
//   BestBooksSection/LatestArrivalsSection)와 반드시 동기 유지 — 클로킹 오해 방지 원칙.
// ⚠ 과목·시리즈·강사 링크 목록은 sitemap-pages.xml·prerender-collection.js와 동기 유지.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;
const BEST_BOOK_LIMIT = 12; // SPA publicHomeBestBooks HOME_BEST_BOOK_LIMIT와 동일
const LATEST_BOOK_LIMIT = 8; // SPA publicHomeLatestBooks HOME_LATEST_BOOK_LIMIT와 동일

// SPA usePageMeta DEFAULT_TITLE / DEFAULT_DESCRIPTION (구 식스샵 SEO 카피)와 동일
const PAGE_TITLE = "수북 | 수능을 위한 가장 똑똑한 선택";
const PAGE_DESCRIPTION =
  "당신의 수험이, 다음 사람의 시작이 됩니다. 전문 검수를 마친 새 수능 교재, 대치동 교재, 실전 모의고사를 저렴한 가격에 판매합니다.";
// index.html keywords와 동일 (구글은 무시하지만 네이버 등 국내 검색 대비)
const PAGE_KEYWORDS =
  "수북, subook, 수능, 교재, 책, 중고, 대치동, 거래, 중고 거래, 중고 교재, 수능 중고 교재, 대입, 입시, 수능 교재";
// PublicHomePage의 시각적으로 숨겨진 단일 <h1>과 동일
const PAGE_H1 = "수능 교재 위탁판매 — 안 쓴 교재를 합리적인 가격에 | 수북";

// ⚠ sitemap-pages.xml 과목 랜딩 목록과 동기 유지
const SUBJECTS = ["국어", "수학", "영어", "과학", "사회", "한국사"];

// ⚠ src/lib/publicStoreCollections.js + prerender-collection.js와 동기 유지
const SERIES_COLLECTIONS = [
  { slug: "숏컷", label: "시대인재 숏컷" },
  { slug: "볼텍스", label: "시대인재 볼텍스" },
  { slug: "엣지", label: "시대인재 엣지" },
  { slug: "브릿지", label: "시대인재 브릿지" },
  { slug: "엑셀러레이터", label: "시대인재 엑셀러레이터" },
  { slug: "서바이벌", label: "시대인재 서바이벌" },
  { slug: "강기본", label: "강기본" },
];
const INSTRUCTOR_COLLECTIONS = [
  { slug: "박종민", name: "박종민", subject: "수학" },
  { slug: "이동준", name: "이동준", subject: "수학" },
  { slug: "안가람", name: "안가람", subject: "수학" },
  { slug: "김현우", name: "김현우", subject: "수학" },
  { slug: "김범찬", name: "김범찬", subject: "수학" },
  { slug: "이신혁", name: "이신혁", subject: "지구과학" },
  { slug: "김강민", name: "김강민", subject: "화학" },
  { slug: "손창빈", name: "손창빈", subject: "국어" },
  { slug: "현우진", name: "현우진", subject: "수학" },
  { slug: "강민철", name: "강민철", subject: "국어" },
  { slug: "백호", name: "백호", subject: "생명과학" },
];

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

// SPA fetchStorefrontProducts와 동일 RPC·인자 (sort: popular | latest)
async function fetchStoreProducts({ url, key, sort, limit }) {
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
      body: JSON.stringify({ p_sort: sort, p_limit: limit, p_offset: 0 }),
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

function buildHtml({ bestItems, latestItems, totalCount }) {
  const canonicalUrl = `${SITE_ORIGIN}/`;

  const jsonLd = [
    // index.html의 Organization·WebSite 구조화 데이터와 동일 — 브랜드 검색 결과용
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "수북 (SUBOOK)",
      url: "https://subook.kr",
      logo: "https://subook.kr/og-image.png",
      description: "수험생을 위한 수능 교재 위탁판매 플랫폼 — 수거·검수·판매·정산까지.",
      sameAs: ["https://instagram.com/subook.official", "https://pf.kakao.com/_xdhxdyn"],
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

  const subjectLinks = SUBJECTS.map(
    (subject) =>
      `<a href="${SITE_ORIGIN}/store/subject/${encodeURIComponent(subject)}">${escapeHtml(subject)} 교재</a>`,
  ).join(" · ");
  const seriesLinks = SERIES_COLLECTIONS.map(
    (item) =>
      `<a href="${SITE_ORIGIN}/store/series/${encodeURIComponent(item.slug)}">${escapeHtml(item.label)} 교재</a>`,
  ).join(" · ");
  const instructorLinks = INSTRUCTOR_COLLECTIONS.map(
    (item) =>
      `<a href="${SITE_ORIGIN}/store/instructor/${encodeURIComponent(item.slug)}">${escapeHtml(`${item.name} ${item.subject}`)} 교재</a>`,
  ).join(" · ");

  const totalCountText =
    totalCount > 0 ? `<p>현재 판매 중인 검수 완료 교재 ${totalCount.toLocaleString("ko-KR")}종</p>` : "";

  // 섹션 타이틀·서브타이틀은 SPA(BestBooksSection/LatestArrivalsSection)와 동일 카피
  const bestSection =
    bestItems.length === 0
      ? ""
      : `      <section>
        <h2>BEST 교재</h2>
        <p>지금 가장 많이 팔리는 교재</p>
        <ul>
${renderProductList(bestItems)}
        </ul>
      </section>`;
  const latestSection =
    latestItems.length === 0
      ? ""
      : `      <section>
        <h2>신규 입고</h2>
        <p>방금 들어온 따끈따끈한 교재</p>
        <ul>
${renderProductList(latestItems)}
        </ul>
      </section>`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
      <p>
        수북(SUBOOK)은 수험생을 위한 수능 교재 위탁판매 플랫폼입니다. 안 쓴 수능 교재를
        무료 방문 수거로 보내면 전문 검수를 거쳐 판매하고, 판매된 금액은 매월 정산해
        드립니다. 검수를 통과한 새 책 수준의 수능특강·수능완성·기출 문제집 등 수능 교재를
        합리적인 가격에 구매할 수도 있습니다.
      </p>
      ${totalCountText}
      <section>
        <h2>수능 끝, 안 쓴 교재를 합리적인 가격에</h2>
        <p>검수 완료 · 정가 대비 최대 60% 할인 — 원하는 교재를 바로 찾아보세요.</p>
        <p><a href="${SITE_ORIGIN}/">교재 보러가기</a></p>
      </section>
      <section>
        <h2>집에 쌓인 교재, 정산금으로 돌려받으세요</h2>
        <p>수거부터 검수, 판매, 정산까지 한 번에 — 포장만 해두시면 나머지는 수북이 합니다.</p>
        <p><a href="${SITE_ORIGIN}/pickup/new">판매 신청하기</a></p>
      </section>
${bestSection}
${latestSection}
      <nav>
        <p>과목별 교재: ${subjectLinks}</p>
        <p>시리즈별 교재: ${seriesLinks}</p>
        <p>강사별 교재: ${instructorLinks}</p>
        <p><a href="${SITE_ORIGIN}/pickup/new">교재 판매(수거 신청)</a> ·
        <a href="${SITE_ORIGIN}/faq">자주 묻는 질문</a> ·
        <a href="${SITE_ORIGIN}/notices">공지사항</a></p>
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

  // BEST(인기순)·신규 입고(최신순)를 병렬 조회. 한쪽이 실패해도 나머지로 렌더하고,
  // 둘 다 실패한 경우에만 503 — 크롤러가 나중에 재시도 (빈 페이지를 색인시키지 않는다).
  const [bestResult, latestResult] = await Promise.allSettled([
    fetchStoreProducts({ url, key, sort: "popular", limit: BEST_BOOK_LIMIT }),
    fetchStoreProducts({ url, key, sort: "latest", limit: LATEST_BOOK_LIMIT }),
  ]);

  if (bestResult.status === "rejected" && latestResult.status === "rejected") {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  const bestRows = bestResult.status === "fulfilled" ? bestResult.value : [];
  const latestRows = latestResult.status === "fulfilled" ? latestResult.value : [];
  const bestItems = dedupeItems(bestRows);
  const latestItems = dedupeItems(latestRows);
  // 홈은 재고가 0이어도 브랜드 페이지로서 항상 색인 대상 (컬렉션과 달리 noindex 없음)
  const totalCount = Number(bestRows[0]?.total_count) || 0;

  sendHtml(res, 200, buildHtml({ bestItems, latestItems, totalCount }));
}
