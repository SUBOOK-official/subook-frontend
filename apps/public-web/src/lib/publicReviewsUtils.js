// 통합 구매 후기 — 순수 헬퍼 (브라우저·Supabase 의존 없음, 단위 테스트 대상)

export const REVIEW_CONTENT_MIN_LENGTH = 10;
export const REVIEW_CONTENT_MAX_LENGTH = 500;
export const REVIEW_PHOTO_MAX_COUNT = 3;
export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_STORAGE_BUCKET = "review-images";

const RATING_LABELS = {
  1: "별로예요",
  2: "아쉬워요",
  3: "보통이에요",
  4: "만족해요",
  5: "최고예요",
};

export function getReviewRatingLabel(rating) {
  const value = Number(rating);
  return RATING_LABELS[value] ?? "";
}

// "첫 품목명 외 N권" — 주문 1건당 후기 1개라 대표 제목 + 나머지 권수로 표시
export function formatReviewProductTitle(title, itemCount) {
  const base = typeof title === "string" && title.trim() ? title.trim() : "교재";
  const count = Number(itemCount);
  if (!Number.isFinite(count) || count <= 1) {
    return base;
  }
  return `${base} 외 ${count - 1}권`;
}

export function validateReviewDraft({ rating, content, photoCount = 0 }) {
  const ratingValue = Number(rating);
  if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    return "별점을 선택해 주세요.";
  }
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length < REVIEW_CONTENT_MIN_LENGTH) {
    return `후기는 ${REVIEW_CONTENT_MIN_LENGTH}자 이상 작성해 주세요.`;
  }
  if (text.length > REVIEW_CONTENT_MAX_LENGTH) {
    return `후기는 ${REVIEW_CONTENT_MAX_LENGTH}자까지 작성할 수 있어요.`;
  }
  if (Number(photoCount) > REVIEW_PHOTO_MAX_COUNT) {
    return `사진은 최대 ${REVIEW_PHOTO_MAX_COUNT}장까지 첨부할 수 있어요.`;
  }
  return "";
}

// public URL → 버킷 내부 경로 (삭제용). 버킷 URL이 아니면 null.
export function extractReviewStoragePath(url) {
  if (typeof url !== "string") {
    return null;
  }
  const marker = `/storage/v1/object/public/${REVIEW_STORAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const path = url.slice(index + marker.length).split("?")[0];
  try {
    return path ? decodeURIComponent(path) : null;
  } catch {
    return path || null;
  }
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

export function normalizeReviewItem(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  const id = Number(row.id);
  if (!Number.isFinite(id)) {
    return null;
  }
  return {
    id,
    orderId: row.order_id != null ? Number(row.order_id) : null,
    author: typeof row.author === "string" && row.author ? row.author : "수북회원",
    rating: Math.min(5, Math.max(1, toNonNegativeInteger(row.rating) || 1)),
    content: typeof row.content === "string" ? row.content : "",
    photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls.filter(Boolean) : [],
    productId: row.product_id != null ? Number(row.product_id) : null,
    productTitle: typeof row.product_title === "string" ? row.product_title : "",
    itemCount: Math.max(1, toNonNegativeInteger(row.item_count) || 1),
    isSameProduct: Boolean(row.is_same_product),
    isHidden: Boolean(row.is_hidden),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function normalizeReviewSummary(data) {
  const source = data && typeof data === "object" ? data : {};
  const ratingCounts = {};
  for (let star = 1; star <= 5; star += 1) {
    ratingCounts[star] = toNonNegativeInteger(source.rating_counts?.[String(star)]);
  }
  const average = Number(source.average);
  return {
    total: toNonNegativeInteger(source.total),
    average: Number.isFinite(average) ? average : null,
    ratingCounts,
    sameProductCount: toNonNegativeInteger(source.same_product_count),
    items: Array.isArray(source.items)
      ? source.items.map(normalizeReviewItem).filter(Boolean)
      : [],
  };
}

// 후기 목록 병합 (더보기) — 같은 id 중복 제거, 기존 순서 유지
export function mergeReviewItems(existing, incoming) {
  const seen = new Set((existing ?? []).map((item) => item.id));
  const merged = [...(existing ?? [])];
  for (const item of incoming ?? []) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function formatReviewDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}.${month}.${day}`;
}
