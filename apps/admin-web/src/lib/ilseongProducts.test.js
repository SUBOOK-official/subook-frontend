import test from "node:test";
import assert from "node:assert/strict";
import { finalPrice, storeProductProblem, storeProductsOf } from "./ilseongProducts.js";

test("그 학습지에 이은 수북 상품만 번호 순으로", () => {
  const store = [
    { product_id: 30, app_product_code: "P1" },
    { product_id: 4, app_product_code: "ILSEONG_2028_SET4" },
    { product_id: 12, app_product_code: "P1" },
  ];
  assert.deepEqual(storeProductsOf(store, "P1").map((item) => item.product_id), [12, 30]);
  assert.deepEqual(storeProductsOf(store, "P9"), []);
  assert.deepEqual(storeProductsOf(null, "P1"), []);
});

test("판매가는 수북의 등록 규칙과 같다", () => {
  assert.equal(finalPrice({ originalPrice: "120000", discountType: "none" }), 120000);
  assert.equal(finalPrice({ originalPrice: "120000", discountType: "amount", discountValue: "20000" }), 100000);
  assert.equal(finalPrice({ originalPrice: "119900", discountType: "rate", discountValue: "15" }), 101915);
  // 비율 할인은 원 단위로 반올림(round(9990 × 0.67) = 6693)
  assert.equal(finalPrice({ originalPrice: "9990", discountType: "rate", discountValue: "33" }), 6693);
  assert.equal(finalPrice({ originalPrice: "", discountType: "none" }), null);
  assert.equal(finalPrice({ originalPrice: "1000", discountType: "amount", discountValue: "" }), null);
});

test("판매 상품 만들기: 고쳐야 할 것을 하나씩 알려 준다", () => {
  const ok = { title: "일성월심 2028", originalPrice: "120000", discountType: "none", discountValue: "", quantity: "300" };
  assert.equal(storeProductProblem(ok), null);
  assert.match(storeProductProblem({ ...ok, title: "  " }), /상품 이름/);
  assert.match(storeProductProblem({ ...ok, originalPrice: "" }), /정가/);
  assert.match(storeProductProblem({ ...ok, discountType: "amount", discountValue: "120000" }), /정가보다 작아야/);
  assert.match(storeProductProblem({ ...ok, discountType: "amount", discountValue: "" }), /깎을 금액을 넣어/);
  assert.match(storeProductProblem({ ...ok, discountType: "rate", discountValue: "100" }), /1–99/);
  assert.equal(storeProductProblem({ ...ok, discountType: "rate", discountValue: "15" }), null);
  assert.match(storeProductProblem({ ...ok, quantity: "" }), /재고가 몇 세트인지/);
  assert.match(storeProductProblem({ ...ok, quantity: "5001" }), /5000세트까지/);
});
