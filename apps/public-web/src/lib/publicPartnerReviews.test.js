import assert from "node:assert/strict";
import test from "node:test";
import { getPartnerReviews, getReviewPageRequest, mergePartnerReviewPage } from "./publicPartnerReviews.js";

test("외부 후기와 주문 후기가 날짜 사이에 섞여도 50건 이후까지 중복·누락 없이 이어진다", () => {
  for (const productId of [2370, 2371, 500]) {
    const partnerReviews = getPartnerReviews(productId);
    // 지정 표시일의 최신순: 9/12 세 건 → 9/9 두 건 → 9/7 두 건.
    const byDate = [
      "partner-j1-full-3", "partner-j1-full-4", "partner-j1-mini-1",
      "partner-j1-mini-2", "partner-j1-mini-3", "partner-j1-full-1", "partner-j1-full-2",
    ].map((id) => partnerReviews.find((item) => item.id === id));
    for (const total of [0, 1, 7, 10, 51, 137]) {
      for (const sameCount of new Set([0, Math.min(3, total), total])) {
        // 주문 후기가 외부 후기보다 오래된 경우, 날짜 사이, 더 최신인 경우를 모두 확인한다.
        for (const day of [6, 9, 14]) {
          const realItems = Array.from({ length: total }, (_, index) => ({
            id: index % 2 ? -index - 1 : index + 1,
            isSameProduct: index < sameCount,
            createdAt: new Date(Date.UTC(2026, 8, day, 12, 0, total - index)).toISOString(),
          }));
          const newer = byDate.filter((item) => Date.parse(item.createdAt) > Date.UTC(2026, 8, day, 12));
          const older = byDate.filter((item) => !newer.includes(item));
          const expected = [
            ...newer.filter((item) => item.isSameProduct),
            ...realItems.slice(0, sameCount),
            ...older.filter((item) => item.isSameProduct),
            ...newer.filter((item) => !item.isSameProduct),
            ...realItems.slice(sameCount),
            ...older.filter((item) => !item.isSameProduct),
          ];
          for (const pageSize of [1, 10]) {
            const actual = [];
            for (let offset = 0; offset < expected.length; offset += pageSize) {
              const request = getReviewPageRequest({ limit: pageSize, offset }, partnerReviews.length);
              // 실제 RPC는 정렬된 주문 후기 중 요청한 구간만 반환한다.
              const summary = {
                total,
                items: realItems.slice(request.serverOffset, request.serverOffset + request.serverLimit),
              };
              const page = mergePartnerReviewPage(summary, partnerReviews, request);
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
  }
});

test("외부 수집 후기는 주문 원장의 평점·동일상품 구매 수·분석용 구매 후기 수를 바꾸지 않는다", () => {
  const partnerReviews = getPartnerReviews(2370);
  const summary = {
    total: 2,
    average: 2.5,
    ratingCounts: { 1: 1, 4: 1 },
    sameProductCount: 1,
    items: [],
  };
  const merged = mergePartnerReviewPage(summary, partnerReviews, getReviewPageRequest({}, partnerReviews.length));
  assert.equal(merged.purchaseTotal, 2);
  assert.equal(merged.average, 2.5);
  assert.deepEqual(merged.ratingCounts, { 1: 1, 4: 1 });
  assert.equal(merged.sameProductCount, 1);
  assert.equal(summary.total, 2);
});
