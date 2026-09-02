import assert from "node:assert/strict";
import test from "node:test";
import {
  extractReviewStoragePath,
  formatReviewProductTitle,
  getReviewRatingLabel,
  mergeReviewItems,
  normalizeReviewSummary,
  validateReviewDraft,
} from "./publicReviewsUtils.js";

test("formatReviewProductTitle appends remaining book count", () => {
  assert.equal(formatReviewProductTitle("시대인재 수학 N제", 1), "시대인재 수학 N제");
  assert.equal(formatReviewProductTitle("시대인재 수학 N제", 3), "시대인재 수학 N제 외 2권");
  assert.equal(formatReviewProductTitle("", 2), "교재 외 1권");
  assert.equal(formatReviewProductTitle("  공백  ", null), "공백");
});

test("validateReviewDraft enforces rating, length, and photo cap", () => {
  assert.equal(validateReviewDraft({ rating: 0, content: "열 글자 이상 되는 후기 본문" }), "별점을 선택해 주세요.");
  assert.equal(validateReviewDraft({ rating: 5, content: "짧아요" }), "후기는 10자 이상 작성해 주세요.");
  assert.equal(
    validateReviewDraft({ rating: 5, content: "a".repeat(501) }),
    "후기는 500자까지 작성할 수 있어요.",
  );
  assert.equal(
    validateReviewDraft({ rating: 5, content: "열 글자 이상 되는 후기 본문", photoCount: 4 }),
    "사진은 최대 3장까지 첨부할 수 있어요.",
  );
  assert.equal(validateReviewDraft({ rating: 4, content: "  상태가 설명보다 좋아요!  ", photoCount: 3 }), "");
});

test("getReviewRatingLabel maps 1-5 and blanks otherwise", () => {
  assert.equal(getReviewRatingLabel(1), "별로예요");
  assert.equal(getReviewRatingLabel("5"), "최고예요");
  assert.equal(getReviewRatingLabel(0), "");
});

test("extractReviewStoragePath strips bucket public URL prefix and query", () => {
  const url =
    "https://x.supabase.co/storage/v1/object/public/review-images/uid-1/42/1700000000-1.jpg?width=200";
  assert.equal(extractReviewStoragePath(url), "uid-1/42/1700000000-1.jpg");
  assert.equal(extractReviewStoragePath("https://example.com/a.jpg"), null);
  assert.equal(extractReviewStoragePath(null), null);
});

test("normalizeReviewSummary fills rating counts and normalizes items", () => {
  const summary = normalizeReviewSummary({
    total: "2",
    average: "4.5",
    rating_counts: { 5: 1, "4": "1" },
    same_product_count: 1,
    items: [
      {
        id: "7",
        author: "se****",
        rating: 5,
        content: "좋아요 정말 좋아요",
        photo_urls: ["https://a/1.jpg", null],
        product_id: 12,
        product_title: "교재",
        item_count: 2,
        is_same_product: true,
        created_at: "2026-09-02T00:00:00Z",
      },
      { id: "bad" },
    ],
  });
  assert.equal(summary.total, 2);
  assert.equal(summary.average, 4.5);
  assert.deepEqual(summary.ratingCounts, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
  assert.equal(summary.sameProductCount, 1);
  assert.equal(summary.items.length, 1);
  assert.deepEqual(summary.items[0].photoUrls, ["https://a/1.jpg"]);
  assert.equal(summary.items[0].isSameProduct, true);
});

test("normalizeReviewItem normalizes purchased item list", () => {
  const summary = normalizeReviewSummary({
    total: 1,
    items: [
      {
        id: 3,
        rating: 5,
        content: "충분히 긴 후기 본문입니다",
        item_count: 3,
        items: [
          { product_id: "10", title: "A 교재", cover_image_url: "https://a/c.jpg", quantity: "2" },
          { product_id: null, title: "", cover_image_url: null, quantity: 0 },
          null,
        ],
      },
    ],
  });
  assert.deepEqual(summary.items[0].items, [
    { productId: 10, title: "A 교재", coverImageUrl: "https://a/c.jpg", quantity: 2 },
    { productId: null, title: "교재", coverImageUrl: null, quantity: 1 },
  ]);
  assert.deepEqual(normalizeReviewSummary({ items: [{ id: 1 }] }).items[0].items, []);
});

test("normalizeReviewSummary tolerates empty payloads", () => {
  const summary = normalizeReviewSummary(null);
  assert.equal(summary.total, 0);
  assert.equal(summary.average, null);
  assert.deepEqual(summary.items, []);
});

test("mergeReviewItems dedupes by id while keeping order", () => {
  const merged = mergeReviewItems([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]);
  assert.deepEqual(
    merged.map((item) => item.id),
    [1, 2, 3],
  );
});
