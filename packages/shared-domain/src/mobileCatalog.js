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
    notes: row.inspection_notes || "",
    isSoldOut: row.available_option_count != null && Number(row.available_option_count) === 0,
    // RPC는 실물 한 권당 한 행이다. 같은 구성·등급·가격은 한 줄로 표시한다.
    // 공개 화면에는 입고 원장 행 수나 실제 재고 수량을 추가로 노출하지 않는다.
    options: groupOptionRows(Array.isArray(row.option_books) ? row.option_books : []),
  };
}
