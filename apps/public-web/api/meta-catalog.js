import { readMetaCatalogSnapshot, syncMetaCatalogRows } from "../../../packages/shared-supabase/src/metaCatalogFeedClient.js";
import { buildMetaCatalogFeed, serializeMetaCatalogRows } from "../../../packages/shared-domain/src/metaCatalogFeed.js";

// Meta가 매시간 가져오는 공개 상품 파일. 기본값은 현재 광고 중인 전일학원 3종.
// 전체 교재 확대는 ?scope=all 을 별도로 연결할 때만 이루어진다.
export default async function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }
  const scope = req.query?.scope ?? "jeonil";
  if (scope !== "jeonil" && scope !== "all") {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ error: "scope must be jeonil or all", code: 400 });
    return;
  }
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || process.env.VITE_SUPABASE_PUBLIC_URL || process.env.VITE_SUPABASE_URL;
  // anon 폴백은 금지: books/pre_release_products의 RLS가 빈 배열을 반환할 수 있다.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  try {
    if (!url || !key) throw new Error("Catalog configuration missing");
    const observedAt = new Date().toISOString();
    const snapshot = await readMetaCatalogSnapshot({ url, key, scope });
    const { rows: currentRows } = buildMetaCatalogFeed({ ...snapshot, scope });
    const rows = await syncMetaCatalogRows({ url, key, scope, rows: currentRows, observedAt });
    const csv = serializeMetaCatalogRows(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="subook-meta-${scope}.csv"`);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
    res.setHeader("X-Catalog-Products", String(rows.length));
    if (req.method === "HEAD") res.status(200).end();
    else res.status(200).send(csv);
  } catch (error) {
    // 키·응답 본문·주문 정보는 로그에 남기지 않는다. 빈/부분 파일로 카탈로그를 덮지 않는다.
    console.error("[meta-catalog] feed unavailable", error.products ?? "source unavailable");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "300");
    res.status(503).json({ error: "catalog temporarily unavailable", code: 503 });
  }
}
