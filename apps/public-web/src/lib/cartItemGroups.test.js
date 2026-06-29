import test from "node:test";
import assert from "node:assert/strict";
import {
  getAddableBooks,
  groupCartItems,
  normalizeCartGrade,
} from "./cartItemGroups.js";

// get_cart_items RPC가 내려주는 형태(book_id별 개별 row)를 흉내낸 fixture.
function makeCartItems() {
  return [
    { id: 1, book_id: 101, product_id: 9, title: "수리논술 수학", option_label: "기하", condition_grade: "S", price: 12000, is_sold_out: false },
    { id: 2, book_id: 102, product_id: 9, title: "수리논술 수학", option_label: "기하", condition_grade: "S", price: 12000, is_sold_out: false },
    { id: 3, book_id: 103, product_id: 9, title: "수리논술 수학", option_label: "미분", condition_grade: "S", price: 12000, is_sold_out: false },
    { id: 4, book_id: 104, product_id: 9, title: "수리논술 수학", option_label: "수학 상하", condition_grade: "S", price: 12000, is_sold_out: false },
    { id: 5, book_id: 105, product_id: 9, title: "수리논술 수학", option_label: "수학 상하", condition_grade: "S", price: 12000, is_sold_out: false },
  ];
}

test("groupCartItems 가 같은 회차·등급을 한 줄로 묶고 수량을 센다", () => {
  const groups = groupCartItems(makeCartItems());
  assert.equal(groups.length, 3, "기하/미분/수학 상하 3그룹");

  const geometry = groups.find((g) => g.optionLabel === "기하");
  assert.equal(geometry.count, 2, "기하 2권");
  assert.equal(geometry.lineTotal, 24000, "기하 라인 합계 = 12000*2");
  assert.deepEqual(geometry.bookIds, [101, 102]);
  assert.deepEqual(geometry.purchasableItemIds, [1, 2]);

  const sangha = groups.find((g) => g.optionLabel === "수학 상하");
  assert.equal(sangha.count, 2);
});

test("groupCartItems 가 입력 순서(최신순)를 유지한다", () => {
  const labels = groupCartItems(makeCartItems()).map((g) => g.optionLabel);
  assert.deepEqual(labels, ["기하", "미분", "수학 상하"]);
});

test("groupCartItems 가 품절 책은 구매가능 수량에서 제외한다", () => {
  const items = [
    { id: 1, book_id: 101, product_id: 9, option_label: "기하", condition_grade: "S", price: 12000, is_sold_out: false },
    { id: 2, book_id: 102, product_id: 9, option_label: "기하", condition_grade: "S", price: 12000, is_sold_out: true },
  ];
  const [group] = groupCartItems(items);
  assert.equal(group.count, 1, "구매가능 1권");
  assert.equal(group.lineTotal, 12000);
  assert.deepEqual(group.purchasableItemIds, [1]);
  assert.deepEqual(group.allItemIds, [1, 2], "삭제 대상엔 품절 row도 포함");
});

test("groupCartItems 가 가격 미등록을 isPriceMissing 으로 표시한다", () => {
  const [group] = groupCartItems([
    { id: 1, book_id: 101, product_id: 9, option_label: "기하", condition_grade: "S", price: null, is_sold_out: false },
  ]);
  assert.equal(group.isPriceMissing, true);
  assert.equal(group.count, 0, "가격 미등록은 구매가능 수량 0");
});

test("getAddableBooks 는 같은 회차·등급의 재고 중 장바구니에 없는 book만 돌려준다", () => {
  const groups = groupCartItems(makeCartItems());
  const geometry = groups.find((g) => g.optionLabel === "기하");
  // 재고: 기하 3권(101,102 이미 담김 + 106 여분), 미분 1권(103 담김)
  const stockBooks = [
    { bookId: 101, option: "기하", grade: "S", price: 12000 },
    { bookId: 102, option: "기하", grade: "S", price: 12000 },
    { bookId: 106, option: "기하", grade: "S", price: 12000 },
    { bookId: 103, option: "미분", grade: "S", price: 12000 },
  ];
  const cartBookIds = makeCartItems().map((i) => i.book_id);
  const addable = getAddableBooks(geometry, stockBooks, cartBookIds);
  assert.deepEqual(addable.map((b) => b.bookId), [106], "여분 106만 추가 가능");
});

test("getAddableBooks 는 재고가 더 없으면 빈 배열", () => {
  const groups = groupCartItems(makeCartItems());
  const calculus = groups.find((g) => g.optionLabel === "미분");
  const stockBooks = [{ bookId: 103, option: "미분", grade: "S", price: 12000 }];
  const cartBookIds = makeCartItems().map((i) => i.book_id);
  assert.deepEqual(getAddableBooks(calculus, stockBooks, cartBookIds), []);
});

test("getAddableBooks 는 등급 표기 차이(A+/A_PLUS)를 정규화해 매칭한다", () => {
  const [group] = groupCartItems([
    { id: 1, book_id: 201, product_id: 9, option_label: "기하", condition_grade: "A+", price: 9000, is_sold_out: false },
  ]);
  const stockBooks = [{ bookId: 202, option: "기하", grade: "A_PLUS", price: 9000 }];
  const addable = getAddableBooks(group, stockBooks, [201]);
  assert.deepEqual(addable.map((b) => b.bookId), [202]);
});

test("normalizeCartGrade 정규화", () => {
  assert.equal(normalizeCartGrade("A+"), "A_PLUS");
  assert.equal(normalizeCartGrade("a_plus"), "A_PLUS");
  assert.equal(normalizeCartGrade("S"), "S");
});
