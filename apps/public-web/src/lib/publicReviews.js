// 통합 구매 후기 — Supabase RPC·스토리지 연동
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { resizeReviewImage } from "./reviewImage";
import {
  REVIEW_PAGE_SIZE,
  REVIEW_PHOTO_MAX_COUNT,
  REVIEW_STORAGE_BUCKET,
  extractReviewStoragePath,
  normalizeReviewItem,
  normalizeReviewSummary,
} from "./publicReviewsUtils";

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage);
  }
  if (error instanceof Error) {
    return error;
  }
  const message = typeof error?.message === "string" && error.message ? error.message : fallbackMessage;
  const next = new Error(message);
  next.code = error?.code;
  return next;
}

// 상세페이지 후기 섹션 — productId를 주면 같은 상품 후기가 위로 온다.
export async function fetchPublicReviews({ productId = null, limit = REVIEW_PAGE_SIZE, offset = 0 } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { summary: normalizeReviewSummary(null), error: null };
  }

  const numericProductId = Number(productId);
  const { data, error } = await supabase.rpc("get_public_reviews", {
    p_product_id: Number.isFinite(numericProductId) && numericProductId > 0 ? numericProductId : null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return { summary: normalizeReviewSummary(null), error: toError(error, "후기를 불러오지 못했어요.") };
  }

  return { summary: normalizeReviewSummary(data), error: null };
}

// 마이페이지 — 주문별 작성/수정 버튼 분기용
export async function fetchMyReviews() {
  if (!isSupabaseConfigured || !supabase) {
    return { reviews: [], error: null };
  }

  const { data, error } = await supabase.rpc("get_my_reviews");
  if (error) {
    return { reviews: [], error: toError(error, "내 후기를 불러오지 못했어요.") };
  }

  return {
    reviews: Array.isArray(data) ? data.map(normalizeReviewItem).filter(Boolean) : [],
    error: null,
  };
}

function buildPhotoPath({ userId, orderId, index }) {
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${userId}/${orderId}/${stamp}-${index}-${random}.jpg`;
}

// 파일 → 리사이즈 → 본인 폴더 업로드 → public URL 목록
export async function uploadReviewPhotos({ userId, orderId, files }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("사진 업로드를 사용할 수 없어요.");
  }
  if (!userId || !orderId) {
    throw new Error("로그인 정보를 확인할 수 없어요.");
  }

  const fileList = Array.from(files ?? []).slice(0, REVIEW_PHOTO_MAX_COUNT);
  const urls = [];

  for (let index = 0; index < fileList.length; index += 1) {
    const { blob } = await resizeReviewImage(fileList[index]);
    const path = buildPhotoPath({ userId, orderId, index });
    const { error } = await supabase.storage.from(REVIEW_STORAGE_BUCKET).upload(path, blob, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) {
      throw toError(error, "사진 업로드에 실패했어요.");
    }
    const { data } = supabase.storage.from(REVIEW_STORAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error("사진 주소를 만들지 못했어요.");
    }
    urls.push(data.publicUrl);
  }

  return urls;
}

// 삭제·교체된 사진 정리 (실패해도 후기 흐름은 막지 않음)
export async function removeReviewPhotos(urls) {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }
  const paths = (urls ?? []).map(extractReviewStoragePath).filter(Boolean);
  if (paths.length === 0) {
    return;
  }
  try {
    await supabase.storage.from(REVIEW_STORAGE_BUCKET).remove(paths);
  } catch {
    // best-effort
  }
}

export async function createReview({ orderId, rating, content, photoUrls }) {
  if (!isSupabaseConfigured || !supabase) {
    return { review: null, error: new Error("후기 작성을 사용할 수 없어요.") };
  }

  const { data, error } = await supabase.rpc("create_review", {
    p_order_id: orderId,
    p_rating: rating,
    p_content: content,
    p_photo_urls: photoUrls ?? [],
  });

  if (error) {
    return { review: null, error: toError(error, "후기를 등록하지 못했어요.") };
  }
  return { review: normalizeReviewItem(data), error: null };
}

export async function updateReview({ reviewId, rating, content, photoUrls }) {
  if (!isSupabaseConfigured || !supabase) {
    return { review: null, error: new Error("후기 수정을 사용할 수 없어요.") };
  }

  const { data, error } = await supabase.rpc("update_review", {
    p_review_id: reviewId,
    p_rating: rating,
    p_content: content,
    p_photo_urls: photoUrls ?? [],
  });

  if (error) {
    return { review: null, error: toError(error, "후기를 수정하지 못했어요.") };
  }
  return { review: normalizeReviewItem(data), error: null };
}

export async function deleteReview({ reviewId, photoUrls }) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("후기 삭제를 사용할 수 없어요.") };
  }

  const { error } = await supabase.rpc("delete_review", { p_review_id: reviewId });
  if (error) {
    return { error: toError(error, "후기를 삭제하지 못했어요.") };
  }
  await removeReviewPhotos(photoUrls);
  return { error: null };
}
