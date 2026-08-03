// 과목별 교재 목록 프리렌더 (public-web /api/prerender-subject?subject=국어)
//
// /store/subject/:subject 과목 랜딩 페이지의 봇 전용 렌더러. vercel.deploy.json의
// UA 조건부 rewrite가 봇 요청만 이 함수로 보내고, SPA(PublicSubjectPage)와 동일한
// RPC(list_public_store_products)의 상품 목록을 완성된 HTML(ItemList·BreadcrumbList
// JSON-LD + 상품 링크 목록)로 돌려준다. "수능 국어 중고 교재" 같은 mid-tail 검색어와
// AI 검색엔진 인용을 받는 크롤러블 진입점이다.
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (prerender-product.js와 동일).
// ⚠ 과목 목록·타이틀·설명 문구는 SPA(publicStoreNavigation.js STORE_SUBJECTS +
//   PublicSubjectPage usePageMeta)와 반드시 동기 유지 — 클로킹 오해 방지 원칙.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;
const LIST_LIMIT = 100; // 봇에 노출할 최대 상품 링크 수
const ITEMLIST_JSONLD_CAP = 30;

// ⚠ publicStoreNavigation.js STORE_SUBJECTS에서 "전체"를 뺀 목록과 동기 유지
const VALID_SUBJECTS = ["국어", "수학", "영어", "과학", "사회", "한국사", "기타"];

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

async function fetchSubjectProducts({ url, key, subject }) {
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
      // SPA(PublicSubjectPage → fetchStorefrontProducts)와 동일 인자 — 인기순
      body: JSON.stringify({
        p_subjects: [subject],
        p_book_types: null,
        p_brands: null,
        p_years: null,
        p_condition_grades: null,
        p_search: null,
        p_sort: "popular",
        p_limit: LIST_LIMIT,
        p_offset: 0,
      }),
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

// RPC row → 링크 목록 항목. 필드는 실측 응답 기준(product_id/title/price/available_option_count).
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

function buildHtml({ subject, items, totalCount }) {
  // SPA(PublicSubjectPage usePageMeta)와 동일한 타이틀·설명 패턴
  const pageTitle = `수능 ${subject} 교재 | 수북 SUBOOK`;
  const description = `검수 완료된 수능 ${subject} 교재 — 새 책 수준의 미사용 교재를 합리적인 가격에.`;
  const canonicalUrl = `${SITE_ORIGIN}/store/subject/${encodeURIComponent(subject)}`;
  const isEmpty = items.length === 0;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: `수능 ${subject} 교재` },
      ],
    },
    ...(isEmpty
      ? []
      : [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `수능 ${subject} 교재`,
            numberOfItems: totalCount,
            itemListElement: items.slice(0, ITEMLIST_JSONLD_CAP).map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.title,
              url: `${SITE_ORIGIN}/store/${item.productId}`,
            })),
          },
        ]),
  ];

  const listRows = items
    .map((item) => {
      const priceText =
        item.price != null ? ` — ${item.price.toLocaleString("ko-KR")}원` : "";
      const soldOutText = item.isSoldOut ? " · 품절" : "";
      return `        <li><a href="${SITE_ORIGIN}/store/${item.productId}">${escapeHtml(item.title)}</a>${escapeHtml(priceText)}${soldOutText}</li>`;
    })
    .join("\n");

  const otherSubjectLinks = VALID_SUBJECTS.filter((name) => name !== subject && name !== "기타")
    .map(
      (name) =>
        `<a href="${SITE_ORIGIN}/store/subject/${encodeURIComponent(name)}">${escapeHtml(name)} 교재</a>`,
    )
    .join(" · ");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    ${isEmpty ? '<meta name="robots" content="noindex" />' : ""}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="수북 SUBOOK" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <main>
      <p><a href="${SITE_ORIGIN}/">수북 SUBOOK — 수능 교재 위탁판매 플랫폼</a> › 수능 ${escapeHtml(subject)} 교재</p>
      <article>
        <h1>수능 ${escapeHtml(subject)} 교재</h1>
        ${
          isEmpty
            ? `<p>현재 판매 중인 ${escapeHtml(subject)} 교재가 없습니다.</p>`
            : `<p>총 ${totalCount.toLocaleString("ko-KR")}종 · 검수 완료된 새 책 수준의 교재</p>
        <ul>
${listRows}
        </ul>`
        }
      </article>
      <nav>
        <p>과목별 교재: ${otherSubjectLinks}</p>
        <p><a href="${SITE_ORIGIN}/">전체 교재</a> · <a href="${SITE_ORIGIN}/pickup/new">교재 판매(수거 신청)</a> ·
        <a href="${SITE_ORIGIN}/faq">자주 묻는 질문</a></p>
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

  let subject = "";
  try {
    subject = decodeURIComponent(String(req.query?.subject ?? "")).trim();
  } catch {
    subject = String(req.query?.subject ?? "").trim();
  }

  if (!VALID_SUBJECTS.includes(subject)) {
    sendHtml(
      res,
      404,
      '<!doctype html><html lang="ko"><head><title>페이지를 찾을 수 없습니다</title><meta name="robots" content="noindex" /></head><body><p>페이지를 찾을 수 없습니다. <a href="https://subook.kr/">수북 홈으로</a></p></body></html>',
    );
    return;
  }

  const { url, key } = resolveSupabaseEnv();
  if (!url || !key) {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  try {
    const rows = await fetchSubjectProducts({ url, key, subject });
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const item = normalizeRow(row);
      if (!item || !item.title || seen.has(item.productId)) continue;
      seen.add(item.productId);
      items.push(item);
    }
    const totalCount = Number(rows[0]?.total_count) || items.length;
    sendHtml(res, 200, buildHtml({ subject, items, totalCount }));
  } catch {
    // 실패 시 503 — 크롤러가 나중에 재시도 (빈 페이지를 색인시키지 않는다)
    res.status(503).json({ error: "prerender unavailable", code: 503 });
  }
}
