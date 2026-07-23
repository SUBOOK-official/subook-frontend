// 동적 상품 사이트맵 (public-web /api/sitemap-products → /sitemap-products.xml 리라이트)
//
// 구글·네이버가 상품 상세(/store/:id)를 직접 발견하도록 공개 상품 전체를 XML로 노출한다.
// 정적 /sitemap.xml(사이트맵 인덱스)이 /sitemap-pages.xml(핵심 페이지)과 이 파일을 가리킨다.
// 도메인 전환으로 사라진 옛 식스샵 상품 색인(831개)을 새 상품 페이지로 대체하는 핵심 경로.
//
// ⚠ 의존성 없음(global fetch만). 이 함수는 배포 스테이징 루트의 /api로 복사되어
//   frontend 워크스페이스 node_modules와 분리되므로 npm import는 런타임에 해결되지
//   않는다 (send-phone-otp.js·payments/confirm.js와 동일 제약). Supabase 접근은
//   PostgREST REST 직접 호출.

const SITE_ORIGIN = "https://subook.kr"; // 정식 도메인 기준 (index.html canonical과 동일 정책)
const PAGE_SIZE = 1000;
const MAX_PAGES = 10; // 상품 1만 개 상한 — 초과해도 사이트맵은 유효한 XML로 잘린다
const REQUEST_TIMEOUT_MS = 8_000;

function resolveSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_PUBLIC_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  // products는 RLS 공개 읽기 테이블이라 anon 키가 정석. 런타임에 없으면 service 키 폴백.
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  return { url: url.replace(/\/+$/, ""), key };
}

async function fetchProductsPage({ url, key, offset }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const query =
      `${url}/rest/v1/products` +
      `?select=id,updated_at&status=neq.hidden&order=id.asc` +
      `&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(query, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
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

function toLastmodTag(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `<lastmod>${date.toISOString()}</lastmod>`;
}

function buildSitemapXml(rows) {
  const entries = rows
    .map(
      (row) =>
        `  <url><loc>${SITE_ORIGIN}/store/${row.id}</loc>${toLastmodTag(row.updated_at)}</url>`,
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</urlset>\n`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const { url, key } = resolveSupabaseEnv();
  if (!url || !key) {
    res.status(503).json({ error: "sitemap unavailable", code: 503 });
    return;
  }

  try {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const pageRows = await fetchProductsPage({ url, key, offset: page * PAGE_SIZE });
      rows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // CDN 1시간 캐시 — 크롤러가 몰려도 Supabase 조회는 시간당 1회 수준
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).send(buildSitemapXml(rows));
  } catch {
    // 실패 시 빈 사이트맵 대신 503 — 크롤러가 기존 색인을 유지하고 나중에 재시도한다
    res.status(503).json({ error: "sitemap unavailable", code: 503 });
  }
}
