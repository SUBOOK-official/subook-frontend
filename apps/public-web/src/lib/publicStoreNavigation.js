import { STOREFRONT_FEATURED_YEARS, STOREFRONT_OTHER_YEAR } from "../../../../packages/shared-domain/src/storefrontYears.js";

export const STORE_SUBJECTS = ["전체", "국어", "수학", "영어", "과학", "사회", "한국사", "기타"];
export const STORE_DEFAULT_SUBJECT = STORE_SUBJECTS[0];
export const SEARCH_DEBOUNCE_MS = 300;

export const STORE_SORT_OPTIONS = [
  { value: "recommended", label: "추천순" },
  { value: "popular", label: "인기순" },
  { value: "latest", label: "최신순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "discount_desc", label: "할인율 높은순" },
  { value: "discount_asc", label: "할인율 낮은순" },
];

// 검색어가 있을 때만 노출되는 관련도 정렬 — 서버 match_score(FTS 유사도) 기준.
export const STORE_SEARCH_SORT_OPTION = { value: "relevance", label: "관련도순" };

// 메인 목록 기본값. 관에서 지원하지 않으면 해당 관의 첫 번째 정렬을 사용한다.
export const STORE_DEFAULT_SORT = "recommended";

export function isValidStoreSort(value) {
  return (
    value === STORE_SEARCH_SORT_OPTION.value ||
    STORE_SORT_OPTIONS.some((option) => option.value === value)
  );
}

export const STORE_FILTER_GROUPS = [
  { key: "discounts", label: "할인", queryKey: "discount", options: [{ value: "sale", label: "할인 교재" }] },
  {
    key: "types",
    label: "유형",
    queryKey: "type",
    // EBS는 브랜드 필터와 중복이라 유형에서 제외 (2026-07-13 피드백).
    // 기존 book_type='EBS' 재고는 브랜드=EBS 필터로 접근 가능.
    options: ["개념", "기출", "모의고사", "N제", "주간지", "내신", "워크북", "논술"],
  },
  {
    key: "brands",
    label: "브랜드",
    queryKey: "brand",
    options: [
      "시대인재",
      "강남대성",
      "대성마이맥",
      "이투스",
      "EBS",
      "메가스터디",
      "이감",
      { value: "상상국어평가연구소", label: "상상" },
      "전일학원",
      "기타",
    ],
  },
  {
    key: "years",
    label: "연도",
    queryKey: "year",
    options: [
      ...STOREFRONT_FEATURED_YEARS.map(String),
      { value: STOREFRONT_OTHER_YEAR, label: "기타" },
    ],
  },
  {
    key: "conditionGrades",
    label: "상태",
    queryKey: "grade",
    options: [
      { value: "S", label: "S(새 책)" },
      { value: "A_PLUS", label: "A+(사용감 적음)" },
    ],
  },
];

// 홈 사이드바와 모바일 필터 시트에 같은 그룹을 노출한다.
export const HOME_SIDEBAR_FILTER_GROUP_KEYS = ["types", "brands", "years"];

export const STORE_FILTER_GROUP_KEYS = STORE_FILTER_GROUPS.map((group) => group.key);

const STORE_FILTER_OPTIONS_BY_KEY = STORE_FILTER_GROUPS.reduce((accumulator, group) => {
  accumulator[group.key] = new Set(
    group.options.map((option) => (typeof option === "string" ? option : option.value)),
  );
  return accumulator;
}, {});

export function createStoreInitialFilters() {
  return {
    types: [],
    discounts: [],
    brands: [],
    years: [],
    conditionGrades: [],
  };
}

function parseFilterList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeFilterList(groupKey, values) {
  const validOptionSet = STORE_FILTER_OPTIONS_BY_KEY[groupKey];
  if (!validOptionSet) {
    return [];
  }

  return Array.from(
    new Set(
      values.filter((value) => validOptionSet.has(value)),
    ),
  );
}

function normalizeQueryValue(value, fallback = "") {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || fallback;
}

export function isValidStoreSubject(value) {
  return STORE_SUBJECTS.includes(normalizeQueryValue(value));
}

export function normalizeStoreSubject(value) {
  const normalizedValue = normalizeQueryValue(value, STORE_DEFAULT_SUBJECT);
  return isValidStoreSubject(normalizedValue) ? normalizedValue : STORE_DEFAULT_SUBJECT;
}

function getFilterQueryValue(params, singularKey, legacyPluralKey) {
  return params.get(singularKey) ?? params.get(legacyPluralKey);
}

export function parseStorefrontQuery(search, { sortOptions = STORE_SORT_OPTIONS, allowRelevanceSort = true } = {}) {
  const params = new URLSearchParams(search);
  const filters = {
    discounts: sanitizeFilterList("discounts", parseFilterList(params.get("discount"))),
    types: sanitizeFilterList("types", parseFilterList(getFilterQueryValue(params, "type", "types"))),
    brands: sanitizeFilterList("brands", parseFilterList(getFilterQueryValue(params, "brand", "brands"))),
    years: sanitizeFilterList("years", parseFilterList(getFilterQueryValue(params, "year", "years"))),
    conditionGrades: sanitizeFilterList(
      "conditionGrades",
      parseFilterList(getFilterQueryValue(params, "grade", "conditionGrades")),
    ),
  };

  const selectedSubject = normalizeStoreSubject(params.get("subject"));
  const searchKeyword = normalizeQueryValue(params.get("q"));
  const requestedSort = params.get("sort");
  // 검색어가 있는데 정렬이 명시되지 않았으면 기본을 관련도순으로.
  // (검색 중 '인기순'을 직접 고르면 serialize가 sort=popular를 URL에 명시해 왕복 유지)
  const defaultSort = sortOptions.some((option) => option.value === STORE_DEFAULT_SORT)
    ? STORE_DEFAULT_SORT : sortOptions[0]?.value ?? STORE_DEFAULT_SORT;
  const fallbackSort = searchKeyword && allowRelevanceSort ? STORE_SEARCH_SORT_OPTION.value : defaultSort;
  const supportsRequestedSort = sortOptions.some((option) => option.value === requestedSort)
    || (allowRelevanceSort && requestedSort === STORE_SEARCH_SORT_OPTION.value);
  const sortOption = supportsRequestedSort ? requestedSort : fallbackSort;
  const pageValue = Number.parseInt(params.get("page") ?? "1", 10);

  return {
    selectedSubject,
    selectedFilters: filters,
    sortOption,
    searchKeyword,
    page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export function serializeStorefrontQuery({
  selectedSubject,
  selectedFilters,
  sortOption,
  searchKeyword,
  currentPage,
}) {
  const params = new URLSearchParams();

  if (selectedSubject && selectedSubject !== STORE_DEFAULT_SUBJECT) {
    params.set("subject", selectedSubject);
  }

  STORE_FILTER_GROUPS.forEach((group) => {
    const values = selectedFilters[group.key] ?? [];
    if (values.length > 0) {
      params.set(group.queryKey, values.join(","));
    }
  });

  const trimmedKeyword = searchKeyword.trim();
  // parse의 fallback과 대칭: 검색 중엔 관련도순이, 평시엔 인기순이 "암묵 기본"이라
  // 그 값일 때만 sort 파라미터를 생략한다. (검색 중 인기순 선택 등은 URL에 명시 유지)
  const impliedSort = trimmedKeyword ? STORE_SEARCH_SORT_OPTION.value : STORE_DEFAULT_SORT;

  if (sortOption && sortOption !== impliedSort) {
    params.set("sort", sortOption);
  }

  if (trimmedKeyword) {
    params.set("q", trimmedKeyword);
  }

  if (currentPage > 1) {
    params.set("page", String(currentPage));
  }

  return params.toString();
}

export function cloneStoreFilters(filters = {}) {
  return STORE_FILTER_GROUP_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Array.isArray(filters[key]) ? [...filters[key]] : [];
    return accumulator;
  }, createStoreInitialFilters());
}

// 현재 관·카테고리는 유지하고 검색어와 첫 페이지만 변경한다.
export function buildScopedStoreSearchQuery(current, keyword, { allowRelevanceSort = true } = {}) {
  const searchKeyword = String(keyword ?? "").trim();
  let sortOption = current.sortOption;
  if (!searchKeyword && sortOption === STORE_SEARCH_SORT_OPTION.value) {
    sortOption = STORE_DEFAULT_SORT;
  } else if (searchKeyword && !current.searchKeyword && sortOption === STORE_DEFAULT_SORT && allowRelevanceSort) {
    sortOption = STORE_SEARCH_SORT_OPTION.value;
  }
  return serializeStorefrontQuery({ ...current, searchKeyword, sortOption, currentPage: 1 });
}

export function clearStoreFilterGroup(filters, groupKey) {
  const nextFilters = cloneStoreFilters(filters);
  if (STORE_FILTER_OPTIONS_BY_KEY[groupKey]) {
    nextFilters[groupKey] = [];
  }

  return nextFilters;
}

export function toggleStoreFilterSelection(filters, groupKey, optionValue) {
  const nextFilters = cloneStoreFilters(filters);
  const validOptionSet = STORE_FILTER_OPTIONS_BY_KEY[groupKey];

  if (!validOptionSet || !validOptionSet.has(optionValue)) {
    return nextFilters;
  }

  nextFilters[groupKey] = nextFilters[groupKey].includes(optionValue)
    ? nextFilters[groupKey].filter((value) => value !== optionValue)
    : [...nextFilters[groupKey], optionValue];

  return nextFilters;
}

export function countSelectedStoreFilters(filters = {}) {
  return STORE_FILTER_GROUP_KEYS.reduce((total, key) => {
    const values = Array.isArray(filters[key]) ? filters[key] : [];
    return total + values.length;
  }, 0);
}

function areFilterListsEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function areSelectedFiltersEqual(left, right) {
  return STORE_FILTER_GROUP_KEYS.every((key) =>
    areFilterListsEqual(left?.[key], right?.[key]),
  );
}
