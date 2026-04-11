import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStoreFilterGroup,
  cloneStoreFilters,
  countSelectedStoreFilters,
  STORE_DEFAULT_SUBJECT,
  areSelectedFiltersEqual,
  parseStorefrontQuery,
  serializeStorefrontQuery,
  toggleStoreFilterSelection,
} from "./publicStoreNavigation.js";

test("parseStorefrontQuery falls back to the default subject for invalid values", () => {
  const parsed = parseStorefrontQuery("?subject=없는과목&sort=unknown&page=-2");

  assert.equal(parsed.selectedSubject, STORE_DEFAULT_SUBJECT);
  assert.equal(parsed.sortOption, "latest");
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
    sortOption: "popular",
    searchKeyword: "파이널",
    currentPage: 3,
  });

  assert.equal(
    serialized,
    "subject=%EC%98%81%EC%96%B4&type=%EA%B8%B0%EC%B6%9C&brand=%EC%8B%9C%EB%8C%80%EC%9D%B8%EC%9E%AC&year=2026&grade=S&sort=popular&q=%ED%8C%8C%EC%9D%B4%EB%84%90&page=3",
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
