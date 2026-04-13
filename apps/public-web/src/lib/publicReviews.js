import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const REVIEW_STORAGE_KEY = "subook.public.reviews.v1";
const REVIEW_STORAGE_LIMIT = 200;
const REVIEW_RPC_NAME = "get_public_product_reviews";
const REVIEW_CREATE_RPC_NAME = "create_product_review";
const REVIEW_IMAGE_BUCKET = "review-images";

export const REVIEW_SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "rating_high", label: "별점 높은순" },
  { value: "rating_low", label: "별점 낮은순" },
];

export const REVIEW_RATING_LABELS = {
  1: "별로예요",
  2: "아쉬워요",
  3: "보통이에요",
  4: "만족해요",
  5: "최고예요",
};

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableText(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.trunc(numericValue);
}

function parsePhotoUrls(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 3);
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);
    if (Array.isArray(parsedValue)) {
      return parsedValue.map((item) => normalizeText(item)).filter(Boolean).slice(0, 3);
    }
  } catch {
    // Fall back to plain text parsing.
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function createLocalId(prefix = "review") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorCode(error) {
  return typeof error?.code === "string" ? error.code.toUpperCase() : "";
}

function getErrorMessage(error) {
  return typeof error?.message === "string" ? error.message.toLowerCase() : "";
}

function shouldUseLocalSchemaFallback(error) {
  const errorCode = getErrorCode(error);
  const errorMessage = getErrorMessage(error);

  return (
    errorCode === "PGRST202" ||
    errorCode === "PGRST205" ||
    errorMessage.includes("schema cache") ||
    errorMessage.includes("could not find the table") ||
    errorMessage.includes("could not find the function")
  );
}

function shouldUseLocalPhotoFallback(error) {
  const errorMessage = getErrorMessage(error);

  return (
    shouldUseLocalSchemaFallback(error) ||
    errorMessage.includes("bucket") ||
    errorMessage.includes("storage") ||
    errorMessage.includes("not found")
  );
}

function readStoredReviews() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue.map(normalizeStoredReview).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeStoredReviews(reviews = []) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      REVIEW_STORAGE_KEY,
      JSON.stringify(
        reviews
          .map(normalizeStoredReview)
          .filter(Boolean)
          .sort((left, right) => `${right.createdAt ?? ""}`.localeCompare(`${left.createdAt ?? ""}`))
          .slice(0, REVIEW_STORAGE_LIMIT),
      ),
    );
  } catch {
    // Ignore storage write failures in local fallback mode.
  }
}

function normalizeStoredReview(review = {}) {
  const rating = normalizeInteger(review.rating);
  const content = normalizeNullableText(review.content);
  const productId =
    review.productId ??
    review.product_id ??
    review.productID ??
    null;
  const orderItemId =
    review.orderItemId ??
    review.order_item_id ??
    review.orderItemID ??
    null;

  if (!productId || !orderItemId || !rating || !content) {
    return null;
  }

  return {
    id: review.id ?? createLocalId(),
    productId: String(productId),
    orderId:
      review.orderId === null || review.orderId === undefined
        ? null
        : String(review.orderId),
    orderItemId: String(orderItemId),
    userId:
      review.userId === null || review.userId === undefined
        ? null
        : String(review.userId),
    authorName:
      normalizeText(review.authorName ?? review.author_name) || "회원",
    rating,
    content,
    photoUrls: parsePhotoUrls(review.photoUrls ?? review.photo_urls),
    createdAt: review.createdAt ?? review.created_at ?? new Date().toISOString(),
    source: review.source ?? "local",
  };
}

function sortReviews(reviews = [], sort = "latest") {
  const normalizedSort =
    sort === "rating_high" || sort === "rating_low" ? sort : "latest";

  return [...reviews].sort((left, right) => {
    if (normalizedSort === "rating_high" && left.rating !== right.rating) {
      return right.rating - left.rating;
    }

    if (normalizedSort === "rating_low" && left.rating !== right.rating) {
      return left.rating - right.rating;
    }

    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return `${right.id}`.localeCompare(`${left.id}`);
  });
}

export function buildReviewSummary(reviews = []) {
  const ratingCounts = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  };

  if (!reviews.length) {
    return {
      averageRating: 0,
      totalCount: 0,
      ratingCounts,
    };
  }

  const totalRating = reviews.reduce((sum, review) => {
    const rating = normalizeInteger(review?.rating);
    if (rating && ratingCounts[rating] !== undefined) {
      ratingCounts[rating] += 1;
      return sum + rating;
    }

    return sum;
  }, 0);

  return {
    averageRating: Number((totalRating / reviews.length).toFixed(1)),
    totalCount: reviews.length,
    ratingCounts,
  };
}

function normalizeReviewSummary(summary = {}, fallbackReviews = []) {
  const fallbackSummary = buildReviewSummary(fallbackReviews);

  return {
    averageRating:
      Number(summary.averageRating ?? summary.average_rating ?? fallbackSummary.averageRating) || 0,
    totalCount:
      normalizeInteger(summary.totalCount ?? summary.total_count) ?? fallbackSummary.totalCount,
    ratingCounts: {
      5:
        normalizeInteger(summary.ratingCounts?.[5] ?? summary.ratingCounts?.["5"] ?? summary.rating_counts?.[5] ?? summary.rating_counts?.["5"]) ??
        fallbackSummary.ratingCounts[5],
      4:
        normalizeInteger(summary.ratingCounts?.[4] ?? summary.ratingCounts?.["4"] ?? summary.rating_counts?.[4] ?? summary.rating_counts?.["4"]) ??
        fallbackSummary.ratingCounts[4],
      3:
        normalizeInteger(summary.ratingCounts?.[3] ?? summary.ratingCounts?.["3"] ?? summary.rating_counts?.[3] ?? summary.rating_counts?.["3"]) ??
        fallbackSummary.ratingCounts[3],
      2:
        normalizeInteger(summary.ratingCounts?.[2] ?? summary.ratingCounts?.["2"] ?? summary.rating_counts?.[2] ?? summary.rating_counts?.["2"]) ??
        fallbackSummary.ratingCounts[2],
      1:
        normalizeInteger(summary.ratingCounts?.[1] ?? summary.ratingCounts?.["1"] ?? summary.rating_counts?.[1] ?? summary.rating_counts?.["1"]) ??
        fallbackSummary.ratingCounts[1],
    },
  };
}

function normalizeReviewRow(review = {}) {
  const normalizedRating = normalizeInteger(review.rating);
  const normalizedContent = normalizeNullableText(review.content);
  const productId = review.productId ?? review.product_id ?? null;
  const orderItemId = review.orderItemId ?? review.order_item_id ?? null;

  if (!productId || !normalizedRating || !normalizedContent) {
    return null;
  }

  return {
    id: review.id ?? createLocalId(),
    productId: String(productId),
    orderId:
      review.orderId === null || review.orderId === undefined
        ? null
        : String(review.orderId ?? review.order_id),
    orderItemId:
      orderItemId === null || orderItemId === undefined ? null : String(orderItemId),
    authorName:
      normalizeText(review.authorName ?? review.author_name) || "회원",
    rating: normalizedRating,
    ratingLabel: REVIEW_RATING_LABELS[normalizedRating] ?? "",
    content: normalizedContent,
    photoUrls: parsePhotoUrls(review.photoUrls ?? review.photo_urls),
    createdAt: review.createdAt ?? review.created_at ?? new Date().toISOString(),
  };
}

function buildLocalReviewsResult({ productId, sort = "latest", limit = 20, offset = 0 }) {
  const allReviews = readStoredReviews().filter(
    (review) => String(review.productId) === String(productId),
  );
  const sortedReviews = sortReviews(allReviews, sort);
  const pagedReviews = sortedReviews.slice(offset, offset + limit);
  const normalizedReviews = pagedReviews.map(normalizeReviewRow).filter(Boolean);

  return {
    summary: buildReviewSummary(sortedReviews),
    reviews: normalizedReviews,
    sort,
    hasMore: offset + limit < sortedReviews.length,
    source: "local",
    error: null,
  };
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("리뷰 이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function uploadReviewPhotos({ files = [], userId }) {
  if (!files.length) {
    return {
      photoUrls: [],
      source: "none",
      error: null,
    };
  }

  if (!isSupabaseConfigured || !supabase || !userId) {
    const photoUrls = await Promise.all(files.map(readFileAsDataUrl));
    return {
      photoUrls,
      source: "local",
      error: null,
    };
  }

  try {
    const uploadedUrls = [];

    for (const [index, file] of files.entries()) {
      const safeFileName = normalizeText(file.name).replace(/[^a-zA-Z0-9._-]/g, "-") || `review-${index + 1}.jpg`;
      const objectPath = `${userId}/${Date.now()}-${index}-${safeFileName}`;
      const { error: uploadError } = await supabase.storage
        .from(REVIEW_IMAGE_BUCKET)
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(REVIEW_IMAGE_BUCKET)
        .getPublicUrl(objectPath);

      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return {
      photoUrls: uploadedUrls,
      source: "supabase",
      error: null,
    };
  } catch (error) {
    if (!shouldUseLocalPhotoFallback(error)) {
      return {
        photoUrls: [],
        source: "fallback",
        error,
      };
    }

    const photoUrls = await Promise.all(files.map(readFileAsDataUrl));
    return {
      photoUrls,
      source: "local",
      error: null,
    };
  }
}

export async function fetchProductReviews({
  productId,
  sort = "latest",
  limit = 20,
  offset = 0,
} = {}) {
  if (!productId) {
    return {
      summary: buildReviewSummary([]),
      reviews: [],
      sort: "latest",
      hasMore: false,
      source: "empty",
      error: null,
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return buildLocalReviewsResult({ productId, sort, limit, offset });
  }

  const { data, error } = await supabase.rpc(REVIEW_RPC_NAME, {
    p_product_id: normalizeInteger(productId),
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (!shouldUseLocalSchemaFallback(error)) {
      return {
        summary: buildReviewSummary([]),
        reviews: [],
        sort,
        hasMore: false,
        source: "fallback",
        error,
      };
    }

    return buildLocalReviewsResult({ productId, sort, limit, offset });
  }

  const normalizedReviews = Array.isArray(data?.reviews)
    ? data.reviews.map(normalizeReviewRow).filter(Boolean)
    : [];

  return {
    summary: normalizeReviewSummary(data?.summary, normalizedReviews),
    reviews: normalizedReviews,
    sort: normalizeText(data?.sort) || sort,
    hasMore: Boolean(data?.has_more ?? data?.hasMore),
    source: "supabase",
    error: null,
  };
}

export function mergeLocalReviewsIntoOrders(orders = []) {
  const storedReviews = readStoredReviews();

  return orders.map((order) => {
    const items = Array.isArray(order.items)
      ? order.items.map((item) => {
          const existingReviewId = item.reviewId ?? item.review_id ?? item.review?.id ?? null;
          const matchingReview =
            existingReviewId
              ? normalizeReviewRow({
                  id: existingReviewId,
                  product_id: item.productId ?? item.product_id,
                  order_item_id: item.id,
                  author_name: item.review?.authorName ?? item.review?.author_name ?? "회원",
                  rating: item.reviewRating ?? item.review_rating ?? item.review?.rating,
                  content: item.review?.content ?? "리뷰 작성 완료",
                  photo_urls: item.review?.photoUrls ?? item.review?.photo_urls ?? [],
                  created_at: item.reviewCreatedAt ?? item.review_created_at ?? item.review?.createdAt,
                })
              : storedReviews.find((review) => String(review.orderItemId) === String(item.id)) ?? null;
          const canReview =
            order.status === "confirmed" &&
            !matchingReview &&
            Boolean(item.productId ?? item.product_id);

          return {
            ...item,
            productId: item.productId ?? item.product_id ?? null,
            reviewId: matchingReview?.id ?? existingReviewId,
            reviewRating:
              matchingReview?.rating ??
              normalizeInteger(item.reviewRating ?? item.review_rating ?? item.review?.rating),
            reviewCreatedAt:
              matchingReview?.createdAt ??
              item.reviewCreatedAt ??
              item.review_created_at ??
              item.review?.createdAt ??
              null,
            review: matchingReview,
            canReview,
          };
        })
      : [];

    return {
      ...order,
      items,
      canReview: items.some((item) => item.canReview),
    };
  });
}

function createAuthorName(profile = {}, user = null) {
  const authorName =
    normalizeText(profile?.nickname) ||
    normalizeText(profile?.name) ||
    normalizeText(profile?.email).split("@")[0] ||
    normalizeText(user?.email).split("@")[0];

  return authorName || "회원";
}

export async function submitProductReview({
  user,
  profile = null,
  order = null,
  orderItem = null,
  rating,
  content,
  files = [],
  demoMode = false,
} = {}) {
  if (!user) {
    return {
      review: null,
      source: "fallback",
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
    };
  }

  const normalizedRating = normalizeInteger(rating);
  const normalizedContent = normalizeText(content).slice(0, 200);

  if (!orderItem?.id || !orderItem?.productId) {
    return {
      review: null,
      source: "validation",
      error: new Error("리뷰를 작성할 상품 정보를 찾지 못했습니다."),
    };
  }

  if (!normalizedRating || normalizedRating < 1 || normalizedRating > 5) {
    return {
      review: null,
      source: "validation",
      error: new Error("별점을 선택해 주세요."),
    };
  }

  if (!normalizedContent) {
    return {
      review: null,
      source: "validation",
      error: new Error("한줄 리뷰를 입력해 주세요."),
    };
  }

  if (files.length > 3) {
    return {
      review: null,
      source: "validation",
      error: new Error("사진은 최대 3장까지 첨부할 수 있습니다."),
    };
  }

  const photoUploadResult = await uploadReviewPhotos({
    files,
    userId: user.id,
  });

  if (photoUploadResult.error) {
    return {
      review: null,
      source: photoUploadResult.source,
      error: photoUploadResult.error,
    };
  }

  const authorName = createAuthorName(profile, user);

  if (isSupabaseConfigured && supabase && !demoMode && typeof orderItem.id === "number") {
    const { data, error } = await supabase.rpc(REVIEW_CREATE_RPC_NAME, {
      p_order_item_id: orderItem.id,
      p_rating: normalizedRating,
      p_content: normalizedContent,
      p_photo_urls: photoUploadResult.photoUrls,
    });

    if (!error) {
      return {
        review: normalizeReviewRow({
          ...data,
          product_id: data?.product_id ?? orderItem.productId,
          order_item_id: data?.order_item_id ?? orderItem.id,
          author_name: data?.author_name ?? authorName,
          rating: data?.rating ?? normalizedRating,
          content: data?.content ?? normalizedContent,
          photo_urls: data?.photo_urls ?? photoUploadResult.photoUrls,
        }),
        source: "supabase",
        error: null,
      };
    }

    if (!shouldUseLocalSchemaFallback(error)) {
      return {
        review: null,
        source: "fallback",
        error,
      };
    }
  }

  const nextReview = normalizeStoredReview({
    id: createLocalId(),
    productId: orderItem.productId,
    orderId: order?.id ?? null,
    orderItemId: orderItem.id,
    userId: user.id,
    authorName,
    rating: normalizedRating,
    content: normalizedContent,
    photoUrls: photoUploadResult.photoUrls,
    createdAt: new Date().toISOString(),
    source: "local",
  });

  const storedReviews = readStoredReviews().filter(
    (review) => String(review.orderItemId) !== String(orderItem.id),
  );
  writeStoredReviews([nextReview, ...storedReviews]);

  return {
    review: normalizeReviewRow(nextReview),
    source: "local",
    error: null,
  };
}
