const POPULARITY_WEIGHTS = Object.freeze({
  salesCount: 1000000,
  viewCount: 1000,
  favoriteCount: 1,
});

const SALES_COUNT_KEYS = [
  "salesCount",
  "sales_count",
  "saleCount",
  "sale_count",
  "purchaseCount",
  "purchase_count",
  "orderCount",
  "order_count",
];

const VIEW_COUNT_KEYS = [
  "viewCount",
  "view_count",
  "views",
  "viewTotal",
  "view_total",
];

const FAVORITE_COUNT_KEYS = [
  "favoriteCount",
  "favorite_count",
  "wishlistCount",
  "wishlist_count",
  "likeCount",
  "like_count",
  "bookmarkCount",
  "bookmark_count",
];

const POPULARITY_SCORE_KEYS = ["popularityScore", "popularity_score"];

function normalizeFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeNonNegativeInteger(value) {
  const numericValue = normalizeFiniteNumber(value);
  return numericValue !== null && numericValue >= 0 ? Math.trunc(numericValue) : null;
}

function readMetricCount(source = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeNonNegativeInteger(source[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readPopularityScore(source = {}) {
  for (const key of POPULARITY_SCORE_KEYS) {
    const value = normalizeFiniteNumber(source[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readPopularityCounts(source = {}) {
  return {
    salesCount: readMetricCount(source, SALES_COUNT_KEYS),
    viewCount: readMetricCount(source, VIEW_COUNT_KEYS),
    favoriteCount: readMetricCount(source, FAVORITE_COUNT_KEYS),
  };
}

function sumPopularityCounts(rows = []) {
  return rows.reduce(
    (totals, row) => {
      const counts = readPopularityCounts(row);

      if (counts.salesCount !== null) {
        totals.salesCount = (totals.salesCount ?? 0) + counts.salesCount;
      }

      if (counts.viewCount !== null) {
        totals.viewCount = (totals.viewCount ?? 0) + counts.viewCount;
      }

      if (counts.favoriteCount !== null) {
        totals.favoriteCount = (totals.favoriteCount ?? 0) + counts.favoriteCount;
      }

      return totals;
    },
    {
      salesCount: null,
      viewCount: null,
      favoriteCount: null,
    },
  );
}

function buildPopularityMetricsFromCounts(counts = {}, fallbackScore = null) {
  const salesCount = counts.salesCount ?? 0;
  const viewCount = counts.viewCount ?? 0;
  const favoriteCount = counts.favoriteCount ?? 0;
  const hasWeightedCounts = salesCount > 0 || viewCount > 0 || favoriteCount > 0;

  return {
    salesCount,
    viewCount,
    favoriteCount,
    score: hasWeightedCounts
      ? salesCount * POPULARITY_WEIGHTS.salesCount +
        viewCount * POPULARITY_WEIGHTS.viewCount +
        favoriteCount * POPULARITY_WEIGHTS.favoriteCount
      : fallbackScore ?? 0,
  };
}

function getComparablePopularityMetrics(product = {}) {
  const hasNormalizedCounts =
    product.salesCount !== undefined ||
    product.viewCount !== undefined ||
    product.favoriteCount !== undefined ||
    product.popularityScore !== undefined;

  if (hasNormalizedCounts) {
    return buildPopularityMetricsFromCounts(
      {
        salesCount: normalizeNonNegativeInteger(product.salesCount),
        viewCount: normalizeNonNegativeInteger(product.viewCount),
        favoriteCount: normalizeNonNegativeInteger(product.favoriteCount),
      },
      normalizeFiniteNumber(product.popularityScore),
    );
  }

  return buildPopularityMetrics(product, Array.isArray(product.options) ? product.options : []);
}

function compareProductsByPopularity(left, right) {
  const leftMetrics = getComparablePopularityMetrics(left);
  const rightMetrics = getComparablePopularityMetrics(right);

  if (rightMetrics.salesCount !== leftMetrics.salesCount) {
    return rightMetrics.salesCount - leftMetrics.salesCount;
  }

  if (rightMetrics.viewCount !== leftMetrics.viewCount) {
    return rightMetrics.viewCount - leftMetrics.viewCount;
  }

  if (rightMetrics.favoriteCount !== leftMetrics.favoriteCount) {
    return rightMetrics.favoriteCount - leftMetrics.favoriteCount;
  }

  return rightMetrics.score - leftMetrics.score;
}

export function buildPopularityMetrics(source = {}, optionRows = []) {
  const sourceCounts = readPopularityCounts(source);
  const optionCounts = Array.isArray(optionRows) ? sumPopularityCounts(optionRows) : {};
  const fallbackScores = [readPopularityScore(source)];

  if (Array.isArray(optionRows)) {
    fallbackScores.push(
      ...optionRows
        .map((row) => readPopularityScore(row))
        .filter((value) => value !== null),
    );
  }

  return buildPopularityMetricsFromCounts(
    {
      salesCount: sourceCounts.salesCount ?? optionCounts.salesCount,
      viewCount: sourceCounts.viewCount ?? optionCounts.viewCount,
      favoriteCount: sourceCounts.favoriteCount ?? optionCounts.favoriteCount,
    },
    fallbackScores.find((value) => value !== null) ?? null,
  );
}

export function getSortTimestamp(product = {}) {
  const candidateValues = [
    product.publishedAt,
    product.published_at,
    product.inspectedAt,
    product.inspected_at,
    product.createdAt,
    product.created_at,
    product.updatedAt,
    product.updated_at,
  ];

  for (const candidate of candidateValues) {
    if (!candidate) {
      continue;
    }

    const numericValue = new Date(candidate).getTime();
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  const fallbackId = normalizeFiniteNumber(product.id ?? product.productId ?? product.product_id);
  return fallbackId ?? 0;
}

function getProductSortPrice(product = {}) {
  const lowestPrice = normalizeFiniteNumber(product.lowestPrice);
  if (lowestPrice !== null) {
    return lowestPrice;
  }

  const price = normalizeFiniteNumber(product.price);
  return price ?? Number.POSITIVE_INFINITY;
}

export function sortStorefrontProducts(products = [], sortKey = "latest") {
  const nextProducts = [...products];

  nextProducts.sort((left, right) => {
    if (sortKey === "price_asc") {
      return getProductSortPrice(left) - getProductSortPrice(right);
    }

    if (sortKey === "price_desc") {
      return (
        (right.highestPrice ?? right.price ?? Number.NEGATIVE_INFINITY) -
        (left.highestPrice ?? left.price ?? Number.NEGATIVE_INFINITY)
      );
    }

    if (sortKey === "popular") {
      return compareProductsByPopularity(left, right) || getSortTimestamp(right) - getSortTimestamp(left);
    }

    return getSortTimestamp(right) - getSortTimestamp(left);
  });

  return nextProducts;
}
