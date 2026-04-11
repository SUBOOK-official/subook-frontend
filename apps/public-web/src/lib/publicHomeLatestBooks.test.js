import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_LATEST_BOOKS_BADGE_WINDOW_MS,
  HOME_LATEST_BOOKS_CACHE_TTL_MS,
  isHomeLatestBooksCacheStale,
  isNewHomeArrivalBadgeVisible,
  normalizeHomeLatestBooks,
} from "./publicHomeLatestBooksUtils.js";

test("normalizeHomeLatestBooks keeps only public, non-hidden products and sorts by latest first", () => {
  const products = [
    { id: "book-1", createdAt: "2026-04-01T09:00:00+09:00" },
    { id: "book-2", createdAt: "2026-04-02T09:00:00+09:00" },
    { id: "book-3", createdAt: "2026-04-03T09:00:00+09:00" },
    { id: "book-4", createdAt: "2026-04-04T09:00:00+09:00" },
    { id: "book-5", createdAt: "2026-04-05T09:00:00+09:00" },
    { id: "book-6", createdAt: "2026-04-06T09:00:00+09:00" },
    { id: "book-7", createdAt: "2026-04-07T09:00:00+09:00" },
    { id: "book-8", createdAt: "2026-04-08T09:00:00+09:00" },
    { id: "book-9", createdAt: "2026-04-09T09:00:00+09:00" },
    { id: "hidden-book", status: "hidden", createdAt: "2026-04-10T09:00:00+09:00" },
    { id: "private-book", isPublic: false, createdAt: "2026-04-11T09:00:00+09:00" },
    { createdAt: "2026-04-12T09:00:00+09:00" },
  ];

  const normalized = normalizeHomeLatestBooks(products);

  assert.equal(normalized.length, 8);
  assert.deepEqual(normalized.map((product) => product.id), [
    "book-9",
    "book-8",
    "book-7",
    "book-6",
    "book-5",
    "book-4",
    "book-3",
    "book-2",
  ]);
});

test("isHomeLatestBooksCacheStale expires entries after thirty minutes", () => {
  const now = 10_000_000;
  const freshTimestamp = now - HOME_LATEST_BOOKS_CACHE_TTL_MS + 1;
  const staleTimestamp = now - HOME_LATEST_BOOKS_CACHE_TTL_MS;

  assert.equal(isHomeLatestBooksCacheStale(freshTimestamp, now), false);
  assert.equal(isHomeLatestBooksCacheStale(staleTimestamp, now), true);
  assert.equal(isHomeLatestBooksCacheStale(0, now), true);
});

test("isNewHomeArrivalBadgeVisible only keeps the N badge for seven days", () => {
  const now = new Date("2026-04-08T09:00:00+09:00").getTime();

  assert.equal(
    isNewHomeArrivalBadgeVisible(
      { createdAt: new Date(now - HOME_LATEST_BOOKS_BADGE_WINDOW_MS + 60_000).toISOString() },
      now,
    ),
    true,
  );
  assert.equal(
    isNewHomeArrivalBadgeVisible(
      { createdAt: new Date(now - HOME_LATEST_BOOKS_BADGE_WINDOW_MS - 60_000).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(isNewHomeArrivalBadgeVisible({ createdAt: null }, now), false);
});
