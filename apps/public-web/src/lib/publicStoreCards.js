const STORE_CARD_CONDITION_LABELS = Object.freeze({
  S: "S",
  A_PLUS: "A+",
  A: "A",
});

const STORE_CARD_CONDITION_TONES = Object.freeze({
  S: "grade-s",
  A_PLUS: "grade-a-plus",
  A: "grade-a",
});

const STORE_CARD_MOCK_COVER_MARKER = "SUBOOK MOCK";

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

function decodeDataUriPayload(value) {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    return "";
  }

  const [, payload = ""] = normalizedValue.split(",", 2);

  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function isRenderableStoreCardCoverImageUrl(value) {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    return false;
  }

  if (!normalizedValue.startsWith("data:image/svg+xml")) {
    return true;
  }

  return !decodeDataUriPayload(normalizedValue).includes(STORE_CARD_MOCK_COVER_MARKER);
}

function getDirectCoverImageCandidates(entry = {}) {
  return [
    entry.coverImageUrl,
    entry.cover_image_url,
    entry.coverUrl,
    entry.cover_url,
    entry.imageUrl,
    entry.image_url,
    entry.thumbnailUrl,
    entry.thumbnail_url,
  ];
}

function getNestedObjectCandidates(product = {}) {
  const candidates = [
    product.book,
    product.product,
    product.selectedOption,
    product.selected_option,
  ];

  const collections = [
    product.books,
    product.options,
    product.optionBooks,
    product.option_books,
    product.productBooks,
    product.product_books,
    product.items,
    product.variants,
  ];

  for (const collection of collections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const item of collection) {
      if (!item || typeof item !== "object") {
        continue;
      }

      candidates.push(
        item,
        item.book,
        item.product,
        item.selectedOption,
        item.selected_option,
      );
    }
  }

  return candidates.filter((candidate) => candidate && typeof candidate === "object");
}

function getNestedCoverImageCandidates(product = {}) {
  return getNestedObjectCandidates(product).flatMap((candidate) => getDirectCoverImageCandidates(candidate));
}

function getPreferredOption(product = {}) {
  if (product.selectedOption && typeof product.selectedOption === "object") {
    return product.selectedOption;
  }

  if (product.selected_option && typeof product.selected_option === "object") {
    return product.selected_option;
  }

  const options = Array.isArray(product.options) ? product.options : [];
  return options.find((option) => !option?.isSoldOut) ?? options[0] ?? null;
}

function getNormalizedTextFromCandidates(candidates = []) {
  for (const candidate of candidates) {
    const normalizedValue = normalizeOptionalText(candidate);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return null;
}

function getPreferredConditionGrade(product = {}) {
  if (product.conditionGrade) {
    return product.conditionGrade;
  }

  const preferredOption = getPreferredOption(product);

  return preferredOption?.conditionGrade ?? null;
}

export function getStoreCardConditionLabel(conditionGrade) {
  return STORE_CARD_CONDITION_LABELS[conditionGrade] ?? "옵션";
}

export function getStoreCardConditionTone(conditionGrade) {
  return STORE_CARD_CONDITION_TONES[conditionGrade] ?? "neutral";
}

export function getStoreCardCoverImageUrl(product = {}) {
  const candidates = [
    ...getDirectCoverImageCandidates(product),
    ...getNestedCoverImageCandidates(product),
  ];

  for (const candidate of candidates) {
    const normalizedValue = normalizeOptionalText(candidate);
    if (isRenderableStoreCardCoverImageUrl(normalizedValue)) {
      return normalizedValue;
    }
  }

  return null;
}

export function getProductCardTitle(product = {}) {
  const nestedCandidates = getNestedObjectCandidates(product);

  return (
    getNormalizedTextFromCandidates([
      product.title,
      product.name,
      product.bookTitle,
      product.book_title,
      ...nestedCandidates.flatMap((candidate) => [
        candidate.title,
        candidate.name,
        candidate.bookTitle,
        candidate.book_title,
      ]),
    ]) ?? "중고 교재"
  );
}

export function getProductCardPlaceholderEyebrow(product = {}) {
  const nestedCandidates = getNestedObjectCandidates(product);

  return (
    getNormalizedTextFromCandidates([
      product.brand,
      product.subject,
      product.bookType,
      product.book_type,
      ...nestedCandidates.flatMap((candidate) => [
        candidate.brand,
        candidate.subject,
        candidate.bookType,
        candidate.book_type,
      ]),
    ]) ?? "SUBOOK"
  );
}

export function getProductCardPrice(product = {}) {
  const preferredOption = getPreferredOption(product);

  return {
    discountRate:
      preferredOption?.discountRate ??
      preferredOption?.discount_rate ??
      product.discountRate ??
      product.discount_rate ??
      null,
    originalPrice:
      preferredOption?.originalPrice ??
      preferredOption?.original_price ??
      product.originalPrice ??
      product.original_price ??
      null,
    price: preferredOption?.price ?? product.price ?? null,
  };
}

export function getStoreCardTags(product = {}) {
  const tags = [];

  if (product.subject) {
    tags.push({
      key: "subject",
      label: product.subject,
      tone: "subject",
    });
  }

  if (product.brand) {
    tags.push({
      key: "brand",
      label: product.brand,
      tone: "brand",
    });
  }

  const conditionGrade = getPreferredConditionGrade(product);
  if (conditionGrade) {
    tags.push({
      key: "condition",
      label: getStoreCardConditionLabel(conditionGrade),
      tone: getStoreCardConditionTone(conditionGrade),
    });
  }

  return tags;
}

function getProductYearLabel(product = {}) {
  const nestedCandidates = getNestedObjectCandidates(product);
  const candidates = [
    product.publishedYear,
    product.published_year,
    product.year,
    product.targetYear,
    product.target_year,
    product.editionYear,
    product.edition_year,
    ...nestedCandidates.flatMap((candidate) => [
      candidate.publishedYear,
      candidate.published_year,
      candidate.year,
      candidate.targetYear,
      candidate.target_year,
      candidate.editionYear,
      candidate.edition_year,
    ]),
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 2000 && numeric <= 2099) {
      return `${Math.trunc(numeric)}`;
    }
    const text = String(candidate).trim();
    if (text) return text;
  }

  return null;
}

function getProductTeacherLabel(product = {}) {
  const nestedCandidates = getNestedObjectCandidates(product);
  return getNormalizedTextFromCandidates([
    product.teacherName,
    product.teacher_name,
    product.instructorName,
    product.instructor_name,
    product.teacher,
    product.author,
    ...nestedCandidates.flatMap((candidate) => [
      candidate.teacherName,
      candidate.teacher_name,
      candidate.instructorName,
      candidate.instructor_name,
      candidate.teacher,
      candidate.author,
    ]),
  ]);
}

// 카드 메타라인: "2026 · 강기원 · 수학" 같은 1줄.
// year는 별도 톤(neutral-strong), teacher는 일반, subject는 항상 마지막.
// 데이터가 부족하면 가지고 있는 항목만 노출 (• separator 없이 자연스럽게 join).
export function getStoreCardMetaLine(product = {}) {
  const segments = [];

  const year = getProductYearLabel(product);
  if (year) {
    segments.push({ key: "year", label: year, tone: "year" });
  }

  const teacher = getProductTeacherLabel(product);
  if (teacher) {
    segments.push({ key: "teacher", label: teacher, tone: "teacher" });
  }

  const subject = typeof product.subject === "string" ? product.subject.trim() : "";
  if (subject) {
    segments.push({ key: "subject", label: subject, tone: "subject" });
  }

  return segments;
}

export function getStoreDisplayProducts(
  products = [],
  currentPage = 1,
  { isMobileViewport = false, pageSize = 20 } = {},
) {
  const normalizedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : 20;
  const totalPages = Math.max(1, Math.ceil(products.length / normalizedPageSize));
  const requestedPage =
    Number.isFinite(currentPage) && currentPage > 0 ? Math.trunc(currentPage) : 1;
  const safeCurrentPage = Math.min(requestedPage, totalPages);

  if (isMobileViewport) {
    return {
      totalPages,
      safeCurrentPage,
      displayedProducts: products.slice(0, safeCurrentPage * normalizedPageSize),
    };
  }

  const startIndex = (safeCurrentPage - 1) * normalizedPageSize;

  return {
    totalPages,
    safeCurrentPage,
    displayedProducts: products.slice(startIndex, startIndex + normalizedPageSize),
  };
}
