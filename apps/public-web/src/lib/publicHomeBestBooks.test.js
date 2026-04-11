import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_BEST_BOOKS_CACHE_TTL_MS,
  isHomeBestBooksCacheStale,
  normalizeHomeBestBooks,
} from "./publicHomeBestBooksUtils.js";

test("normalizeHomeBestBooks keeps only public, non-hidden products and caps the result at eight", () => {
  const products = [
    { id: "book-1", salesCount: 4, viewCount: 100, favoriteCount: 9, createdAt: "2026-04-01T09:00:00+09:00" },
    { id: "book-2", salesCount: 9, viewCount: 20, favoriteCount: 2, createdAt: "2026-04-02T09:00:00+09:00" },
    { id: "book-3", salesCount: 9, viewCount: 40, favoriteCount: 2, createdAt: "2026-04-03T09:00:00+09:00" },
    { id: "book-4", salesCount: 8, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-04T09:00:00+09:00" },
    { id: "book-5", salesCount: 7, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-05T09:00:00+09:00" },
    { id: "book-6", salesCount: 6, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-06T09:00:00+09:00" },
    { id: "book-7", salesCount: 5, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-07T09:00:00+09:00" },
    { id: "book-8", salesCount: 3, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-08T09:00:00+09:00" },
    { id: "book-9", salesCount: 2, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-09T09:00:00+09:00" },
    { id: "book-10", salesCount: 1, viewCount: 10, favoriteCount: 5, createdAt: "2026-04-10T09:00:00+09:00" },
    { id: "hidden-book", status: "hidden", salesCount: 99, viewCount: 99, favoriteCount: 99, createdAt: "2026-04-11T09:00:00+09:00" },
    { id: "private-book", isPublic: false, salesCount: 98, viewCount: 98, favoriteCount: 98, createdAt: "2026-04-12T09:00:00+09:00" },
    { salesCount: 50, viewCount: 50, favoriteCount: 50, createdAt: "2026-04-13T09:00:00+09:00" },
  ];

  const normalized = normalizeHomeBestBooks(products);

  assert.equal(normalized.length, 8);
  assert.deepEqual(normalized.map((product) => product.id), [
    "book-3",
    "book-2",
    "book-4",
    "book-5",
    "book-6",
    "book-7",
    "book-1",
    "book-8",
  ]);
});

test("isHomeBestBooksCacheStale expires entries after one hour", () => {
  const now = 10_000_000;
  const freshTimestamp = now - HOME_BEST_BOOKS_CACHE_TTL_MS + 1;
  const staleTimestamp = now - HOME_BEST_BOOKS_CACHE_TTL_MS;

  assert.equal(isHomeBestBooksCacheStale(freshTimestamp, now), false);
  assert.equal(isHomeBestBooksCacheStale(staleTimestamp, now), true);
  assert.equal(isHomeBestBooksCacheStale(0, now), true);
});
