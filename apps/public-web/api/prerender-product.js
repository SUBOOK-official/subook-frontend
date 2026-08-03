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

// ⚠ publicStoreNavigation.js STORE_SUBJECTS에서 "전체"를 뺀 목록과 동기 유지
//   (과목 랜딩 /store/subject/:subject 링크·빵부스러기 대상 판정용)
const SUBJECT_PAGE_SUBJECTS = ["국어", "수학", "영어", "과학", "사회", "한국사", "기타"];

// 관련 교재(비슷한 교재) — SPA 상세와 동일 소스(get_public_store_product_detail RPC의
// related_books)를 사용해 봇/사람 간 내용 일치 유지. 부가 정보라 실패 시 빈 배열.
async function fetchRelatedBooks({ url, key, productId }) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${url}/rest/v1/rpc/get_public_store_product_detail`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_product_id: Number(productId) }),
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const rows = await response.json();
      const related = Array.isArray(rows) ? rows[0]?.related_books : null;
      if (!Array.isArray(related)) return [];
      const seen = new Set();
      const items = [];
      for (const row of related) {
        const relatedId = row?.product_id ?? row?.id;
        const title = String(row?.title ?? "").trim();
        if (relatedId == null || !title || seen.has(String(relatedId))) continue;
        seen.add(String(relatedId));
        items.push({ productId: String(relatedId), title });
        if (items.length >= 4) break;
      }
      return items;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return [];
  }
}

// 서치콘솔 요건: offers.price는 품절(OutOfStock)이어도 필수. 그래서 books는 전 상태를
// 받아와 판매 가능분(on_sale + is_public)으로 재고를 세고, 판매 가능분이 없으면
// 전체 이력의 최저가를 마지막 판매가로 폴백한다 (SPA product.price 대표가와 동일 의미).
function summarizeBooks(books) {
  const toPositivePrices = (rows) =>
    rows
      .map((book) => Number(book.price))
      .filter((price) => Number.isFinite(price) && price > 0);
  const sellable = books.filter(
    (book) => book.status === "on_sale" && book.is_public === true,
  );
  const sellablePrices = toPositivePrices(sellable);
  const allPrices = toPositivePrices(books);
  const gradeCounts = new Map();
  for (const book of sellable) {
    const grade = GRADE_LABELS[book.condition_grade] || book.condition_grade;
    if (!grade) continue;
    gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
  }
  return {
    stockCount: sellable.length,
    minPrice: sellablePrices.length ? Math.min(...sellablePrices) : null,
    lastKnownPrice: allPrices.length ? Math.min(...allPrices) : null,
    gradeSummary: [...gradeCounts.entries()]
      .map(([grade, count]) => `${grade} ${count}권`)
      .join(" · "),
    optionLabels: [...new Set(sellable.map((book) => book.option).filter(Boolean))],
  };
}

// Product JSON-LD(offers)의 배송·반품 정책 마크업 — 판매자 목록 권장 필드.
// 값은 운영 정책과 동일 유지: 배송비=cart.js SHIPPING_FEE(3,000원), 출고 1~2일(상세페이지
// 안내 문구), 단순변심 반품 7일·반품 편도 배송비 구매자 부담(PublicPolicyPage 환불 정책).
// ⚠ SPA(PublicProductDetailPage.jsx)의 JSONLD_* 상수와 복제 관계 — 함께 수정할 것.
const JSONLD_SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: 3000, currency: "KRW" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "KR" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
  },
};
const JSONLD_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "KR",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 7,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/ReturnShippingFees",
  returnShippingFeesAmount: { "@type": "MonetaryAmount", value: 3000, currency: "KRW" },
};

// ai_summary(간단 마크다운)를 JSON-LD description용 플레인텍스트로 (**강조**·줄바꿈 제거)
function aiSummaryToPlainText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHtml({ product, stock, relatedBooks }) {
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
  // 품절이어도 마지막 판매가를 표기 (offers.price 필수 요건 + SPA 옵션 표기와 동일 의미)
  const displayPrice = stock.minPrice ?? stock.lastKnownPrice;
  const priceText =
    displayPrice != null ? `${displayPrice.toLocaleString("ko-KR")}원` : null;

  // 과목 랜딩 페이지가 있는 과목이면 빵부스러기 2단계를 링크로 연결
  const hasSubjectPage = product.subject && SUBJECT_PAGE_SUBJECTS.includes(product.subject);
  const subjectPageUrl = hasSubjectPage
    ? `${SITE_ORIGIN}/store/subject/${encodeURIComponent(product.subject)}`
    : null;

  // 빵부스러기 — SPA(PublicProductDetailPage usePageMeta jsonLd)와 동일 구조 유지
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_ORIGIN}/` },
      ...(hasSubjectPage
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: `수능 ${product.subject} 교재`,
              item: subjectPageUrl,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: hasSubjectPage ? 3 : 2,
        name: product.title,
      },
    ],
  };

  // 양수 가격을 전혀 알 수 없는 상품(책 이력 자체가 없음)은 잘못된 offers를 내보내는
  // 대신 Product JSON-LD만 생략한다 (빵부스러기는 유지).
  const productJsonLd =
    displayPrice != null
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          description: aiSummaryToPlainText(product.ai_summary) || description,
          image: [coverUrl],
          ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
          ...(product.subject ? { category: product.subject } : {}),
          offers: {
            "@type": "Offer",
            priceCurrency: "KRW",
            price: displayPrice,
            itemCondition: "https://schema.org/UsedCondition",
            availability: isSoldOut
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
            url: canonicalUrl,
            shippingDetails: JSONLD_SHIPPING_DETAILS,
            hasMerchantReturnPolicy: JSONLD_RETURN_POLICY,
          },
        }
      : null;

  const jsonLd = [...(productJsonLd ? [productJsonLd] : []), breadcrumbJsonLd];

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
          ${priceText ? ` · ${isSoldOut ? "마지막 판매가 " : ""}<strong>${escapeHtml(priceText)}</strong>${!isSoldOut && stock.stockCount > 1 ? "부터" : ""}` : ""}
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
        ${
          Array.isArray(relatedBooks) && relatedBooks.length > 0
            ? `<section><h2>비슷한 교재</h2><ul>
        ${relatedBooks
          .map(
            (item) =>
              `<li><a href="${SITE_ORIGIN}/store/${item.productId}">${escapeHtml(item.title)}</a></li>`,
          )
          .join("\n        ")}
        </ul></section>`
            : ""
        }
      </article>
      <nav>
        <a href="${SITE_ORIGIN}/">홈</a> ·
        ${subjectPageUrl ? `<a href="${subjectPageUrl}">수능 ${escapeHtml(product.subject)} 교재</a> · ` : ""}<a href="${SITE_ORIGIN}/pickup/new">교재 판매(수거 신청)</a> ·
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
    const [productRows, bookRows, relatedBooks] = await Promise.all([
      fetchJson(
        `${url}/rest/v1/products?id=eq.${id}&status=neq.hidden&select=${productSelect}&limit=1`,
        key,
      ),
      // 전 상태 조회 — 판매 가능분 판정은 summarizeBooks에서 (품절 시 마지막 판매가 폴백용)
      fetchJson(
        `${url}/rest/v1/books?product_id=eq.${id}&select=price,condition_grade,option,status,is_public`,
        key,
      ),
      // 비슷한 교재 링크 — 실패해도 페이지는 나가야 하므로 내부에서 [] 폴백
      fetchRelatedBooks({ url, key, productId: id }),
    ]);

    const product = Array.isArray(productRows) ? productRows[0] : null;
    if (!product) {
      sendHtml(res, 404, "<!doctype html><html lang=\"ko\"><head><title>상품을 찾을 수 없습니다</title></head><body><p>상품을 찾을 수 없습니다. <a href=\"https://subook.kr/\">수북 홈으로</a></p></body></html>");
      return;
    }

    const stock = summarizeBooks(Array.isArray(bookRows) ? bookRows : []);
    sendHtml(res, 200, buildHtml({ product, stock, relatedBooks }));
  } catch {
    // 실패 시 503 — 크롤러가 나중에 재시도 (빈 페이지를 색인시키지 않는다)
    res.status(503).json({ error: "prerender unavailable", code: 503 });
  }
}
