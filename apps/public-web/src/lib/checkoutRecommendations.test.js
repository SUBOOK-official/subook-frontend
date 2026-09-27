import test from "node:test";
import assert from "node:assert/strict";
import { getRecommendationOptions, isCheckoutBookAvailable, mergeVerifiedCheckoutItems, persistCheckoutItems } from "./checkoutRecommendations.js";

test("늦은 가격 검증은 추가한 추천을 보존하고 삭제한 품목을 되살리지 않는다", () => {
  const snapshot = [{ bookId: 1, price: 5000 }, { bookId: 2, price: 6000 }];
  const added = { bookId: 3, price: 9000, isRecommendation: true };
  assert.deepEqual(mergeVerifiedCheckoutItems([snapshot[0], added], snapshot, [
    { id: 1, price: 7000, status: "on_sale", is_public: true },
    { id: 2, price: 6000, status: "on_sale", is_public: true },
  ]), [{ bookId: 1, price: 7000 }, added]);
});

test("가격 미정·품절·비공개 재고는 주문에서 제외한다", () => {
  for (const override of [{ price: null }, { price: -1 }, { price: "invalid" }, { status: "sold" }, { is_public: false }]) {
    const row = { id: 1, price: 1000, status: "on_sale", is_public: true, ...override };
    assert.equal(isCheckoutBookAvailable(row), false);
    assert.deepEqual(mergeVerifiedCheckoutItems([{ bookId: 1 }], [{ bookId: 1 }], [row]), []);
  }
});

test("동일 회차·등급·가격은 한 옵션, 다른 등급과 가격은 별도 옵션", () => {
  const base = { id: 1, option: "1회", conditionGrade: "A+", price: 1000 };
  assert.deepEqual(getRecommendationOptions([base, { ...base, id: 2, conditionGrade: "A_PLUS" },
    { ...base, id: 3, conditionGrade: "S" }, { ...base, id: 4, price: 2000 },
    { ...base, id: 5, isSoldOut: true }, { ...base, id: 6, isPublic: false }, { ...base, id: 7, price: null },
  ]).map((option) => option.id), [1, 3, 4]);
});

test("재진입용 주문 저장은 router 필드를 보존하고 다른 entry에 쓰지 않는다", () => {
  const history = { state: { key: "checkout", idx: 2, usr: { guestMode: true } }, replaceState(value) { this.state = value; } };
  const items = [{ bookId: 3, isRecommendation: true }];
  assert.equal(persistCheckoutItems(history, "checkout", items), true);
  assert.deepEqual(history.state, { key: "checkout", idx: 2, usr: { guestMode: true, items } });
  assert.equal(persistCheckoutItems(history, "different", []), false);
  assert.deepEqual(history.state.usr.items, items);
});
