import test from "node:test";
import assert from "node:assert/strict";
import {
  addRecentSearchTerm,
  buildStoreAutocomplete,
  buildStoreAutocompleteFromSearchRows,
  extractInitialConsonants,
  hasAutocompleteResults,
  matchesKeyword,
  matchesKeywordAcrossFields,
  normalizeRecentSearches,
  removeRecentSearchTerm,
} from "./publicStoreSearch.js";

const catalog = [
  {
    id: "book-1",
    title: "시대인재 2026 수학 N제",
    brand: "시대인재",
    publishedYear: 2026,
    subject: "수학",
    instructorName: "현우진",
  },
  {
    id: "book-2",
    title: "시대인재 2026 수학 기출 파이널",
    brand: "시대인재",
    publishedYear: 2026,
    subject: "수학",
    instructorName: "현우진",
  },
  {
    id: "book-3",
    title: "시대인재 2025 수학 올림피아드",
    brand: "시대인재",
    publishedYear: 2025,
    subject: "수학",
    instructorName: "현우진",
  },
  {
    id: "book-4",
    title: "강남대성 국어 모의고사 파이널",
    brand: "강남대성",
    publishedYear: 2026,
    subject: "국어",
    instructorName: "김동욱",
  },
  {
    id: "book-5",
    title: "EBS 수능완성 영어",
    brand: "EBS",
    publishedYear: 2026,
    subject: "영어",
    instructorName: "이명학",
  },
];

test("extractInitialConsonants converts Hangul syllables into choseong", () => {
  assert.equal(extractInitialConsonants("시대인재"), "ㅅㄷㅇㅈ");
  assert.equal(extractInitialConsonants("EBS 수능완성"), "ebsㅅㄴㅇㅅ");
});

test("matchesKeyword supports plain substring and choseong matching", () => {
  assert.equal(matchesKeyword("시대인재", "시대"), true);
  assert.equal(matchesKeyword("시대인재", "ㅅㄷㅇㅈ"), true);
  assert.equal(matchesKeyword("강남대성", "ㅅㄷㅇㅈ"), false);
});

test("matchesKeywordAcrossFields returns true when any searchable field matches", () => {
  assert.equal(
    matchesKeywordAcrossFields(["현우진", "시대인재", "수학"], "ㅅㄷㅇㅈ"),
    true,
  );
  assert.equal(
    matchesKeywordAcrossFields(["현우진", "시대인재", "수학"], "김동욱"),
    false,
  );
});

test("buildStoreAutocomplete returns categorized suggestions with spec limits", () => {
  const autocomplete = buildStoreAutocomplete(catalog, "시대인재");

  assert.equal(autocomplete.books.length, 3);
  assert.deepEqual(
    autocomplete.books.map((item) => item.label),
    [
      "시대인재 2026 수학 N제",
      "시대인재 2026 수학 기출 파이널",
      "시대인재 2025 수학 올림피아드",
    ],
  );
  assert.equal(autocomplete.instructors.length, 0);
  assert.deepEqual(autocomplete.brands, [
    {
      id: "brand-시대인재",
      kind: "brand",
      brand: "시대인재",
      label: "시대인재",
      meta: "3개 교재",
      count: 3,
    },
  ]);
  assert.equal(hasAutocompleteResults(autocomplete), true);
});

test("buildStoreAutocomplete matches instructors by name and respects choseong queries", () => {
  const autocomplete = buildStoreAutocomplete(catalog, "ㅎㅇㅈ");

  assert.deepEqual(autocomplete.books, []);
  assert.deepEqual(autocomplete.instructors, [
    {
      id: "instructor-현우진",
      kind: "instructor",
      keyword: "현우진",
      label: "현우진",
      meta: "시대인재 · 수학",
    },
  ]);
});

test("buildStoreAutocomplete ignores one-character keywords", () => {
  const autocomplete = buildStoreAutocomplete(catalog, "수");

  assert.deepEqual(autocomplete, {
    books: [],
    instructors: [],
    brands: [],
  });
});

test("recent search helpers deduplicate, cap to five, and remove items safely", () => {
  const normalized = normalizeRecentSearches(["현우진", "", "현우진", "국어 모의고사"]);
  assert.deepEqual(normalized, ["현우진", "국어 모의고사"]);

  const appended = addRecentSearchTerm(
    ["국어 모의고사", "현우진", "EBS 수능완성", "시대인재", "N제"],
    "강남대성",
  );
  assert.deepEqual(appended, ["강남대성", "국어 모의고사", "현우진", "EBS 수능완성", "시대인재"]);

  const deduped = addRecentSearchTerm(appended, "현우진");
  assert.deepEqual(deduped, ["현우진", "강남대성", "국어 모의고사", "EBS 수능완성", "시대인재"]);

  assert.deepEqual(removeRecentSearchTerm(deduped, "국어 모의고사"), [
    "현우진",
    "강남대성",
    "EBS 수능완성",
    "시대인재",
  ]);
});

// ─── 서버 검색 rows 기반 자동완성 (카탈로그 500 상한 탈출 이후 경로) ───

const serverSearchRows = [
  {
    id: 501,
    title: "시대인재 서바이벌 수학 시즌1",
    brand: "시대인재",
    subject: "수학",
    published_year: 2026,
    instructor_name: "현우진",
  },
  {
    id: 502,
    title: "시대인재 서바이벌 수학 시즌2",
    brand: "시대인재",
    subject: "수학",
    published_year: 2026,
    instructor_name: "현우진",
  },
  {
    // 같은 제목 중복 → dedupe 대상
    id: 503,
    title: "시대인재 서바이벌 수학 시즌1",
    brand: "시대인재",
    subject: "수학",
    published_year: 2026,
    instructor_name: null,
  },
  {
    // 제목은 매칭됐지만 강사/브랜드는 키워드와 무관 → 강사·브랜드 제안으로 승격 금지
    id: 504,
    title: "수학의 정석 시대별 기출",
    brand: "성지출판",
    subject: "수학",
    published_year: 2025,
    instructor_name: "홍성지",
  },
];

test("buildStoreAutocompleteFromSearchRows maps snake_case rows and dedupes titles", () => {
  const autocomplete = buildStoreAutocompleteFromSearchRows(serverSearchRows, "시대인재");

  assert.deepEqual(
    autocomplete.books.map((book) => book.productId),
    [501, 502, 504],
  );
  assert.equal(autocomplete.books[0].meta.includes("2026"), true);

  // 강사 '현우진'은 키워드 '시대인재'와 무관 → 승격 안 됨
  assert.deepEqual(autocomplete.instructors, []);

  // 브랜드 '시대인재'는 매칭 3건으로 승격, '성지출판'은 미매칭
  assert.equal(autocomplete.brands.length, 1);
  assert.equal(autocomplete.brands[0].brand, "시대인재");
  assert.equal(autocomplete.brands[0].count, 3);
});

test("buildStoreAutocompleteFromSearchRows promotes instructor when keyword matches (초성 포함)", () => {
  const byName = buildStoreAutocompleteFromSearchRows(serverSearchRows, "현우진");
  assert.equal(byName.instructors.length, 1);
  assert.equal(byName.instructors[0].label, "현우진");

  const byChosung = buildStoreAutocompleteFromSearchRows(serverSearchRows, "ㅎㅇㅈ");
  assert.equal(byChosung.instructors.length, 1);
  assert.equal(byChosung.instructors[0].label, "현우진");
});

test("buildStoreAutocompleteFromSearchRows returns empty for short keyword or invalid rows", () => {
  assert.deepEqual(buildStoreAutocompleteFromSearchRows(serverSearchRows, "수"), {
    books: [],
    instructors: [],
    brands: [],
  });
  assert.deepEqual(buildStoreAutocompleteFromSearchRows(null, "시대인재"), {
    books: [],
    instructors: [],
    brands: [],
  });
});

test("buildStoreAutocompleteFromSearchRows caps book suggestions at the shared limit", () => {
  const manyRows = Array.from({ length: 12 }, (_, index) => ({
    id: 700 + index,
    title: `수학 문제집 ${index + 1}권`,
    brand: "수북문고",
    subject: "수학",
    published_year: 2026,
    instructor_name: "",
  }));
  const autocomplete = buildStoreAutocompleteFromSearchRows(manyRows, "수학");
  assert.equal(autocomplete.books.length, 5);
});
