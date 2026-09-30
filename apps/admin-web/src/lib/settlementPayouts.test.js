import test from "node:test";
import assert from "node:assert/strict";
import { filterSettlementPayouts, groupSettlementPayouts, hasPayoutAccount } from "./settlementPayouts.js";

const row = (id, extra = {}) => ({
  id, seller_user_id: "seller-1", seller_name: "테스트 셀러", seller_phone: "010-0000-0001",
  bank_name: "테스트은행", account_number: "123-456", account_holder: "테스트 셀러",
  sale_amount: 10000, fee_amount: 4500, net_amount: 5500, book_title: "수학 교재",
  status: "pending", scheduled_date: "2026-12-01", ...extra,
});

test("예정일·pending/approved 구분 없이 원장 금액을 합산하고 0원도 포함한다", () => {
  const [group] = groupSettlementPayouts([row(1), row(2, { status: "approved", net_amount: 500 }), row(3, { net_amount: 0 })]);
  assert.deepEqual(group.settlement_ids, [1, 2, 3]);
  assert.equal(group.total_net_amount, 6000);
  assert.equal(group.total_deduction, 10500);
  assert.equal(group.total_sale_amount - group.total_fee_amount - group.total_deduction, group.total_net_amount);
});
test("같은 셀러의 다른 은행·계좌·예금주는 별도 지급이며 번호 구분기호는 무시한다", () => {
  const groups = groupSettlementPayouts([row(1), row(2, { account_number: "123456" }), row(3, { bank_name: "다른은행" }), row(4, { account_holder: "다른 예금주" })]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].settlement_ids, [1, 2]);
});
test("회원이 다르거나 동명이인 비회원의 전화가 다르면 합치지 않는다", () => {
  const guest = { seller_user_id: null, account_number: "", bank_name: "" };
  const groups = groupSettlementPayouts([row(1), row(2, { seller_user_id: "seller-2" }), row(3, guest), row(4, { ...guest, seller_phone: "01000000002" })]);
  assert.equal(groups.length, 4);
});
test("비회원의 여러 수거는 연락처가 같으면 합산, 연락처 미상은 수거별 구분한다", () => {
  const guest = { seller_user_id: null };
  const groups = groupSettlementPayouts([row(1, { ...guest, shipment_id: 10 }), row(2, { ...guest, shipment_id: 11, seller_phone: "01000000001" }), row(3, { ...guest, seller_phone: "", shipment_id: 12 }), row(4, { ...guest, seller_phone: "", shipment_id: 13 })]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].settlement_ids, [1, 2]);
});
test("교재·주문 검색은 일치한 셀러의 전체 금액과 대상 ID를 유지한다", () => {
  const groups = groupSettlementPayouts([row(1), row(2, { book_title: "영어 교재", order_number: "ORDER-2" })]);
  for (const query of ["수학", "order-2", "테스트 셀러"]) {
    const [group] = filterSettlementPayouts(groups, query);
    assert.equal(group.total_net_amount, 11000);
    assert.deepEqual(group.settlement_ids, [1, 2]);
  }
  assert.equal(filterSettlementPayouts(groups, "없는 교재").length, 0);
});
test("계좌 미등록·부분 등록·마스킹 계좌는 지급 가능으로 표시하지 않는다", () => {
  assert.equal(hasPayoutAccount(row(1)), true);
  for (const patch of [{ bank_name: "" }, { account_holder: "" }, { account_number: "" }, { account_number: "****-1234" }]) {
    assert.equal(hasPayoutAccount(row(1, patch)), false);
  }
});
