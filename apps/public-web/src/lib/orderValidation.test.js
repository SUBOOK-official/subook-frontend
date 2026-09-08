import test from "node:test";
import assert from "node:assert/strict";
import { focusOrderValidationError, getOrderInputField, getOrderValidationErrors } from "./orderValidation.js";

const validOrder = {
  shipping: { recipientName: "테스트", recipientPhone: "010-1234-5678", postalCode: "12345", addressLine1: "테스트 주소", addressLine2: "" },
  refundAccount: { bank: "", number: "", holder: "" },
  isPg: true, agreementOrder: true, agreementPayment: false, agreementRefund: true,
};

test("카드 주문은 환불계좌와 자동취소 동의 없이 통과하며 상세주소를 새로 강제하지 않는다", () => {
  assert.deepEqual(getOrderValidationErrors(validOrder), []);
});
test("무통장 주문은 자동취소 동의와 환불계좌 세 필드를 모두 요구한다", () => {
  assert.deepEqual(getOrderValidationErrors({ ...validOrder, isPg: false }).map(e => e.field),
    ["agreement_payment", "refund_bank", "refund_account_number", "refund_account_holder"]);
  assert.deepEqual(getOrderValidationErrors({ ...validOrder, isPg: false, agreementPayment: true,
    refundAccount: { bank: "국민은행", number: "123-456", holder: "테스트" } }), []);
});
test("빈 연락처와 잘못된 연락처는 기존 오류 코드를 유지하고 같은 입력칸을 가리킨다", () => {
  for (const [phone, field] of [["", "recipient_phone"], ["02-123-4567", "phone_format"]]) {
    const errors = getOrderValidationErrors({ ...validOrder, shipping: { ...validOrder.shipping, recipientPhone: phone } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, field);
    assert.equal(getOrderInputField(field), "recipient_phone");
  }
});
test("여러 누락을 동시에 안내하며 첫 오류는 수령인부터, 주소는 우편번호와 기본주소 모두 필요하다", () => {
  const errors = getOrderValidationErrors({ ...validOrder, shipping: { recipientName: " ", recipientPhone: "", postalCode: "", addressLine1: "" } });
  assert.deepEqual(errors.map(e => e.field), ["recipient_name", "recipient_phone", "address"]);
  for (const field of ["postalCode", "addressLine1"]) {
    assert.equal(getOrderValidationErrors({ ...validOrder, shipping: { ...validOrder.shipping, [field]: "" } })[0].field, "address");
  }
});

test("연락처 형식 오류는 연락처 칸으로, 저장된 주소 오류는 주소 변경 버튼으로 이동한다", () => {
  for (const [field, availableId] of [["phone_format", "checkout-recipient_phone"], ["address", "checkout-address-change"], ["refund_bank", "checkout-refund_bank"]]) {
    const actions = [];
    const target = { focus: () => actions.push("focus"), scrollIntoView: () => actions.push("scroll") };
    const root = { getElementById: id => id === availableId ? target : null };
    focusOrderValidationError(field, root);
    assert.deepEqual(actions, ["focus", "scroll"]);
  }
});
