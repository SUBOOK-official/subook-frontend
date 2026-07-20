import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateSelectedBooks,
  buildCartArgsFromBooks,
  buildOrderItemsFromBooks,
  getLineTotalForGroup,
  groupOptionsByVariant,
} from "./productOptionGroups.js";

// storefront.js normalizeStorefrontOptionRow 가 내려주는 형태를 흉내낸 fixture.
// 같은 회차("기하")가 2권, "미분" 1권(품절 1권 포함), "확률과 통계" 1권.
function makeOptions() {
  return [
    { id: "1", option: "기하", conditionGrade: "S", conditionGradeLabel: "S (새 책)", price: 12000, originalPrice: 20000, coverImageUrl: "g1.jpg", isSoldOut: false },
    { id: "2", option: "기하", conditionGrade: "S", conditionGradeLabel: "S (새 책)", price: 12000, originalPrice: 20000, coverImageUrl: "g2.jpg", isSoldOut: false },
    { id: "3", option: "미분", conditionGrade: "S", conditionGradeLabel: "S (새 책)", price: 12000, originalPrice: 20000, coverImageUrl: "m1.jpg", isSoldOut: false },
    { id: "4", option: "미분", conditionGrade: "A", conditionGradeLabel: "A", price: 9000, originalPrice: 20000, coverImageUrl: "m2.jpg", isSoldOut: true },
    { id: "5", option: "확률과 통계", conditionGrade: "S", conditionGradeLabel: "S (새 책)", price: 12000, originalPrice: 20000, coverImageUrl: "p1.jpg", isSoldOut: false },
  ];
}

test("groupOptionsByVariant 가 회차별로 중복을 합치고 남은 재고를 센다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  assert.equal(groups.length, 3, "기하/미분/확률과 통계 3개 그룹");

  const labels = groups.map((g) => g.label);
  assert.deepEqual(labels, ["기하", "미분", "확률과 통계"], "회차 라벨에 등급 표기가 없어야 한다");

  const geometry = groups.find((g) => g.key === "기하");
  assert.equal(geometry.availableCount, 2, "기하는 2권 남음");
  assert.equal(geometry.soldOut, false);

  const calculus = groups.find((g) => g.key === "미분");
  assert.equal(calculus.availableCount, 1, "미분은 품절 1권 제외하고 1권 남음");
});

test("groupOptionsByVariant 가 숫자 회차를 자연 정렬 오름차순으로 배열한다", () => {
  // 입고(RPC) 순서가 뒤죽박죽이어도 dropdown 순서는 4 < 9 < 17 < 28 < 29.
  // 사전순 정렬이면 "17" < "28" < "29" < "4" < "9" 가 되므로 자연 정렬 여부를 함께 검증한다.
  const groups = groupOptionsByVariant(
    ["9", "4", "29", "17", "28"].map((option, index) => ({
      id: String(index + 1),
      option,
      conditionGrade: "S",
      price: 4000,
      isSoldOut: false,
    })),
  );
  assert.deepEqual(
    groups.map((g) => g.label),
    ["4", "9", "17", "28", "29"],
  );
});

test("groupOptionsByVariant 가 텍스트+숫자 혼합 라벨도 오름차순으로 배열한다", () => {
  const groups = groupOptionsByVariant(
    ["시즌2 1", "시즌1 11주차", "시즌1 2주차", "vol.14", "vol.7", "10월", "9월"].map(
      (option, index) => ({
        id: String(index + 1),
        option,
        conditionGrade: "S",
        price: 4000,
        isSoldOut: false,
      }),
    ),
  );
  // ko collation은 숫자 → 한글 → 라틴 순서. 같은 접두사 안에서는 숫자 오름차순.
  assert.deepEqual(
    groups.map((g) => g.label),
    ["9월", "10월", "시즌1 2주차", "시즌1 11주차", "시즌2 1", "vol.7", "vol.14"],
  );
});

test("무옵션 그룹이 회차 라벨과 섞여 있으면 항상 맨 앞에 온다", () => {
  const groups = groupOptionsByVariant([
    { id: "1", option: "수학2", conditionGrade: "S", price: 4000, isSoldOut: false },
    { id: "2", option: null, conditionGrade: "S", price: 4000, isSoldOut: false },
    { id: "3", option: "확률과통계", conditionGrade: "S", price: 4000, isSoldOut: false },
  ]);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["기본 옵션", "수학2", "확률과통계"],
  );
});

test("groupOptionsByVariant 가 회차 전량 품절이면 soldOut 처리한다", () => {
  const groups = groupOptionsByVariant([
    { id: "10", option: "극한", conditionGrade: "S", price: 12000, isSoldOut: true },
  ]);
  assert.equal(groups[0].availableCount, 0);
  assert.equal(groups[0].soldOut, true);
});

test("allocateSelectedBooks 는 회차 수량만큼 서로 다른 book_id를 할당한다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  const books = allocateSelectedBooks(groups, [
    { key: "기하", quantity: 2 },
    { key: "미분", quantity: 1 },
  ]);
  const ids = books.map((b) => b.id);
  assert.deepEqual(ids, ["1", "2", "3"], "기하 2권(서로 다른 id) + 미분 1권");
  assert.equal(new Set(ids).size, ids.length, "할당된 book_id는 중복되지 않는다");
});

test("allocateSelectedBooks 는 남은 재고를 초과하지 않도록 캡한다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  // 기하는 2권뿐인데 5권 요청 → 2권으로 캡, 품절 미분(A)은 절대 잡히지 않음
  const books = allocateSelectedBooks(groups, [{ key: "기하", quantity: 5 }]);
  assert.equal(books.length, 2);
  const calculus = allocateSelectedBooks(groups, [{ key: "미분", quantity: 3 }]);
  assert.deepEqual(calculus.map((b) => b.id), ["3"], "재고 있는 미분 1권만, 품절 id=4 제외");
});

test("getLineTotalForGroup 은 실제 할당될 책들의 가격 합을 돌려준다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  const geometry = groups.find((g) => g.key === "기하");
  assert.equal(getLineTotalForGroup(geometry, 2), 24000);
  assert.equal(getLineTotalForGroup(geometry, 5), 24000, "재고 초과 요청도 실제 재고 기준");
});

test("buildOrderItemsFromBooks 는 권당 quantity:1 주문 아이템을 만든다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  const books = allocateSelectedBooks(groups, [{ key: "기하", quantity: 2 }]);
  const product = { productId: 99, title: "2026 수리논술 수학", subject: "수학", brand: "시대인재", coverImageUrl: "prod.jpg", originalPrice: 20000 };
  const items = buildOrderItemsFromBooks(product, books);

  assert.equal(items.length, 2);
  assert.deepEqual(
    items[0],
    {
      bookId: "1",
      productId: 99,
      quantity: 1,
      title: "2026 수리논술 수학",
      optionLabel: "기하",
      conditionGrade: "S",
      coverImageUrl: "g1.jpg",
      price: 12000,
      originalPrice: 20000,
    },
  );
  assert.ok(items.every((i) => i.quantity === 1), "모든 아이템 수량은 1");
});

test("buildCartArgsFromBooks 는 book 단위 addToCart 인자를 만든다", () => {
  const groups = groupOptionsByVariant(makeOptions());
  const books = allocateSelectedBooks(groups, [
    { key: "기하", quantity: 1 },
    { key: "확률과 통계", quantity: 1 },
  ]);
  const product = { productId: 99, title: "2026 수리논술 수학", subject: "수학", brand: "시대인재", coverImageUrl: "prod.jpg" };
  const args = buildCartArgsFromBooks(product, books);

  assert.deepEqual(args.map((a) => a.bookId), ["1", "5"]);
  assert.ok(args.every((a) => a.quantity === 1));
  assert.equal(args[0].productMeta.optionLabel, "기하");
  assert.equal(args[0].productMeta.conditionGrade, "S (새 책)", "메타에는 등급 라벨 보존");
});

test("무옵션(단권) 상품도 기본 그룹 하나로 묶인다", () => {
  const groups = groupOptionsByVariant([
    { id: "20", option: null, conditionGrade: "S", price: 15000, isSoldOut: false },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "기본 옵션");
  assert.equal(groups[0].availableCount, 1);
});
