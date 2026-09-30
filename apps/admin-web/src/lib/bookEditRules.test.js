import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBulkBookPrice } from "./bookEditRules.js";

test("전체 가격 적용은 편집 가능한 모든 옵션만 바꾸고 다른 필드와 원본을 보존", () => {
  const books = ["on_sale", "reserved", "sold", "settled", "discarded"].map((status, index) => ({
    id: index + 1, status, priceInput: "5950", optionInput: `시즌6-${index + 1}`,
    gradeInput: "A_PLUS", originalPrice: 10000, isPublic: index === 0,
  }));
  const before = structuredClone(books);
  const result = applyBulkBookPrice(books, " 4,000 ");
  assert.equal(result.price, 4000);
  assert.equal(result.count, 3);
  assert.deepEqual(result.books.map(book => book.priceInput), ["4000", "4000", "4000", "5950", "5950"]);
  assert.deepEqual(result.books.map(({ priceInput: _price, ...book }) => book), books.map(({ priceInput: _price, ...book }) => book));
  assert.deepEqual(books, before);
  assert.equal(result.books[3], books[3]);
  assert.equal(result.books[4], books[4]);
});

test("빈 값·0원·음수·소수·잘못된 숫자는 일부 적용 없이 거절", () => {
  const books = [{ id: 1, status: "on_sale", priceInput: "5950" }];
  for (const value of ["", " ", null, "0", "-100", "4000.5", "4천원", "4,00", "4,,000", "1e4", "Infinity", "9007199254740992"]) {
    assert.throws(() => applyBulkBookPrice(books, value), /1원 이상의 정수/);
    assert.equal(books[0].priceInput, "5950");
  }
  assert.equal(applyBulkBookPrice(books, "1").books[0].priceInput, "1");
});

test("연결 교재가 없거나 전부 가격 잠금 상태면 변경 대상 0권", () => {
  assert.deepEqual(applyBulkBookPrice([], "4000").books, []);
  const books = [{ id: 1, status: "settled", priceInput: "5950" }];
  assert.equal(applyBulkBookPrice(books, "4000").count, 0);
  assert.deepEqual(applyBulkBookPrice(books, "4000").books, books);
});
