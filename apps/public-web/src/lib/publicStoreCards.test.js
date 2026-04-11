import test from "node:test";
import assert from "node:assert/strict";
import {
  getProductCardPlaceholderEyebrow,
  getProductCardPrice,
  getProductCardTitle,
  getStoreCardConditionLabel,
  getStoreCardConditionTone,
  getStoreCardCoverImageUrl,
  getStoreCardTags,
  getStoreDisplayProducts,
} from "./publicStoreCards.js";

test("store card condition helpers return spec labels and tones", () => {
  assert.equal(getStoreCardConditionLabel("S"), "S");
  assert.equal(getStoreCardConditionLabel("A_PLUS"), "A+");
  assert.equal(getStoreCardConditionLabel("A"), "A");

  assert.equal(getStoreCardConditionTone("S"), "grade-s");
  assert.equal(getStoreCardConditionTone("A_PLUS"), "grade-a-plus");
  assert.equal(getStoreCardConditionTone("A"), "grade-a");
});

test("getStoreCardTags returns subject, brand, and preferred condition tags", () => {
  assert.deepEqual(
    getStoreCardTags({
      subject: "수학",
      brand: "시대인재",
      conditionGrade: "S",
    }),
    [
      { key: "subject", label: "수학", tone: "subject" },
      { key: "brand", label: "시대인재", tone: "brand" },
      { key: "condition", label: "S", tone: "grade-s" },
    ],
  );

  assert.deepEqual(
    getStoreCardTags({
      subject: "영어",
      brand: "EBS",
      options: [
        { conditionGrade: "S", isSoldOut: true },
        { conditionGrade: "A_PLUS", isSoldOut: false },
      ],
    }),
    [
      { key: "subject", label: "영어", tone: "subject" },
      { key: "brand", label: "EBS", tone: "brand" },
      { key: "condition", label: "A+", tone: "grade-a-plus" },
    ],
  );
});

test("getStoreCardCoverImageUrl prefers real cover URLs and ignores mock svg covers", () => {
  const actualCoverImageUrl = "https://cdn.subook.kr/books/cover-1.jpg";
  const mockSvgCoverImageUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    "<svg><text>SUBOOK MOCK</text></svg>",
  )}`;

  assert.equal(
    getStoreCardCoverImageUrl({
      coverImageUrl: mockSvgCoverImageUrl,
      books: [{ cover_image_url: actualCoverImageUrl }],
    }),
    actualCoverImageUrl,
  );

  assert.equal(
    getStoreCardCoverImageUrl({
      selectedOption: { coverImageUrl: actualCoverImageUrl },
    }),
    actualCoverImageUrl,
  );

  assert.equal(
    getStoreCardCoverImageUrl({
      coverImageUrl: mockSvgCoverImageUrl,
    }),
    null,
  );
});

test("shared product card helpers resolve placeholder text and price from nested option data", () => {
  const product = {
    title: " ",
    product: {
      title: "수학 N제 2026",
      brand: "시대인재",
    },
    options: [
      { conditionGrade: "S", isSoldOut: true, price: 21000, originalPrice: 28000, discountRate: 25 },
      { conditionGrade: "A_PLUS", isSoldOut: false, price: 18000, originalPrice: 28000, discountRate: 36 },
    ],
  };

  assert.equal(getProductCardTitle(product), "수학 N제 2026");
  assert.equal(getProductCardPlaceholderEyebrow(product), "시대인재");
  assert.deepEqual(getProductCardPrice(product), {
    discountRate: 36,
    originalPrice: 28000,
    price: 18000,
  });
});

test("getStoreDisplayProducts uses desktop pagination and mobile cumulative paging", () => {
  const products = Array.from({ length: 45 }, (_, index) => ({ id: index + 1 }));

  assert.deepEqual(
    getStoreDisplayProducts(products, 2, { isMobileViewport: false, pageSize: 20 }),
    {
      totalPages: 3,
      safeCurrentPage: 2,
      displayedProducts: products.slice(20, 40),
    },
  );

  assert.deepEqual(
    getStoreDisplayProducts(products, 2, { isMobileViewport: true, pageSize: 20 }),
    {
      totalPages: 3,
      safeCurrentPage: 2,
      displayedProducts: products.slice(0, 40),
    },
  );
});
