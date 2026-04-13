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

test("mergeWishlistProductIds adds new products to the front and removes existing ones", () => {
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "303", true), ["303", "101", "202"]);
  assert.deepEqual(mergeWishlistProductIds(["101", "202"], "101", false), ["202"]);
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
