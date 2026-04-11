export const HOME_SUBJECT_ORDER = ["수학", "국어", "영어", "과학", "사회", "한국사", "기타"];
export const HOME_SUBJECT_COUNT_CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.trunc(numericValue);
}

export function createEmptyHomeSubjectCounts() {
  return HOME_SUBJECT_ORDER.reduce((counts, subject) => {
    counts[subject] = 0;
    return counts;
  }, {});
}

export function normalizeHomeSubjectCountRows(rows = []) {
  const normalizedCounts = createEmptyHomeSubjectCounts();

  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    HOME_SUBJECT_ORDER.forEach((subject) => {
      normalizedCounts[subject] = normalizeNonNegativeInteger(rows[subject]);
    });

    return normalizedCounts;
  }

  rows.forEach((row) => {
    const subject = String(row?.subject ?? "").trim();
    if (!HOME_SUBJECT_ORDER.includes(subject)) {
      return;
    }

    normalizedCounts[subject] = normalizeNonNegativeInteger(
      row?.count ?? row?.product_count ?? row?.total_count,
    );
  });

  return normalizedCounts;
}

export function aggregateHomeSubjectCountsFromProducts(products = []) {
  const counts = createEmptyHomeSubjectCounts();

  products.forEach((product) => {
    const subject = String(product?.subject ?? "").trim();
    if (!HOME_SUBJECT_ORDER.includes(subject)) {
      return;
    }

    counts[subject] += 1;
  });

  return counts;
}

export function getTotalHomeSubjectCount(counts = {}) {
  return HOME_SUBJECT_ORDER.reduce(
    (totalCount, subject) => totalCount + normalizeNonNegativeInteger(counts[subject]),
    0,
  );
}

export function isHomeSubjectCountCacheStale(fetchedAt, now = Date.now()) {
  const normalizedFetchedAt = normalizeNonNegativeInteger(fetchedAt);

  if (normalizedFetchedAt === 0) {
    return true;
  }

  return now - normalizedFetchedAt >= HOME_SUBJECT_COUNT_CACHE_TTL_MS;
}
