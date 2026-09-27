import test from "node:test";
import assert from "node:assert/strict";
import { loadMemberRecommendations } from "./memberRecommendations.js";

const orders = [{ status: "confirmed", items: [{ product_id: 1 }] }, { status: "cancelled", items: [{ product_id: 2 }] }];
test("구매 신호가 추천을 만들지 못하면 찜으로 전환하고 구매상품은 제외한다", async () => {
  const result = await loadMemberRecommendations({ orders, favoriteIds: [3],
    loadSignals: async (ids) => ids[0] === 1 ? [] : [{ id: 3, subject: "수학" }],
    loadProducts: async () => ({ products: [{ id: 1 }, { id: 4, subject: "수학" }, { id: 5, isSoldOut: true }] }),
  });
  assert.equal(result.source, "wishlist");
  assert.deepEqual(result.products.map((p) => p.id), [4]);
});
test("구매·찜 요청 실패 시 BEST에서도 구매/품절/비공개는 제외한다", async () => {
  const result = await loadMemberRecommendations({ orders, favoriteIds: [3],
    loadSignals: async () => { throw Error("offline"); },
    loadProducts: async () => ({ products: [{ id: 1 }, { id: 2 }, { id: 3, isPublic: false }, { id: 4, isSoldOut: true }] }),
  });
  assert.equal(result.source, "best");
  assert.deepEqual(result.products.map((p) => p.id), [2]);
});
