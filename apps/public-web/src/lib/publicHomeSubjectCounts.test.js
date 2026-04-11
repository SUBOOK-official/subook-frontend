import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_SUBJECT_COUNT_CACHE_TTL_MS,
  aggregateHomeSubjectCountsFromProducts,
  getTotalHomeSubjectCount,
  isHomeSubjectCountCacheStale,
  normalizeHomeSubjectCountRows,
} from "./publicHomeSubjectCountUtils.js";

test("normalizeHomeSubjectCountRows fills missing subjects with zero and ignores invalid rows", () => {
  const counts = normalizeHomeSubjectCountRows([
    { subject: "수학", count: "12" },
    { subject: "국어", product_count: 7 },
    { subject: "없는과목", count: 99 },
    { subject: "영어", count: -2 },
  ]);

  assert.deepEqual(counts, {
    수학: 12,
    국어: 7,
    영어: 0,
    과학: 0,
    사회: 0,
    한국사: 0,
    기타: 0,
  });
});

test("normalizeHomeSubjectCountRows supports cached object maps from localStorage", () => {
  const counts = normalizeHomeSubjectCountRows({
    수학: 5,
    국어: "4",
    영어: null,
    과학: 2,
  });

  assert.deepEqual(counts, {
    수학: 5,
    국어: 4,
    영어: 0,
    과학: 2,
    사회: 0,
    한국사: 0,
    기타: 0,
  });
});

test("aggregateHomeSubjectCountsFromProducts counts storefront products by subject", () => {
  const counts = aggregateHomeSubjectCountsFromProducts([
    { id: "math-1", subject: "수학" },
    { id: "math-2", subject: "수학" },
    { id: "english-1", subject: "영어" },
    { id: "unknown-1", subject: "없는과목" },
  ]);

  assert.equal(counts.수학, 2);
  assert.equal(counts.영어, 1);
  assert.equal(counts.국어, 0);
  assert.equal(getTotalHomeSubjectCount(counts), 3);
});

test("isHomeSubjectCountCacheStale expires entries after one hour", () => {
  const now = 10_000_000;
  const freshTimestamp = now - HOME_SUBJECT_COUNT_CACHE_TTL_MS + 1;
  const staleTimestamp = now - HOME_SUBJECT_COUNT_CACHE_TTL_MS;

  assert.equal(isHomeSubjectCountCacheStale(freshTimestamp, now), false);
  assert.equal(isHomeSubjectCountCacheStale(staleTimestamp, now), true);
  assert.equal(isHomeSubjectCountCacheStale(0, now), true);
});
