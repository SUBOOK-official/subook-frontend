const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_INITIAL_INTERVAL = 588;
const HANGUL_INITIALS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

export const STORE_RECENT_SEARCH_STORAGE_KEY = "subook.public.store.recent-searches";
export const STORE_RECENT_SEARCH_LIMIT = 5;
export const STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH = 2;
export const STORE_AUTOCOMPLETE_BOOK_LIMIT = 5;
export const STORE_AUTOCOMPLETE_INSTRUCTOR_LIMIT = 3;
export const STORE_AUTOCOMPLETE_BRAND_LIMIT = 2;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function getInitialCharacter(character) {
  const characterCode = character.charCodeAt(0);

  if (characterCode >= HANGUL_BASE_CODE && characterCode <= HANGUL_LAST_CODE) {
    const initialIndex = Math.floor((characterCode - HANGUL_BASE_CODE) / HANGUL_INITIAL_INTERVAL);
    return HANGUL_INITIALS[initialIndex] ?? "";
  }

  if (HANGUL_INITIALS.includes(character)) {
    return character;
  }

  if (/\s/u.test(character)) {
    return "";
  }

  return character.toLowerCase();
}

export function extractInitialConsonants(value) {
  return normalizeText(value)
    .split("")
    .map((character) => getInitialCharacter(character))
    .join("");
}

export function matchesKeyword(value, keyword) {
  const comparableKeyword = normalizeComparableText(keyword);

  if (!comparableKeyword) {
    return true;
  }

  const comparableValue = normalizeComparableText(value);
  if (comparableValue.includes(comparableKeyword)) {
    return true;
  }

  return extractInitialConsonants(value).includes(comparableKeyword);
}

export function matchesKeywordAcrossFields(values, keyword) {
  if (!normalizeText(keyword)) {
    return true;
  }

  return values.some((value) => matchesKeyword(value, keyword));
}

function buildBookSuggestion(product) {
  return {
    id: `book-${product.id}`,
    kind: "book",
    productId: product.id,
    label: product.title,
    meta: [product.brand, product.publishedYear, product.subject].filter(Boolean).join(" · "),
  };
}

function buildInstructorSuggestion(instructorName, product) {
  return {
    id: `instructor-${instructorName}`,
    kind: "instructor",
    keyword: instructorName,
    label: instructorName,
    meta: [product.brand, product.subject].filter(Boolean).join(" · "),
  };
}

function buildBrandSuggestion(brandName, count) {
  return {
    id: `brand-${brandName}`,
    kind: "brand",
    brand: brandName,
    label: brandName,
    meta: `${count.toLocaleString("ko-KR")}개 교재`,
    count,
  };
}

export function buildStoreAutocomplete(catalog, keyword) {
  const normalizedKeyword = normalizeText(keyword);

  if (normalizeComparableText(normalizedKeyword).length < STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH) {
    return {
      books: [],
      instructors: [],
      brands: [],
    };
  }

  const matchedBooks = [];
  const seenBookTitles = new Set();
  const matchedInstructors = [];
  const seenInstructorNames = new Set();
  const brandMatchCounts = new Map();

  catalog.forEach((product) => {
    if (
      matchedBooks.length < STORE_AUTOCOMPLETE_BOOK_LIMIT &&
      matchesKeyword(product.title, normalizedKeyword) &&
      !seenBookTitles.has(product.title)
    ) {
      seenBookTitles.add(product.title);
      matchedBooks.push(buildBookSuggestion(product));
    }

    if (
      matchedInstructors.length < STORE_AUTOCOMPLETE_INSTRUCTOR_LIMIT &&
      normalizeText(product.instructorName) &&
      matchesKeyword(product.instructorName, normalizedKeyword) &&
      !seenInstructorNames.has(product.instructorName)
    ) {
      seenInstructorNames.add(product.instructorName);
      matchedInstructors.push(buildInstructorSuggestion(product.instructorName, product));
    }

    if (normalizeText(product.brand) && matchesKeyword(product.brand, normalizedKeyword)) {
      brandMatchCounts.set(product.brand, (brandMatchCounts.get(product.brand) ?? 0) + 1);
    }
  });

  const matchedBrands = Array.from(brandMatchCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, STORE_AUTOCOMPLETE_BRAND_LIMIT)
    .map(([brandName, count]) => buildBrandSuggestion(brandName, count));

  return {
    books: matchedBooks,
    instructors: matchedInstructors,
    brands: matchedBrands,
  };
}

// 서버 검색 RPC(search_storefront_products) 결과 rows → 헤더 자동완성 구조.
// buildStoreAutocomplete와 동일한 출력 계약({books, instructors, brands})을 유지해
// SearchSuggestionsPanel을 그대로 재사용한다. rows는 서버가 관련도 내림차순으로
// 이미 정렬했으므로, 교재 제안은 순서 그대로 dedupe·상한만 적용한다.
// 강사/브랜드는 "교재가 검색어에 걸렸을 뿐"인 행이 섞이므로 필드 자체가
// 키워드에 매칭될 때만 제안으로 승격한다(초성 매칭 포함, 기존 정밀도 유지).
export function buildStoreAutocompleteFromSearchRows(rows, keyword) {
  const normalizedKeyword = normalizeText(keyword);

  if (
    !Array.isArray(rows) ||
    normalizeComparableText(normalizedKeyword).length < STORE_AUTOCOMPLETE_MIN_KEYWORD_LENGTH
  ) {
    return {
      books: [],
      instructors: [],
      brands: [],
    };
  }

  const matchedBooks = [];
  const seenBookTitles = new Set();
  const matchedInstructors = [];
  const seenInstructorNames = new Set();
  const brandMatchCounts = new Map();

  rows.forEach((row) => {
    if (!row || typeof row !== "object") {
      return;
    }

    const productLike = {
      id: row.id ?? row.product_id ?? row.productId,
      title: normalizeText(row.title),
      brand: normalizeText(row.brand),
      subject: normalizeText(row.subject),
      publishedYear: row.published_year ?? row.publishedYear ?? null,
      instructorName: normalizeText(row.instructor_name ?? row.instructorName),
    };

    if (
      matchedBooks.length < STORE_AUTOCOMPLETE_BOOK_LIMIT &&
      productLike.id !== null &&
      productLike.id !== undefined &&
      productLike.title &&
      !seenBookTitles.has(productLike.title)
    ) {
      seenBookTitles.add(productLike.title);
      matchedBooks.push(buildBookSuggestion(productLike));
    }

    if (
      matchedInstructors.length < STORE_AUTOCOMPLETE_INSTRUCTOR_LIMIT &&
      productLike.instructorName &&
      matchesKeyword(productLike.instructorName, normalizedKeyword) &&
      !seenInstructorNames.has(productLike.instructorName)
    ) {
      seenInstructorNames.add(productLike.instructorName);
      matchedInstructors.push(buildInstructorSuggestion(productLike.instructorName, productLike));
    }

    if (productLike.brand && matchesKeyword(productLike.brand, normalizedKeyword)) {
      brandMatchCounts.set(productLike.brand, (brandMatchCounts.get(productLike.brand) ?? 0) + 1);
    }
  });

  const matchedBrands = Array.from(brandMatchCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, STORE_AUTOCOMPLETE_BRAND_LIMIT)
    .map(([brandName, count]) => buildBrandSuggestion(brandName, count));

  return {
    books: matchedBooks,
    instructors: matchedInstructors,
    brands: matchedBrands,
  };
}

export function hasAutocompleteResults(autocompleteResult) {
  return (
    (autocompleteResult?.books?.length ?? 0) > 0 ||
    (autocompleteResult?.instructors?.length ?? 0) > 0 ||
    (autocompleteResult?.brands?.length ?? 0) > 0
  );
}

export function normalizeRecentSearches(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  ).slice(0, STORE_RECENT_SEARCH_LIMIT);
}

export function addRecentSearchTerm(values, term) {
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return normalizeRecentSearches(values);
  }

  return normalizeRecentSearches([
    normalizedTerm,
    ...normalizeRecentSearches(values).filter((value) => value !== normalizedTerm),
  ]);
}

export function removeRecentSearchTerm(values, term) {
  const normalizedTerm = normalizeText(term);

  return normalizeRecentSearches(values).filter((value) => value !== normalizedTerm);
}
