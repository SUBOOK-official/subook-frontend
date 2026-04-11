import { bookConditionLabel, productStatusLabel } from "@shared-domain/status";
import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import { STORE_DEFAULT_SUBJECT } from "./publicStoreNavigation";
import {
  getMockStoreProductRows,
  readStoreMockModePreference,
} from "./publicStoreMockData";
import { matchesKeywordAcrossFields } from "./publicStoreSearch";
import {
  buildPopularityMetrics,
  getSortTimestamp,
  sortStorefrontProducts,
} from "./publicStoreSorting";

const DEFAULT_CATALOG_LIMIT = 500;
const PRODUCT_LIST_RPC_NAME = "list_public_store_products";
const PRODUCT_DETAIL_RPC_NAME = "get_public_store_product_detail";
const LEGACY_BOOK_LIST_RPC_NAME = "list_public_store_books";
const LEGACY_BOOK_DETAIL_RPC_NAME = "get_public_store_book_detail";

let mockStorefrontCatalogCache = null;

const conditionGradeLabel = {
  S: bookConditionLabel.S,
  A_PLUS: bookConditionLabel.A_PLUS,
  A: bookConditionLabel.A,
};

const gradeSortPriority = {
  S: 0,
  A_PLUS: 1,
  A: 2,
};

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeBoolean(value) {
  if (value === true || value === "true" || value === 1) {
    return true;
  }

  if (value === false || value === "false" || value === 0) {
    return false;
  }

  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeInteger(value) {
  const numericValue = normalizeNumber(value);
  return numericValue === null ? null : Math.trunc(numericValue);
}

function normalizeNonNegativeInteger(value) {
  const numericValue = normalizeInteger(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function parseUrlList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedValue);
    if (Array.isArray(parsedValue)) {
      return parsedValue.map((item) => normalizeText(item)).filter(Boolean);
    }
  } catch {
    // Fall back to plain-text parsing.
  }

  return trimmedValue
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDirectCoverImageUrl(row = {}) {
  const candidates = [
    row.cover_image_url,
    row.coverImageUrl,
    row.cover_url,
    row.coverUrl,
    row.image_url,
    row.imageUrl,
    row.thumbnail_url,
    row.thumbnailUrl,
  ];

  for (const candidate of candidates) {
    const normalizedValue = normalizeNullableText(candidate);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return null;
}

function getNestedCoverImageUrl(row = {}) {
  const nestedObjects = [
    row.book,
    row.book_row,
    row.bookRow,
    row.product,
    row.product_row,
    row.productRow,
    row.selectedOption,
    row.selected_option,
  ];

  for (const nestedObject of nestedObjects) {
    if (!nestedObject || typeof nestedObject !== "object") {
      continue;
    }

    const nestedCoverImageUrl = getDirectCoverImageUrl(nestedObject);
    if (nestedCoverImageUrl) {
      return nestedCoverImageUrl;
    }
  }

  const nestedCollections = [
    row.books,
    row.product_books,
    row.productBooks,
    row.option_books,
    row.optionBooks,
    row.options,
    row.variants,
    row.items,
  ];

  for (const collection of nestedCollections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const item of collection) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const nestedCoverImageUrl =
        getDirectCoverImageUrl(item) ??
        getDirectCoverImageUrl(item.book ?? {}) ??
        getDirectCoverImageUrl(item.product ?? {});

      if (nestedCoverImageUrl) {
        return nestedCoverImageUrl;
      }
    }
  }

  return null;
}

function getCoverImageUrl(row = {}, fallbackRow = null) {
  const candidateRows = [row, fallbackRow].filter(Boolean);

  for (const candidateRow of candidateRows) {
    const directCoverImageUrl = getDirectCoverImageUrl(candidateRow);
    if (directCoverImageUrl) {
      return directCoverImageUrl;
    }

    const nestedCoverImageUrl = getNestedCoverImageUrl(candidateRow);
    if (nestedCoverImageUrl) {
      return nestedCoverImageUrl;
    }
  }

  return null;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function normalizeConditionGrade(value) {
  const normalizedValue = normalizeText(String(value ?? "")).toUpperCase();

  if (normalizedValue === "A+" || normalizedValue === "A_PLUS" || normalizedValue === "A PLUS") {
    return "A_PLUS";
  }

  if (normalizedValue === "S" || normalizedValue === "A") {
    return normalizedValue;
  }

  return null;
}

function getConditionGradeLabel(value) {
  const normalizedValue = normalizeConditionGrade(value);
  return normalizedValue ? conditionGradeLabel[normalizedValue] : "";
}

function normalizeProductStatus(value) {
  const normalizedValue = normalizeText(String(value ?? "")).toLowerCase();

  if (normalizedValue === "selling" || normalizedValue === "sold_out" || normalizedValue === "hidden") {
    return normalizedValue;
  }

  if (normalizedValue === "on_sale") {
    return "selling";
  }

  if (normalizedValue === "settled") {
    return "hidden";
  }

  return "selling";
}

function getProductStatusLabel(value) {
  const normalizedValue = normalizeProductStatus(value);
  return productStatusLabel[normalizedValue] ?? productStatusLabel[value] ?? "";
}

function getOptionSortPriority(option) {
  return gradeSortPriority[option.conditionGrade] ?? 99;
}

function sortStorefrontOptions(options) {
  return [...options].sort((left, right) => {
    const gradeDiff = getOptionSortPriority(left) - getOptionSortPriority(right);
    if (gradeDiff !== 0) {
      return gradeDiff;
    }

    const leftPrice = left.price ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.price ?? Number.POSITIVE_INFINITY;
    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }

    return getSortTimestamp(right) - getSortTimestamp(left);
  });
}

function getRowId(row) {
  const candidate = row.book_id ?? row.bookId ?? row.id ?? row.product_id ?? row.productId;
  return candidate === null || candidate === undefined ? null : String(candidate);
}

function getOptionLabel(row) {
  return normalizeNullableText(
    row.option ?? row.option_label ?? row.variant_label ?? row.variant ?? row.label,
  );
}

function getAvailabilityCount(row = {}, productRow = {}) {
  const candidates = [
    row.available_count,
    row.availableCount,
    row.stock_count,
    row.stockCount,
    row.inventory_count,
    row.inventoryCount,
    row.quantity_available,
    row.quantityAvailable,
    row.remaining_count,
    row.remainingCount,
    row.available_quantity,
    row.availableQuantity,
    productRow.available_count,
    productRow.availableCount,
    productRow.stock_count,
    productRow.stockCount,
    productRow.inventory_count,
    productRow.inventoryCount,
    productRow.quantity_available,
    productRow.quantityAvailable,
    productRow.remaining_count,
    productRow.remainingCount,
    productRow.available_quantity,
    productRow.availableQuantity,
  ];

  for (const candidate of candidates) {
    const normalizedValue = normalizeNonNegativeInteger(candidate);
    if (normalizedValue !== null) {
      return normalizedValue;
    }
  }

  return null;
}

function getAvailabilityLabel(availableCount, status) {
  if (status === "sold_out") {
    return "품절";
  }

  if (availableCount === null) {
    return null;
  }

  return availableCount > 0 ? `재고 ${availableCount}권` : "품절";
}

function getOptionRows(row = {}) {
  const candidates = [
    row.options,
    row.option_books,
    row.books,
    row.option_rows,
    row.variants,
    row.items,
    row.product_books,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  return [];
}

function normalizeStorefrontOptionRow(row = {}, productRow = {}) {
  const productId = normalizeNullableText(row.product_id ?? row.productId ?? productRow.id);
  const title = normalizeText(row.title ?? row.product_title ?? row.productTitle ?? productRow.title);
  const option = getOptionLabel(row);
  const conditionGrade = normalizeConditionGrade(row.condition_grade ?? row.grade ?? row.conditionGrade);
  const price = normalizeInteger(row.price ?? row.sale_price ?? row.salePrice ?? productRow.price);
  const originalPrice = normalizeInteger(
    row.original_price ?? row.originalPrice ?? row.list_price ?? row.msrp ?? productRow.original_price,
  );
  const coverImageUrl = getCoverImageUrl(row, productRow);
  const inspectionImageUrls = parseUrlList(
    row.inspection_image_urls ?? row.gallery_image_urls ?? row.image_urls ?? productRow.inspection_image_urls,
  );
  const writingPercentage = normalizeInteger(
    row.writing_percentage ?? row.writing_ratio ?? row.writing_percent ?? productRow.writing_percentage,
  );
  const hasDamage = normalizeBoolean(row.has_damage ?? productRow.has_damage);
  const inspectionNotes = normalizeNullableText(row.inspection_notes ?? row.inspection_note ?? productRow.inspection_notes);
  const inspectedAt = normalizeNullableText(row.inspected_at ?? productRow.inspected_at);
  const status = normalizeProductStatus(row.status ?? row.product_status ?? row.productStatus ?? productRow.status);
  const isPublic = normalizeBoolean(row.is_public ?? row.isPublic ?? productRow.is_public ?? productRow.isPublic);
  const availableCount = getAvailabilityCount(row, productRow);
  const isSoldOut = status === "sold_out" || availableCount === 0;
  const discountRate =
    price !== null && originalPrice !== null && originalPrice > 0
      ? Math.max(0, Math.round(((originalPrice - price) / originalPrice) * 100))
      : null;
  const popularityMetrics = buildPopularityMetrics(row);
  const id =
    getRowId(row) ??
    [productId, conditionGrade ?? option ?? "option", price ?? "no-price"]
      .filter(Boolean)
      .join("-");

  return {
    id,
    productId,
    title,
    option,
    conditionGrade,
    conditionGradeLabel: getConditionGradeLabel(conditionGrade),
    price,
    originalPrice,
    coverImageUrl,
    inspectionImageUrls,
    writingPercentage,
    hasDamage,
    inspectionNotes,
    inspectedAt,
    status,
    statusLabel: getProductStatusLabel(status),
    isPublic: Boolean(isPublic),
    availableCount,
    stockCount: availableCount,
    isSoldOut,
    availabilityLabel: getAvailabilityLabel(availableCount, status),
    createdAt: row.created_at ?? row.createdAt ?? productRow.created_at ?? productRow.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? productRow.updated_at ?? productRow.updatedAt ?? null,
    popularityScore: popularityMetrics.score,
    salesCount: popularityMetrics.salesCount,
    viewCount: popularityMetrics.viewCount,
    favoriteCount: popularityMetrics.favoriteCount,
    discountRate,
  };
}

function normalizeStorefrontProductRow(row = {}) {
  const rawOptions = getOptionRows(row);
  const normalizedOptions = sortStorefrontOptions(
    (rawOptions.length > 0 ? rawOptions : [row])
      .map((optionRow) => normalizeStorefrontOptionRow(optionRow, row))
      .filter((option) => Boolean(option.title || option.price !== null || option.conditionGrade || option.id)),
  );

  const preferredOption =
    normalizedOptions.find((option) => !option.isSoldOut) ?? normalizedOptions[0] ?? normalizeStorefrontOptionRow(row, row);
  const optionCount = normalizedOptions.length;
  const conditionGrades = uniqueStrings(normalizedOptions.map((option) => option.conditionGrade));
  const conditionGradeLabels = uniqueStrings(
    normalizedOptions.map((option) => option.conditionGradeLabel),
  );
  const productId = getRowId(row) ?? preferredOption.productId ?? preferredOption.id ?? null;
  const title = normalizeText(row.title ?? row.product_title ?? row.productTitle ?? preferredOption.title);
  const subject = normalizeNullableText(row.subject ?? preferredOption.subject);
  const brand = normalizeNullableText(row.brand ?? preferredOption.brand);
  const bookType = normalizeNullableText(row.book_type ?? row.bookType ?? row.type);
  const publishedYear = normalizeInteger(row.published_year ?? row.publishedYear ?? row.year);
  const instructorName = normalizeNullableText(row.instructor_name ?? row.instructorName ?? row.teacher_name);
  const coverImageUrl = getCoverImageUrl(row, preferredOption);
  const inspectionImageUrls = parseUrlList(row.inspection_image_urls ?? row.inspectionImageUrls ?? preferredOption.inspectionImageUrls);
  const writingPercentage = normalizeInteger(row.writing_percentage ?? row.writingPercentage ?? preferredOption.writingPercentage);
  const hasDamage = normalizeBoolean(row.has_damage ?? row.hasDamage ?? preferredOption.hasDamage);
  const inspectionNotes = normalizeNullableText(
    row.inspection_notes ?? row.inspectionNotes ?? preferredOption.inspectionNotes,
  );
  const inspectedAt = normalizeNullableText(row.inspected_at ?? row.inspectedAt ?? preferredOption.inspectedAt);
  const status = normalizeProductStatus(
    row.product_status ?? row.productStatus ?? row.status ?? preferredOption.status,
  );
  const isPublic = normalizeBoolean(row.is_public ?? row.isPublic ?? preferredOption.isPublic);
  const explicitAvailableCount = getAvailabilityCount(row, row);
  const optionAvailableCounts = normalizedOptions
    .map((option) => option.availableCount)
    .filter((count) => count !== null);
  const availableCount =
    explicitAvailableCount ??
    (optionAvailableCounts.length > 0
      ? optionAvailableCounts.reduce((total, count) => total + count, 0)
      : null);
  const availableOptionCount =
    normalizeNonNegativeInteger(row.available_option_count ?? row.availableOptionCount) ??
    normalizedOptions.filter((option) => !option.isSoldOut).length;
  const totalOptionCount =
    normalizeNonNegativeInteger(row.total_option_count ?? row.totalOptionCount) ??
    optionCount;
  const soldOutOptionCount =
    normalizeNonNegativeInteger(row.sold_out_option_count ?? row.soldOutOptionCount) ??
    Math.max(0, totalOptionCount - availableOptionCount);
  const isSoldOut =
    status === "sold_out" ||
    availableCount === 0 ||
    (availableOptionCount === 0 && totalOptionCount > 0);

  const prices = normalizedOptions.map((option) => option.price).filter((price) => price !== null);
  const originalPrices = normalizedOptions
    .map((option) => option.originalPrice)
    .filter((price) => price !== null);

  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
  const representativePrice = normalizeInteger(row.price ?? preferredOption.price ?? lowestPrice);
  const originalPrice = normalizeInteger(
    row.original_price ??
      row.originalPrice ??
      preferredOption.originalPrice ??
      (originalPrices.length > 0 ? Math.max(...originalPrices) : null),
  );
  const discountRate =
    representativePrice !== null && originalPrice !== null && originalPrice > 0
      ? Math.max(0, Math.round(((originalPrice - representativePrice) / originalPrice) * 100))
      : null;
  const optionSummaryLabel =
    optionCount > 1
      ? `${optionCount}개 옵션`
      : preferredOption.conditionGradeLabel || preferredOption.option || "옵션 미등록";
  const conditionGradeSummaryLabel =
    conditionGradeLabels.length > 0 ? conditionGradeLabels.join(" · ") : optionSummaryLabel;
  const popularityMetrics = buildPopularityMetrics(row, normalizedOptions);

  return {
    id: productId,
    productId,
    title: title || preferredOption.title || "제목 미등록",
    subject,
    brand,
    bookType,
    publishedYear,
    instructorName,
    conditionGrade: preferredOption.conditionGrade,
    conditionGradeLabel: preferredOption.conditionGradeLabel,
    conditionGrades,
    conditionGradeLabels,
    conditionGradeSummaryLabel,
    optionSummaryLabel,
    optionCount,
    options: normalizedOptions,
    selectedOptionId: preferredOption.id,
    selectedOption: preferredOption,
    price: representativePrice,
    lowestPrice,
    highestPrice,
    originalPrice,
    coverImageUrl,
    inspectionImageUrls,
    writingPercentage,
    hasDamage,
    inspectionNotes,
    inspectedAt,
    status,
    statusLabel: getProductStatusLabel(status),
    isPublic: Boolean(isPublic),
    availableCount,
    stockCount: availableCount,
    availableOptionCount,
    totalOptionCount,
    soldOutOptionCount,
    isSoldOut,
    availabilityLabel: getAvailabilityLabel(availableCount, status),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    popularityScore: popularityMetrics.score,
    salesCount: popularityMetrics.salesCount,
    viewCount: popularityMetrics.viewCount,
    favoriteCount: popularityMetrics.favoriteCount,
    discountRate,
    priceRangeLabel:
      lowestPrice !== null && highestPrice !== null && lowestPrice !== highestPrice
        ? `${lowestPrice.toLocaleString("ko-KR")}원 ~ ${highestPrice.toLocaleString("ko-KR")}원`
        : representativePrice !== null
          ? `${representativePrice.toLocaleString("ko-KR")}원`
          : "미입력",
    productIdNumber: normalizeInteger(productId),
  };
}

function unwrapStorefrontRows(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.products)) {
    return data.products;
  }

  if (Array.isArray(data?.books)) {
    return data.books;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (data && typeof data === "object") {
    return [data];
  }

  return [];
}

function unwrapStorefrontDetail(data) {
  if (Array.isArray(data)) {
    const primaryRow = data[0] ?? null;
    const relatedProducts = Array.isArray(primaryRow?.related_products)
      ? primaryRow.related_products
      : Array.isArray(primaryRow?.relatedProducts)
        ? primaryRow.relatedProducts
        : Array.isArray(primaryRow?.related_books)
          ? primaryRow.related_books
        : data.slice(1);

    return {
      product: primaryRow,
      options: Array.isArray(primaryRow?.options)
        ? primaryRow.options
        : Array.isArray(primaryRow?.option_books)
          ? primaryRow.option_books
        : Array.isArray(primaryRow?.books)
          ? primaryRow.books
          : [],
      relatedProducts,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      product: null,
      options: [],
      relatedProducts: [],
    };
  }

  const product = data.product ?? data.data ?? data.row ?? data.item ?? data;
  const options =
    data.options ??
    data.option_books ??
    data.books ??
    data.option_rows ??
    data.optionRows ??
    data.variants ??
    product.options ??
    product.option_books ??
    product.books ??
    [];
  const relatedProducts =
    data.related_products ??
    data.relatedProducts ??
    data.related_books ??
    data.similar_products ??
    data.similarProducts ??
    product.related_products ??
    product.related_books ??
    data.recommendations ??
    [];

  return {
    product,
    options: Array.isArray(options) ? options : [],
    relatedProducts: Array.isArray(relatedProducts) ? relatedProducts : [],
  };
}

function normalizeStoreSort(value) {
  if (value === "price_asc") {
    return "price_low";
  }

  if (value === "price_desc") {
    return "price_high";
  }

  if (value === "latest") {
    return "latest";
  }

  return "popular";
}

function buildStorefrontRpcArgs(filters = {}) {
  const selectedSubject = normalizeText(filters.subject);
  const years =
    Array.isArray(filters.years) && filters.years.length > 0
      ? filters.years.map((year) => normalizeInteger(year)).filter((year) => year !== null)
      : [];

  return {
    p_subjects: selectedSubject && selectedSubject !== STORE_DEFAULT_SUBJECT ? [selectedSubject] : null,
    p_book_types: Array.isArray(filters.types) && filters.types.length > 0 ? filters.types : null,
    p_brands: Array.isArray(filters.brands) && filters.brands.length > 0 ? filters.brands : null,
    p_years: years.length > 0 ? years : null,
    p_condition_grades:
      Array.isArray(filters.conditionGrades) && filters.conditionGrades.length > 0
        ? filters.conditionGrades
        : null,
    p_search: normalizeNullableText(filters.search),
    p_sort: normalizeStoreSort(filters.sort),
    p_limit: normalizeInteger(filters.limit) ?? DEFAULT_CATALOG_LIMIT,
    p_offset: normalizeInteger(filters.offset) ?? 0,
  };
}

function buildStorefrontDetailRpcArgs(productId) {
  return {
    p_product_id: normalizeInteger(productId),
  };
}

function buildLegacyStorefrontDetailRpcArgs(bookId) {
  return {
    p_book_id: normalizeInteger(bookId),
  };
}

function productMatchesSearch(product, normalizedSearch) {
  return matchesKeywordAcrossFields(
    [
      product.title,
      product.subject,
      product.brand,
      product.bookType,
      product.instructorName,
      product.conditionGradeSummaryLabel,
      product.optionSummaryLabel,
      product.priceRangeLabel,
      product.publishedYear === null ? "" : String(product.publishedYear),
      ...(Array.isArray(product.options)
        ? product.options.flatMap((option) => [
            option.title,
            option.option,
            option.conditionGradeLabel,
            option.conditionGrade,
            option.price === null ? "" : String(option.price),
          ])
        : []),
    ],
    normalizedSearch,
  );
}

function filterStorefrontProducts(products, filters = {}) {
  const normalizedSearch = normalizeText(filters.search).toLowerCase();
  const selectedSubject = normalizeText(filters.subject);
  const selectedTypes = Array.isArray(filters.types) ? filters.types : [];
  const selectedBrands = Array.isArray(filters.brands) ? filters.brands : [];
  const selectedYears = Array.isArray(filters.years) ? filters.years : [];
  const selectedConditionGrades = Array.isArray(filters.conditionGrades) ? filters.conditionGrades : [];

  return products.filter((product) => {
    if (selectedSubject && selectedSubject !== STORE_DEFAULT_SUBJECT && product.subject !== selectedSubject) {
      return false;
    }

    if (selectedTypes.length > 0 && !selectedTypes.includes(product.bookType ?? "")) {
      return false;
    }

    if (selectedBrands.length > 0 && !selectedBrands.includes(product.brand ?? "")) {
      return false;
    }

    if (
      selectedYears.length > 0 &&
      !selectedYears.includes(product.publishedYear === null ? "" : String(product.publishedYear))
    ) {
      return false;
    }

    if (
      selectedConditionGrades.length > 0 &&
      !product.options.some((option) => selectedConditionGrades.includes(option.conditionGrade ?? ""))
    ) {
      return false;
    }

    return productMatchesSearch(product, normalizedSearch);
  });
}

function getMockStorefrontCatalog() {
  if (!mockStorefrontCatalogCache) {
    mockStorefrontCatalogCache = getMockStoreProductRows()
      .map(normalizeStorefrontProductRow)
      .filter((product) => Boolean(product.id));
  }

  return mockStorefrontCatalogCache;
}

function buildMockStorefrontProductsResult(filters = {}) {
  const mockCatalog = getMockStorefrontCatalog();
  const filteredProducts = filterStorefrontProducts(mockCatalog, {
    subject: filters.subject,
    types: filters.types,
    brands: filters.brands,
    years: filters.years,
    conditionGrades: filters.conditionGrades,
    search: filters.search,
  });
  const sortedProducts = sortStorefrontProducts(filteredProducts, filters.sort ?? "latest");
  const offset = normalizeNonNegativeInteger(filters.offset) ?? 0;
  const limit = normalizeNonNegativeInteger(filters.limit) ?? DEFAULT_CATALOG_LIMIT;
  const pagedProducts = sortedProducts.slice(offset, offset + limit);

  return {
    products: pagedProducts,
    books: pagedProducts,
    source: "mock",
    error: null,
  };
}

function hasScopedStorefrontFilters(filters = {}) {
  const search = normalizeText(filters.search);
  const subject = normalizeText(filters.subject);

  return Boolean(
    (subject && subject !== STORE_DEFAULT_SUBJECT) ||
      (Array.isArray(filters.types) && filters.types.length > 0) ||
      (Array.isArray(filters.brands) && filters.brands.length > 0) ||
      (Array.isArray(filters.years) && filters.years.length > 0) ||
      (Array.isArray(filters.conditionGrades) && filters.conditionGrades.length > 0) ||
      search,
  );
}

function buildMockStorefrontProductDetailResult(productId) {
  const mockCatalog = getMockStorefrontCatalog();
  const normalizedProductId = String(productId ?? "").trim();
  const product =
    mockCatalog.find((item) => String(item.id) === normalizedProductId) ??
    mockCatalog.find((item) => String(item.productId) === normalizedProductId) ??
    null;

  if (!product) {
    return {
      product: null,
      book: null,
      options: [],
      relatedProducts: [],
      relatedBooks: [],
      source: "mock",
      error: null,
    };
  }

  const relatedProducts = sortStorefrontProducts(
    mockCatalog.filter(
      (item) =>
        item.id !== product.id &&
        (item.subject === product.subject || item.brand === product.brand || item.bookType === product.bookType),
    ),
    "popular",
  ).slice(0, 4);

  return {
    product,
    book: product,
    options: product.options ?? [],
    relatedProducts,
    relatedBooks: relatedProducts,
    source: "mock",
    error: null,
  };
}

async function rpcWithFallback(primaryRpcName, fallbackRpcName, primaryArgs, fallbackArgs = primaryArgs) {
  const primaryResult = await supabase.rpc(primaryRpcName, primaryArgs);

  if (!primaryResult.error) {
    return {
      data: primaryResult.data,
      error: null,
      source: "supabase",
      rpcName: primaryRpcName,
    };
  }

  if (!fallbackRpcName) {
    return {
      data: null,
      error: primaryResult.error,
      source: "fallback",
      rpcName: primaryRpcName,
    };
  }

  const fallbackResult = await supabase.rpc(fallbackRpcName, fallbackArgs);

  if (!fallbackResult.error) {
    return {
      data: fallbackResult.data,
      error: null,
      source: "legacy",
      rpcName: fallbackRpcName,
    };
  }

  return {
    data: null,
    error: fallbackResult.error ?? primaryResult.error,
    source: "fallback",
    rpcName: fallbackRpcName,
  };
}

async function fetchStorefrontProducts(filters = {}) {
  const mockModePreference = readStoreMockModePreference();
  const mockModeForced = mockModePreference === true;
  const mockModeDisabled = mockModePreference === false;
  const allowImplicitMockFallback = !mockModeDisabled && !hasScopedStorefrontFilters(filters);

  if (mockModeForced) {
    return buildMockStorefrontProductsResult(filters);
  }

  if (!isSupabaseConfigured || !supabase) {
    if (allowImplicitMockFallback) {
      return buildMockStorefrontProductsResult(filters);
    }

    return {
      products: [],
      books: [],
      source: "unavailable",
      error: null,
    };
  }

  const rpcArgs = buildStorefrontRpcArgs(filters);
  const { data, error, source } = await rpcWithFallback(
    PRODUCT_LIST_RPC_NAME,
    LEGACY_BOOK_LIST_RPC_NAME,
    rpcArgs,
  );

  if (error) {
    if (allowImplicitMockFallback) {
      return buildMockStorefrontProductsResult(filters);
    }

    return {
      products: [],
      books: [],
      source,
      error,
    };
  }

  const products = unwrapStorefrontRows(data)
    .map(normalizeStorefrontProductRow)
    .filter((product) => Boolean(product.id));

  if (products.length === 0 && allowImplicitMockFallback) {
    return buildMockStorefrontProductsResult(filters);
  }

  return {
    products,
    books: products,
    source,
    error: null,
  };
}

async function fetchStorefrontProductDetail(productId) {
  const mockModePreference = readStoreMockModePreference();
  const mockModeForced = mockModePreference === true;
  const mockModeDisabled = mockModePreference === false;

  if (!productId) {
    if (!mockModeDisabled) {
      return buildMockStorefrontProductDetailResult(productId);
    }

    return {
      product: null,
      book: null,
      options: [],
      relatedProducts: [],
      relatedBooks: [],
      source: "unavailable",
      error: null,
    };
  }

  if (mockModeForced) {
    return buildMockStorefrontProductDetailResult(productId);
  }

  if (!isSupabaseConfigured || !supabase) {
    if (!mockModeDisabled) {
      return buildMockStorefrontProductDetailResult(productId);
    }

    return {
      product: null,
      book: null,
      options: [],
      relatedProducts: [],
      relatedBooks: [],
      source: "unavailable",
      error: null,
    };
  }

  const { data, error, source } = await rpcWithFallback(
    PRODUCT_DETAIL_RPC_NAME,
    LEGACY_BOOK_DETAIL_RPC_NAME,
    buildStorefrontDetailRpcArgs(productId),
    buildLegacyStorefrontDetailRpcArgs(productId),
  );

  if (error) {
    if (!mockModeDisabled) {
      const mockDetailResult = buildMockStorefrontProductDetailResult(productId);
      if (mockDetailResult.product) {
        return mockDetailResult;
      }
    }

    return {
      product: null,
      book: null,
      options: [],
      relatedProducts: [],
      relatedBooks: [],
      source,
      error,
    };
  }

  const { product, options, relatedProducts } = unwrapStorefrontDetail(data);
  const normalizedProduct = product ? normalizeStorefrontProductRow({ ...product, options }) : null;
  const normalizedOptions = normalizedProduct?.options ?? [];
  const normalizedRelatedProducts = relatedProducts
    .map(normalizeStorefrontProductRow)
    .filter((item) => Boolean(item.id));

  if (!normalizedProduct && !mockModeDisabled) {
    const mockDetailResult = buildMockStorefrontProductDetailResult(productId);
    if (mockDetailResult.product) {
      return mockDetailResult;
    }
  }

  return {
    product: normalizedProduct,
    book: normalizedProduct,
    options: normalizedOptions,
    relatedProducts: normalizedRelatedProducts,
    relatedBooks: normalizedRelatedProducts,
    source,
    error: null,
  };
}

function fetchStorefrontBooks(filters = {}) {
  return fetchStorefrontProducts(filters);
}

function fetchStorefrontBookDetail(productId) {
  return fetchStorefrontProductDetail(productId);
}

export {
  bookConditionLabel,
  buildStorefrontDetailRpcArgs,
  buildStorefrontRpcArgs,
  conditionGradeLabel,
  filterStorefrontProducts,
  filterStorefrontProducts as filterStorefrontBooks,
  fetchStorefrontBookDetail,
  fetchStorefrontBooks,
  fetchStorefrontProductDetail,
  fetchStorefrontProducts,
  getConditionGradeLabel,
  getProductStatusLabel,
  normalizeBoolean,
  normalizeConditionGrade,
  normalizeProductStatus,
  normalizeStorefrontOptionRow,
  normalizeStorefrontProductRow,
  sortStorefrontOptions,
  sortStorefrontProducts,
  sortStorefrontProducts as sortStorefrontBooks,
};
