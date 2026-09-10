import { META_JEONIL_PRODUCT_IDS } from "../../shared-domain/src/metaCatalogFeed.js";

const PRODUCT_SELECT = "id,title,subject,brand,book_type,cover_image_url,status";
const BOOK_SELECT = "id,product_id,price,original_price,status,is_public,condition_grade,cover_image_url";

// 서버 전용 읽기 경계. 기존 프리렌더와 같은 service 키를 사용하고 조회 열을 명시한다.
// SDK 의존성이 없어 public-web 서버리스에서도 동일 모듈을 사용할 수 있다.
export async function readMetaCatalogSnapshot({
  url, key, scope, fetchImpl = globalThis.fetch, pageSize = 1000, maxPages = 100,
  timeoutMs = 8000, retryDelayMs = 350, totalTimeoutMs = 25000,
}) {
  const origin = new URL(url);
  if (origin.protocol !== "https:" || origin.username || origin.password || !key) throw new Error("Catalog configuration missing");
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs);

  async function readPage(table, params) {
    const requestUrl = new URL(`/rest/v1/${table}`, origin);
    requestUrl.search = params.toString();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      controller.signal.throwIfAborted();
      let retryable = true;
      try {
        const response = await fetchImpl(requestUrl.href, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
        });
        if (!response.ok) {
          retryable = response.status === 429 || response.status >= 500;
          throw new Error("Catalog read failed");
        }
        retryable = false;
        const rows = await response.json();
        const range = response.headers.get("content-range") ?? "";
        const countMatch = range.match(/\/(\d+)$/);
        if (!Array.isArray(rows) || !countMatch) throw new Error("Catalog response incomplete");
        return { rows, remaining: Number(countMatch[1]) };
      } catch (error) {
        if (controller.signal.aborted || !retryable || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    throw new Error("Catalog unavailable");
  }

  async function readAll(table, select, filters, idColumn = "id") {
    const all = [];
    let cursor = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ select, ...filters, order: `${idColumn}.asc`, limit: String(pageSize) });
      params.append(idColumn, `gt.${cursor}`);
      const { rows, remaining } = await readPage(table, params);
      if (remaining < rows.length || (remaining > 0 && rows.length === 0)) throw new Error("Catalog pagination incomplete");
      for (const row of rows) {
        const id = Number(row[idColumn]);
        if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("Catalog pagination invalid");
        cursor = id;
        all.push(row);
      }
      // 서버의 max-rows가 요청 limit보다 작아도 count를 보고 계속 읽는다.
      if (remaining === rows.length) return all;
    }
    throw new Error("Catalog pagination limit exceeded");
  }

  try {
    const selected = `in.(${META_JEONIL_PRODUCT_IDS.join(",")})`;
    const [products, books, preReleases] = await Promise.all([
      readAll("products", PRODUCT_SELECT, { status: "neq.hidden", ...(scope === "jeonil" ? { id: selected } : {}) }),
      readAll("books", BOOK_SELECT, { is_public: "eq.true", ...(scope === "jeonil" ? { product_id: selected } : {}) }),
      readAll("pre_release_products", "product_id,release_at", {}, "product_id"),
    ]);
    return { products, books, preReleases };
  } finally {
    clearTimeout(totalTimer);
    controller.abort();
  }
}

// 현재 공개 정보만 저장하고, 이전에 공개했던 품절 상품의 ID도 반환한다.
// 같은 관측 시각으로 재송신해도 RPC는 멱등이다. 키·판매자 정보는 payload에 넣지 않는다.
export async function syncMetaCatalogRows({ url, key, scope, rows, observedAt, fetchImpl = globalThis.fetch, retryDelayMs = 350 }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let retryable = true;
    try {
      const response = await fetchImpl(new URL("/rest/v1/rpc/sync_meta_catalog_snapshot", url).href, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_scope: scope, p_rows: rows, p_observed_at: observedAt }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error("Catalog history unavailable");
      }
      retryable = false;
      const result = await response.json();
      if (!Array.isArray(result)) throw new Error("Catalog history invalid");
      return result;
    } catch (error) {
      if (!retryable || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error("Catalog history unavailable");
}
