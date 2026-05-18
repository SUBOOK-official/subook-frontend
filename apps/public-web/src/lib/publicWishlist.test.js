import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeWishlistProductIds,
  normalizeWishlistProductIds,
  sortWishlistProductsByIds,
} from "./publicWishlistUtils.js";

test("normalizeWishlistProductIds removes blanks and duplicates while keeping order", () => {
  assert.deepEqual(
    normalizeWishlistProductIds([null, "", "101", "202", "101", " 202 ", "mock-book-1"]),
    ["101", "202", "mock-book-1"],
  );
});

test("mergeWishlistProductIds appends new products and keeps existing positions", () => {
  // 신규 ID는 맨 끝에 append (백엔드 created_at DESC 정렬이 source of truth이므로,
  // 클라이언트에서는 토글 직후 카드 위치가 점프하지 않도록 기존 순서를 유지).
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "303", true), ["101", "202", "303"]);
  // 이미 있는 ID를 다시 활성화하면 위치 변동 없이 그대로.
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "101", true), ["101", "202"]);
  // 비활성화는 단순 제거.
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "101", false), ["202"]);
  // nextActive 미지정 시 토글 → 이미 있으면 제거.
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "202"), ["101"]);
});

test("sortWishlistProductsByIds follows the saved wishlist order", () => {
  const products = [
    { id: "303", title: "세 번째" },
    { id: "101", title: "첫 번째" },
    { id: "202", title: "두 번째" },
  ];

  assert.deepEqual(
    sortWishlistProductsByIds(products, ["101", "202", "303"]).map((product) => product.id),
    ["101", "202", "303"],
  );
});
