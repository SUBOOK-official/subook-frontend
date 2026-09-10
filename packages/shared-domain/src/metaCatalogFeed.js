import { getMetaContentId } from "./metaCatalog.js";

// 현재 광고 범위는 고정 3종. 브랜드만으로 필터링하면 신상품이 광고에 자동 편입된다.
export const META_JEONIL_PRODUCT_IDS = Object.freeze([2370, 2371, 2437]);
export const META_FEED_COLUMNS = Object.freeze([
  "id", "title", "description", "availability", "condition", "price", "sale_price",
  "link", "image_link", "brand", "product_type", "custom_label_0", "custom_label_1",
]);

function cleanText(value, limit) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function publicImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function validPrice(value) {
  return value != null && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// 공개 상품 정보만 직렬화한다. 주문·회원·정산 정보와 권별 재고 수량은 내보내지 않는다.
export function buildMetaCatalogFeed({ products, books, preReleases, scope = "jeonil", now = Date.now() }) {
  const blockedIds = new Set(preReleases.filter((row) =>
    !row.release_at || !Number.isFinite(Date.parse(row.release_at)) || Date.parse(row.release_at) > now,
  ).map((row) => String(row.product_id)));
  const bookGroups = new Map();
  for (const book of books) {
    if (book.is_public !== true) continue;
    const id = String(book.product_id);
    if (!bookGroups.has(id)) bookGroups.set(id, []);
    bookGroups.get(id).push(book);
  }

  const rows = [];
  const excluded = [];
  const seen = new Set();
  for (const product of products) {
    const productId = Number(product.id);
    const isJeonil = META_JEONIL_PRODUCT_IDS.includes(productId);
    if (scope === "jeonil" && !isJeonil) continue;
    if (product.status === "hidden" || blockedIds.has(String(product.id))) continue;
    if (!Number.isSafeInteger(productId) || productId <= 0 || seen.has(productId)) throw new Error("Invalid catalog product IDs");
    seen.add(productId);
    const candidates = bookGroups.get(String(product.id)) ?? [];
    // 품절 후에도 공개된 판매 이력으로 상품 ID를 유지한다.
    const available = candidates.filter((book) => book.status === "on_sale");
    const priced = (available.length ? available : candidates).filter((book) => validPrice(book.price));
    priced.sort((a, b) => Number(a.price) - Number(b.price) || Number(b.id) - Number(a.id));
    const representative = priced[0];
    const title = cleanText(product.title, 200);
    const brand = cleanText(product.brand, 100);
    const image = publicImage(representative?.cover_image_url) || publicImage(product.cover_image_url);
    if (!representative || !title || !brand || !image) {
      excluded.push({ productId, reason: !representative ? "price" : !title ? "title" : !brand ? "brand" : "image" });
      continue;
    }
    const salePrice = Number(representative.price);
    const originalPrice = validPrice(representative.original_price) && Number(representative.original_price) > salePrice
      ? Number(representative.original_price) : salePrice;
    const subject = cleanText(product.subject, 100);
    const details = [brand, subject, cleanText(product.book_type, 100)].filter(Boolean).join(" · ");
    const description = cleanText(`${title}. ${details}. ${isJeonil ? "전일학원 신품 교재." : "수북에서 검수한 교재. 옵션별 상태와 구성은 상품 페이지에서 확인하세요."}`, 5000);
    rows.push({
      id: getMetaContentId(productId), title, description,
      availability: available.length > 0 ? "in stock" : "out of stock",
      condition: isJeonil || representative.condition_grade === "S" ? "new" : "used",
      price: `${originalPrice} KRW`,
      sale_price: originalPrice > salePrice ? `${salePrice} KRW` : "",
      link: `https://subook.kr/store/${productId}`, image_link: image, brand,
      product_type: ["교재", subject].filter(Boolean).join(" > "),
      custom_label_0: isJeonil ? "jeonil" : "general", custom_label_1: subject,
    });
  }
  // 데이터 이상으로 일부 상품만 정상 파일처럼 전송하지 않는다. 운영 데이터 수정 후 재시도.
  if (excluded.length) {
    const error = new Error("Catalog product fields incomplete");
    error.products = excluded;
    throw error;
  }
  rows.sort((a, b) => a.link.localeCompare(b.link, "en", { numeric: true }));
  return { rows };
}

export function serializeMetaCatalogRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Empty catalog snapshot");
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Duplicate catalog IDs");
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${META_FEED_COLUMNS.join(",")}\r\n${rows.map((row) => META_FEED_COLUMNS.map((column) => escapeCsv(row[column])).join(",")).join("\r\n")}\r\n`;
}
