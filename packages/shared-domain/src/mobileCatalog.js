import { bookConditionLabel } from "./status.js";

export const MOBILE_STORE_SUBJECTS = ["전체", "국어", "수학", "영어", "과학", "사회", "한국사", "기타"];
export const MOBILE_PAGE_SIZE = 24;
export const MOBILE_STORE_SORTS = [
  { value: "popular", label: "인기순" },
  { value: "latest", label: "최신순" },
  { value: "price_low", label: "낮은 가격순" },
];

function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function buildMobileCatalogArgs({ search = "", subject = "전체", sort = "popular", offset = 0 } = {}) {
  return {
    p_search: String(search).trim().slice(0, 100) || null,
    p_subjects: MOBILE_STORE_SUBJECTS.includes(subject) && subject !== "전체" ? [subject] : null,
    p_sort: MOBILE_STORE_SORTS.some((item) => item.value === sort) ? sort : "popular",
    p_limit: MOBILE_PAGE_SIZE,
    p_offset: Math.floor(nonNegativeNumber(offset) ?? 0),
  };
}

export function getProductWebUrl(id) {
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw new Error("교재를 찾을 수 없습니다.");
  return `https://subook.kr/store/${id}`;
}

function groupOptionRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const title = row.option || row.title || "기본 교재";
    const grade = bookConditionLabel[row.condition_grade] || "등급 확인";
    const price = nonNegativeNumber(row.price);
    const key = JSON.stringify([title, grade, price]);
    const isAvailable = row.is_available === true && Number(row.stock_count) > 0;
    const existing = groups.get(key);
    if (existing) existing.isAvailable ||= isAvailable;
    else groups.set(key, { id: String(row.book_id), title, grade, price, isAvailable });
  }
  return [...groups.values()];
}

function httpsUrlList(value) {
  let list = value;
  if (typeof value === "string") {
    try { list = JSON.parse(value); } catch { list = value.split(/[\n,]/); }
  }
  return (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.startsWith("https://"));
}

// 상품 상세 옵션 선택용 실물 목록(public-web productOptionGroups.groupOptionsByVariant 입력 형태)
function toOptionBooks(rows) {
  return rows.flatMap((row) => {
    if (!/^\d+$/.test(String(row?.book_id)) || Number(row.book_id) <= 0) return [];
    return [{
      id: String(row.book_id),
      option: typeof row.option === "string" ? row.option.trim() : "",
      isSoldOut: !(row.is_available === true && Number(row.stock_count) > 0),
      price: nonNegativeNumber(row.price),
      originalPrice: nonNegativeNumber(row.original_price),
      conditionGrade: row.condition_grade || "",
      coverImageUrl: typeof row.cover_image_url === "string" && row.cover_image_url.startsWith("https://") ? row.cover_image_url : "",
    }];
  });
}

export function normalizeMobileProduct(row) {
  if (!row || !/^\d+$/.test(String(row.product_id ?? row.id)) || Number(row.product_id ?? row.id) <= 0) return null;
  return {
    id: String(row.product_id ?? row.id),
    title: String(row.title || "교재"),
    subject: row.subject || "",
    brand: row.brand || "",
    instructor: row.instructor_name || "",
    year: row.published_year || null,
    price: nonNegativeNumber(row.price),
    originalPrice: nonNegativeNumber(row.original_price),
    grade: bookConditionLabel[row.condition_grade] || "등급 확인",
    coverUrl: typeof row.cover_image_url === "string" && row.cover_image_url.startsWith("https://") ? row.cover_image_url : null,
    bookType: row.book_type || "",
    notes: row.inspection_notes || "",
    // 상세 사진은 최대 2장(웹 상세 사진 그리드와 같은 기준)
    detailImages: httpsUrlList(row.inspection_image_urls).slice(0, 2),
    isSoldOut: row.available_option_count != null && Number(row.available_option_count) === 0,
    // RPC는 실물 한 권당 한 행이다. 같은 구성·등급·가격은 한 줄로 표시한다.
    // 공개 화면에는 입고 원장 행 수나 실제 재고 수량을 추가로 노출하지 않는다.
    options: groupOptionRows(Array.isArray(row.option_books) ? row.option_books : []),
    optionBooks: toOptionBooks(Array.isArray(row.option_books) ? row.option_books : []),
  };
}

// 장바구니 한 줄(get_cart_items 결과)
export function normalizeMobileCartItem(row) {
  if (!row || !/^\d+$/.test(String(row.id)) || !/^\d+$/.test(String(row.book_id))) return null;
  return {
    id: String(row.id),
    bookId: String(row.book_id),
    productId: row.product_id ? String(row.product_id) : null,
    title: String(row.title || "교재"),
    optionLabel: row.option_label || "",
    subject: row.subject || "",
    brand: row.brand || "",
    conditionGrade: row.condition_grade || "",
    price: nonNegativeNumber(row.price),
    originalPrice: nonNegativeNumber(row.original_price),
    coverUrl: typeof row.cover_image_url === "string" && row.cover_image_url.startsWith("https://") ? row.cover_image_url : null,
    isSoldOut: row.is_sold_out === true || Number(row.stock_count) <= 0,
  };
}

// 주문서(/order)가 기대하는 교재 한 권 형태 — 권당 quantity 1, id는 숫자(웹 장바구니와 동일)
function positiveId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function toCheckoutItems(items) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const bookId = positiveId(item?.bookId);
    if (!bookId) return [];
    return [{
      bookId,
      productId: positiveId(item.productId),
      quantity: 1,
      title: String(item.title ?? ""),
      optionLabel: item.optionLabel ?? "",
      conditionGrade: item.conditionGrade ?? "",
      coverImageUrl: item.coverUrl ?? item.coverImageUrl ?? "",
      price: nonNegativeNumber(item.price),
      originalPrice: nonNegativeNumber(item.originalPrice),
    }];
  });
}
