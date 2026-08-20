// 시리즈·강사별 교재 목록 프리렌더 (public-web /api/prerender-collection?type=series&key=숏컷)
//
// /store/series/:slug, /store/instructor/:slug 랜딩 페이지의 봇 전용 렌더러.
// vercel.deploy.json의 UA 조건부 rewrite가 봇 요청만 이 함수로 보내고,
// SPA(PublicCollectionPage)와 동일한 RPC(list_public_store_products)의 상품 목록을
// 완성된 HTML(ItemList·BreadcrumbList JSON-LD + 상품 링크 목록)로 돌려준다.
// "시대인재 숏컷"·"박종민 수학" 같은 시리즈명·강사명 검색어를 받는 크롤러블 진입점.
// (근거: 네이버 서치어드바이저 검색 키워드 실측 2026-08 — 고노출·저CTR 쿼리)
//
// ⚠ 의존성 없음(global fetch만) — 배포 스테이징 루트 /api 복사 제약 (prerender-subject.js와 동일).
// ⚠ 컬렉션 목록·타이틀·설명 문구는 SPA(src/lib/publicStoreCollections.js +
//   PublicCollectionPage usePageMeta)와 반드시 동기 유지 — 클로킹 오해 방지 원칙.

const SITE_ORIGIN = "https://subook.kr";
const REQUEST_TIMEOUT_MS = 8_000;
const LIST_LIMIT = 100; // 봇에 노출할 최대 상품 링크 수
const ITEMLIST_JSONLD_CAP = 30;

// ⚠ src/lib/publicStoreCollections.js SERIES_COLLECTIONS와 동기 유지
const SERIES_COLLECTIONS = [
  { slug: "숏컷", label: "시대인재 숏컷", terms: ["숏컷", "shortcut"] },
  { slug: "볼텍스", label: "시대인재 볼텍스", terms: ["볼텍스", "vortex"] },
  { slug: "엣지", label: "시대인재 엣지", terms: ["엣지", "edge"] },
  { slug: "브릿지", label: "시대인재 브릿지", terms: ["브릿지", "bridge"] },
  { slug: "엑셀러레이터", label: "시대인재 엑셀러레이터", terms: ["엑셀러레이터", "accelerator"] },
  { slug: "서바이벌", label: "시대인재 서바이벌", terms: ["서바"] },
  { slug: "강기본", label: "강기본", terms: ["강기본"] },
];

// ⚠ src/lib/publicStoreCollections.js INSTRUCTOR_COLLECTIONS와 동기 유지
const INSTRUCTOR_COLLECTIONS = [
  { slug: "박종민", name: "박종민", subject: "수학", brand: "시대인재" },
  { slug: "이동준", name: "이동준", subject: "수학", brand: "시대인재" },
  { slug: "안가람", name: "안가람", subject: "수학", brand: "시대인재" },
  { slug: "김현우", name: "김현우", subject: "수학", brand: "시대인재" },
  { slug: "김범찬", name: "김범찬", subject: "수학", brand: "시대인재" },
  { slug: "이신혁", name: "이신혁", subject: "지구과학", brand: "시대인재" },
  { slug: "김강민", name: "김강민", subject: "화학", brand: "시대인재" },
  { slug: "손창빈", name: "손창빈", subject: "국어", brand: "시대인재" },
  { slug: "현우진", name: "현우진", subject: "수학", brand: "메가스터디" },
  { slug: "강민철", name: "강민철", subject: "국어", brand: "메가스터디" },
  { slug: "백호", name: "백호", subject: "생명과학", brand: "메가스터디" },
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

// SPA(publicStoreCollections.js getSeriesCollectionMeta/getInstructorCollectionMeta)와
// 동일한 타이틀·설명·경로 공식
function resolveCollection(type, key) {
  if (type === "series") {
    const series = SERIES_COLLECTIONS.find((item) => item.slug === key);
    if (!series) return null;
    return {
      heading: `${series.label} 교재`,
      description: `${series.label} 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.`,
      canonicalPath: `/store/series/${encodeURIComponent(series.slug)}`,
      rpcArgs: { p_title_terms: series.terms },
    };
  }
  if (type === "instructor") {
    const instructor = INSTRUCTOR_COLLECTIONS.find((item) => item.slug === key);
    if (!instructor) return null;
    return {
      heading: `${instructor.name} ${instructor.subject} 교재`,
      description: `${instructor.brand} ${instructor.name} ${instructor.subject} 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.`,
      canonicalPath: `/store/instructor/${encodeURIComponent(instructor.slug)}`,
      rpcArgs: { p_instructors: [instructor.name] },
    };
  }
  return null;
}

async function fetchCollectionProducts({ url, key, rpcArgs }) {
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
      // SPA(PublicCollectionPage → fetchStorefrontProducts)와 동일 인자 — 인기순
      body: JSON.stringify({
        ...rpcArgs,
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

// RPC row → 링크 목록 항목 (prerender-subject.js와 동일 실측 필드)
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

function buildHtml({ type, key, collection, items, totalCount }) {
  const pageTitle = `${collection.heading} | 수북 SUBOOK`;
  const canonicalUrl = `${SITE_ORIGIN}${collection.canonicalPath}`;
  const isEmpty = items.length === 0;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: collection.heading },
      ],
    },
    ...(isEmpty
      ? []
      : [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: collection.heading,
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

  // 같은 유형의 다른 컬렉션 간 내부링크 (SPA 네비와 동일 대상)
  const siblingLinks = (
    type === "series"
      ? SERIES_COLLECTIONS.filter((item) => item.slug !== key).map(
          (item) =>
            `<a href="${SITE_ORIGIN}/store/series/${encodeURIComponent(item.slug)}">${escapeHtml(item.label)} 교재</a>`,
        )
      : INSTRUCTOR_COLLECTIONS.filter((item) => item.slug !== key).map(
          (item) =>
            `<a href="${SITE_ORIGIN}/store/instructor/${encodeURIComponent(item.slug)}">${escapeHtml(`${item.name} ${item.subject}`)} 교재</a>`,
        )
  ).join(" · ");
  const siblingHeading = type === "series" ? "시리즈별 교재" : "강사별 교재";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(collection.description)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    ${isEmpty ? '<meta name="robots" content="noindex" />' : ""}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(collection.description)}" />
    <meta property="og:site_name" content="수북 SUBOOK" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(collection.description)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <main>
      <p><a href="${SITE_ORIGIN}/">수북 SUBOOK — 수능 교재 위탁판매 플랫폼</a> › ${escapeHtml(collection.heading)}</p>
      <article>
        <h1>${escapeHtml(collection.heading)}</h1>
        ${
          isEmpty
            ? `<p>현재 판매 중인 ${escapeHtml(collection.heading)}가 없습니다.</p>`
            : `<p>총 ${totalCount.toLocaleString("ko-KR")}종 · 검수 완료된 새 책 수준의 교재</p>
        <ul>
${listRows}
        </ul>`
        }
      </article>
      <nav>
        <p>${siblingHeading}: ${siblingLinks}</p>
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
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=604800");
  res.status(statusCode).send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const type = String(req.query?.type ?? "").trim();
  let key = "";
  try {
    key = decodeURIComponent(String(req.query?.key ?? "")).trim();
  } catch {
    key = String(req.query?.key ?? "").trim();
  }

  const collection = resolveCollection(type, key);
  if (!collection) {
    sendHtml(
      res,
      404,
      '<!doctype html><html lang="ko"><head><title>페이지를 찾을 수 없습니다</title><meta name="robots" content="noindex" /></head><body><p>페이지를 찾을 수 없습니다. <a href="https://subook.kr/">수북 홈으로</a></p></body></html>',
    );
    return;
  }

  const { url, key: apiKey } = resolveSupabaseEnv();
  if (!url || !apiKey) {
    res.status(503).json({ error: "prerender unavailable", code: 503 });
    return;
  }

  try {
    const rows = await fetchCollectionProducts({ url, key: apiKey, rpcArgs: collection.rpcArgs });
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const item = normalizeRow(row);
      if (!item || !item.title || seen.has(item.productId)) continue;
      seen.add(item.productId);
      items.push(item);
    }
    const totalCount = Number(rows[0]?.total_count) || items.length;
    sendHtml(res, 200, buildHtml({ type, key, collection, items, totalCount }));
  } catch {
    // 실패 시 503 — 크롤러가 나중에 재시도 (빈 페이지를 색인시키지 않는다)
    res.status(503).json({ error: "prerender unavailable", code: 503 });
  }
}
