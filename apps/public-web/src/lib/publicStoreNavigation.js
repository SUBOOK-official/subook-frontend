export const STORE_SUBJECTS = ["전체", "국어", "수학", "영어", "과학", "사회", "한국사", "기타"];
export const STORE_DEFAULT_SUBJECT = STORE_SUBJECTS[0];
export const SEARCH_DEBOUNCE_MS = 300;

export const STORE_SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "popular", label: "인기순" },
];

export const STORE_FILTER_GROUPS = [
  {
    key: "types",
    label: "유형",
    queryKey: "type",
    options: ["기출", "모의고사", "N제", "EBS", "주간지", "내신"],
  },
  {
    key: "brands",
    label: "브랜드",
    queryKey: "brand",
    options: ["시대인재", "강남대성", "대성마이맥", "이투스", "EBS"],
  },
  {
    key: "years",
    label: "연도",
    queryKey: "year",
    options: ["2026", "2025", "2024"],
  },
  {
    key: "conditionGrades",
    label: "상태",
    queryKey: "grade",
    options: [
      { value: "S", label: "S급" },
      { value: "A_PLUS", label: "A+급" },
      { value: "A", label: "A급" },
    ],
  },
];

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

export function parseStorefrontQuery(search) {
  const params = new URLSearchParams(search);
  const filters = {
    types: sanitizeFilterList("types", parseFilterList(getFilterQueryValue(params, "type", "types"))),
    brands: sanitizeFilterList("brands", parseFilterList(getFilterQueryValue(params, "brand", "brands"))),
    years: sanitizeFilterList("years", parseFilterList(getFilterQueryValue(params, "year", "years"))),
    conditionGrades: sanitizeFilterList(
      "conditionGrades",
      parseFilterList(getFilterQueryValue(params, "grade", "conditionGrades")),
    ),
  };

  const selectedSubject = normalizeStoreSubject(params.get("subject"));
  const requestedSort = params.get("sort");
  const sortOption = STORE_SORT_OPTIONS.some((option) => option.value === requestedSort)
    ? requestedSort
    : STORE_SORT_OPTIONS[0].value;
  const searchKeyword = normalizeQueryValue(params.get("q"));
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

  if (sortOption && sortOption !== STORE_SORT_OPTIONS[0].value) {
    params.set("sort", sortOption);
  }

  if (searchKeyword.trim()) {
    params.set("q", searchKeyword.trim());
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
