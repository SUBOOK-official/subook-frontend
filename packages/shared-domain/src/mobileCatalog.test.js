import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileCatalogArgs, getProductWebUrl, normalizeMobileProduct } from "./mobileCatalog.js";

test("검색·과목·정렬·페이지 인자를 기존 공개 RPC 계약으로 전달한다", () => {
  assert.deepEqual(buildMobileCatalogArgs({ search: "  2026 수학  ", subject: "수학", sort: "price_low", offset: 24 }), {
    p_search: "2026 수학", p_subjects: ["수학"], p_sort: "price_low", p_limit: 24, p_offset: 24,
  });
  assert.deepEqual(buildMobileCatalogArgs({ search: " ", subject: "임의 과목", sort: "invalid", offset: -1 }), {
    p_search: null, p_subjects: null, p_sort: "popular", p_limit: 24, p_offset: 0,
  });
});

test("상품 id와 실물 옵션 id를 구분하고 가격 미정·품절·등급을 보존한다", () => {
  const product = normalizeMobileProduct({ id: 100, product_id: 42, title: "수학 교재", price: null, condition_grade: "A_PLUS", available_option_count: 0,
    option_books: [{ book_id: 100, product_id: 42, is_available: true, stock_count: 0, price: 0, condition_grade: "S" }] });
  assert.equal(product.id, "42");
  assert.equal(product.price, null);
  assert.equal(product.isSoldOut, true);
  assert.equal(product.grade, "A+ (사용감 적음)");
  assert.equal(product.options[0].id, "100");
  assert.equal(product.options[0].price, 0);
  assert.equal(product.options[0].isAvailable, false);
  assert.equal(normalizeMobileProduct({ id: 42 }).isSoldOut, false);
  assert.equal(normalizeMobileProduct(null), null);
});

test("공유 링크는 수북 상품 URL에만 연결한다", () => {
  assert.equal(getProductWebUrl("2437"), "https://subook.kr/store/2437");
  for (const id of [null, "", 0, -1, "https://example.com", "1/../../", "1e4"]) {
    assert.throws(() => getProductWebUrl(id));
  }
});

test("같은 실물 구성은 한 줄로 묶고 하나라도 판매 가능하면 판매중으로 표시한다", () => {
  const base = { title: "교재", option: "1-7회분 SET", price: 59000, condition_grade: "S" };
  const product = normalizeMobileProduct({ id: 42, option_books: [
    { ...base, book_id: 1, is_available: false, stock_count: 0 },
    { ...base, book_id: 2, is_available: true, stock_count: 1 },
    { ...base, book_id: 3, is_available: true, stock_count: 1 },
    { ...base, book_id: 4, price: 49000, condition_grade: "A_PLUS", is_available: false, stock_count: 0 },
  ] });
  assert.equal(product.options.length, 2);
  assert.equal(product.options[0].isAvailable, true);
  assert.equal(product.options[1].isAvailable, false);
  assert.equal("stockCount" in product.options[0], false);
});

test("상세 사진·옵션 실물·장바구니 줄을 앱 형태로 바꾼다", async () => {
  const { normalizeMobileCartItem, toCheckoutItems } = await import("./mobileCatalog.js");
  const product = normalizeMobileProduct({ id: 7, title: "기출", book_type: "기출",
    inspection_image_urls: ["https://a.example/1.jpg", "http://bad", "https://a.example/2.jpg", "https://a.example/3.jpg"],
    option_books: [{ book_id: 70, option: " 1회 ", is_available: true, stock_count: 1, price: 5000, original_price: 9000 },
      { book_id: "x" }, { book_id: 71, option: "", is_available: false, stock_count: 0, price: 5000 }] });
  assert.deepEqual(product.detailImages, ["https://a.example/1.jpg", "https://a.example/2.jpg"]);
  assert.equal(product.bookType, "기출");
  assert.deepEqual(product.optionBooks.map((book) => [book.id, book.option, book.isSoldOut]), [["70", "1회", false], ["71", "", true]]);

  const item = normalizeMobileCartItem({ id: 3, book_id: 70, product_id: 7, title: "기출", option_label: "1회", price: 5000, stock_count: 1, is_sold_out: false, cover_image_url: "https://a.example/c.jpg" });
  assert.equal(item.isSoldOut, false);
  assert.deepEqual(toCheckoutItems([item, { bookId: "x" }]), [{ bookId: 70, productId: 7, quantity: 1, title: "기출", optionLabel: "1회", conditionGrade: "", coverImageUrl: "https://a.example/c.jpg", price: 5000, originalPrice: null }]);
  assert.equal(normalizeMobileCartItem({ id: "x" }), null);
  assert.equal(normalizeMobileCartItem({ id: 3, book_id: 70, stock_count: 0 }).isSoldOut, true);
});
