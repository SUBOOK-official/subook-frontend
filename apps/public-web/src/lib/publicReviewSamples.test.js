import assert from "node:assert/strict";
import test from "node:test";
import { getReviewPageRequest, getSampleReviews, mergeSampleReviewPage } from "./publicReviewSamples.js";

test("샘플과 실구매 후기를 섞어도 50건 이후까지 모든 페이지가 중복·누락 없이 이어진다", () => {
  for (const productId of [2370, 2371, 500]) {
    const samples = getSampleReviews(productId);
    for (const total of [0, 1, 7, 10, 51, 137]) {
      for (const sameCount of new Set([0, Math.min(3, total), total])) {
        const realItems = Array.from({ length: total }, (_, index) => ({
          id: index % 2 ? -index - 1 : index + 1,
          isSameProduct: index < sameCount,
          createdAt: new Date(Date.UTC(2026, 8, 12, 12, 0, total - index)).toISOString(),
        }));
        const expected = [
          ...realItems.slice(0, sameCount),
          ...samples.filter((item) => item.isSameProduct),
          ...realItems.slice(sameCount),
          ...samples.filter((item) => !item.isSameProduct),
        ];
        for (const pageSize of [1, 10]) {
          const actual = [];
          for (let offset = 0; offset < expected.length; offset += pageSize) {
            const request = getReviewPageRequest({ limit: pageSize, offset }, samples.length);
            // 실제 RPC는 정렬된 실구매 후기 중 요청한 구간만 반환한다.
            const summary = {
              total,
              items: realItems.slice(request.serverOffset, request.serverOffset + request.serverLimit),
            };
            const page = mergeSampleReviewPage(summary, samples, request);
            assert.equal(page.total, expected.length);
            assert.ok(request.serverLimit <= 50);
            actual.push(...page.items);
          }
          assert.deepEqual(actual.map((item) => item.id), expected.map((item) => item.id));
          assert.equal(new Set(actual.map((item) => item.id)).size, actual.length);
        }
      }
    }
  }
});

test("더미 별점은 실구매 평점·동일상품 구매 수·분석용 후기 수를 바꾸지 않는다", () => {
  const samples = getSampleReviews(2370);
  const summary = {
    total: 2,
    average: 2.5,
    ratingCounts: { 1: 1, 4: 1 },
    sameProductCount: 1,
    items: [],
  };
  const merged = mergeSampleReviewPage(summary, samples, getReviewPageRequest({}, samples.length));
  assert.equal(merged.purchaseTotal, 2);
  assert.equal(merged.average, 2.5);
  assert.deepEqual(merged.ratingCounts, { 1: 1, 4: 1 });
  assert.equal(merged.sameProductCount, 1);
  assert.equal(summary.total, 2);
});
