import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStoreFilterGroup,
  cloneStoreFilters,
  countSelectedStoreFilters,
  STORE_DEFAULT_SUBJECT,
  areSelectedFiltersEqual,
  isValidStoreSort,
  parseStorefrontQuery,
  serializeStorefrontQuery,
  toggleStoreFilterSelection,
} from "./publicStoreNavigation.js";

test("parseStorefrontQuery falls back to the default subject for invalid values", () => {
  const parsed = parseStorefrontQuery("?subject=없는과목&sort=unknown&page=-2");

  assert.equal(parsed.selectedSubject, STORE_DEFAULT_SUBJECT);
  // 기본 정렬은 '인기순(popular)' — 유효하지 않은 sort 값은 이 기본값으로 폴백.
  assert.equal(parsed.sortOption, "popular");
  assert.equal(parsed.page, 1);
});

test("parseStorefrontQuery accepts spec query keys and legacy plural keys", () => {
  const parsed = parseStorefrontQuery(
    "?subject=수학&type=기출,N제&brands=시대인재,대성마이맥&year=2026&conditionGrades=S,A_PLUS&q=현우진",
  );

  assert.deepEqual(parsed.selectedFilters.types, ["기출", "N제"]);
  assert.deepEqual(parsed.selectedFilters.brands, ["시대인재", "대성마이맥"]);
  assert.deepEqual(parsed.selectedFilters.years, ["2026"]);
  assert.deepEqual(parsed.selectedFilters.conditionGrades, ["S", "A_PLUS"]);
  assert.equal(parsed.searchKeyword, "현우진");
  assert.equal(parsed.selectedSubject, "수학");
});

test("parseStorefrontQuery ignores unknown filter values and deduplicates values", () => {
  const parsed = parseStorefrontQuery(
    "?type=기출,없는유형,기출&brand=시대인재,없는브랜드&year=2026,2023&grade=S,B,S",
  );

  assert.deepEqual(parsed.selectedFilters.types, ["기출"]);
  assert.deepEqual(parsed.selectedFilters.brands, ["시대인재"]);
  assert.deepEqual(parsed.selectedFilters.years, ["2026"]);
  assert.deepEqual(parsed.selectedFilters.conditionGrades, ["S"]);
});

test("serializeStorefrontQuery uses spec query keys and omits defaults", () => {
  const serialized = serializeStorefrontQuery({
    selectedSubject: "영어",
    selectedFilters: {
      types: ["기출"],
      brands: ["시대인재"],
      years: ["2026"],
      conditionGrades: ["S"],
    },
    // 'popular'는 이제 기본 정렬이라 URL에서 생략됨 → 비기본 정렬(latest)로 직렬화 검증.
    sortOption: "latest",
    searchKeyword: "파이널",
    currentPage: 3,
  });

  assert.equal(
    serialized,
    "subject=%EC%98%81%EC%96%B4&type=%EA%B8%B0%EC%B6%9C&brand=%EC%8B%9C%EB%8C%80%EC%9D%B8%EC%9E%AC&year=2026&grade=S&sort=latest&q=%ED%8C%8C%EC%9D%B4%EB%84%90&page=3",
  );
});

test("cloneStoreFilters returns a safe copy of the current filter selections", () => {
  const original = {
    types: ["기출"],
    brands: ["시대인재"],
    years: ["2026"],
    conditionGrades: ["S"],
  };
  const cloned = cloneStoreFilters(original);

  cloned.types.push("N제");

  assert.deepEqual(original.types, ["기출"]);
  assert.deepEqual(cloned.types, ["기출", "N제"]);
});

test("toggleStoreFilterSelection adds and removes values by group", () => {
  const initialFilters = {
    types: ["기출"],
    brands: [],
    years: [],
    conditionGrades: [],
  };

  const afterAdd = toggleStoreFilterSelection(initialFilters, "types", "N제");
  const afterRemove = toggleStoreFilterSelection(afterAdd, "types", "기출");

  assert.deepEqual(afterAdd.types, ["기출", "N제"]);
  assert.deepEqual(afterRemove.types, ["N제"]);
});

test("clearStoreFilterGroup and countSelectedStoreFilters reflect committed selections", () => {
  const filters = {
    types: ["기출", "N제"],
    brands: ["시대인재"],
    years: ["2026"],
    conditionGrades: [],
  };

  assert.equal(countSelectedStoreFilters(filters), 4);
  assert.deepEqual(clearStoreFilterGroup(filters, "types"), {
    types: [],
    brands: ["시대인재"],
    years: ["2026"],
    conditionGrades: [],
  });
});

test("areSelectedFiltersEqual compares each filter group independently", () => {
  assert.equal(
    areSelectedFiltersEqual(
      {
        types: ["기출"],
        brands: [],
        years: ["2026"],
        conditionGrades: ["S"],
      },
      {
        types: ["기출"],
        brands: [],
        years: ["2026"],
        conditionGrades: ["S"],
      },
    ),
    true,
  );

  assert.equal(
    areSelectedFiltersEqual(
      {
        types: ["기출"],
        brands: [],
        years: ["2026"],
        conditionGrades: ["S"],
      },
      {
        types: ["N제"],
        brands: [],
        years: ["2026"],
        conditionGrades: ["S"],
      },
    ),
    false,
  );
});

// ─── 관련도(relevance) 정렬 — 검색 전용 정렬 옵션 ───

test("parseStorefrontQuery accepts relevance sort from URL", () => {
  const parsed = parseStorefrontQuery("?q=수학&sort=relevance");
  assert.equal(parsed.sortOption, "relevance");
  assert.equal(parsed.searchKeyword, "수학");
});

test("parseStorefrontQuery falls back to relevance when searching without explicit sort", () => {
  // 검색 중 암묵 기본 = 관련도순
  assert.equal(parseStorefrontQuery("?q=수학").sortOption, "relevance");
  // 검색 중이라도 명시된 정렬은 존중
  assert.equal(parseStorefrontQuery("?q=수학&sort=popular").sortOption, "popular");
  // 검색어가 없으면 평시 기본(인기순)
  assert.equal(parseStorefrontQuery("").sortOption, "popular");
});

test("serializeStorefrontQuery omits implied sort and keeps explicit choices", () => {
  const base = {
    selectedSubject: STORE_DEFAULT_SUBJECT,
    selectedFilters: { types: [], brands: [], years: [], conditionGrades: [] },
    currentPage: 1,
  };

  // 검색 중 관련도순 = 암묵 기본 → sort 생략 (URL 깔끔)
  const impliedDuringSearch = serializeStorefrontQuery({
    ...base,
    sortOption: "relevance",
    searchKeyword: "수학",
  });
  assert.equal(impliedDuringSearch.includes("sort="), false);
  assert.equal(impliedDuringSearch.includes("q="), true);

  // 검색 중 인기순은 명시적 선택 → sort=popular 유지 (parse fallback과 왕복 안정)
  const explicitDuringSearch = serializeStorefrontQuery({
    ...base,
    sortOption: "popular",
    searchKeyword: "수학",
  });
  assert.equal(explicitDuringSearch.includes("sort=popular"), true);

  // 평시 인기순 = 암묵 기본 → 생략 (기존 동작 유지)
  const impliedDefault = serializeStorefrontQuery({
    ...base,
    sortOption: "popular",
    searchKeyword: "",
  });
  assert.equal(impliedDefault.includes("sort="), false);
});

test("parse↔serialize round-trip is stable for search sorts", () => {
  const roundTrip = (search) => serializeStorefrontQuery({
    selectedSubject: parseStorefrontQuery(search).selectedSubject,
    selectedFilters: parseStorefrontQuery(search).selectedFilters,
    sortOption: parseStorefrontQuery(search).sortOption,
    searchKeyword: parseStorefrontQuery(search).searchKeyword,
    currentPage: parseStorefrontQuery(search).page,
  });

  assert.equal(roundTrip("q=%EC%88%98%ED%95%99"), "q=%EC%88%98%ED%95%99");
  assert.equal(roundTrip("sort=popular&q=%EC%88%98%ED%95%99"), "sort=popular&q=%EC%88%98%ED%95%99");
});

test("isValidStoreSort recognizes base sorts and relevance only", () => {
  assert.equal(isValidStoreSort("relevance"), true);
  assert.equal(isValidStoreSort("popular"), true);
  assert.equal(isValidStoreSort("latest"), true);
  assert.equal(isValidStoreSort("unknown"), false);
});
