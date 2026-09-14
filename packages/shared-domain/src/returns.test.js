import { test } from "node:test";
import assert from "node:assert/strict";
import { getReturnRefundPreview, requiresPhysicalReturn, getBuyerReturnLabel } from "./returns.js";
const order = { status:"delivered",total_amount:23000,refunded_amount:0,items:[{id:1,total_price:10000},{id:2,total_price:10000}] };
test("유료·무료배송 전체 반품은 실제 결제액에서 왕복 차감",()=>{
  assert.equal(getReturnRefundPreview(order,[1,2],"buyer_remorse").amount,17000);
  assert.equal(getReturnRefundPreview({...order,total_amount:50000},[1,2],"buyer_remorse").amount,44000);
  assert.equal(getReturnRefundPreview({...order,total_amount:19000},[1,2],"buyer_remorse").amount,13000);
});
test("하자·발송 전 0원 차감, 일부·기환불·기타 사유는 자동 계산 금지",()=>{
  assert.equal(getReturnRefundPreview(order,[1,2],"seller_fault").deduction,0);
  assert.equal(getReturnRefundPreview({...order,status:"preparing"},[1,2],"buyer_remorse").amount,23000);
  assert.equal(getReturnRefundPreview(order,[1],"buyer_remorse").automatic,false);
  assert.equal(getReturnRefundPreview({...order,refunded_amount:1000},[1,2],"buyer_remorse").automatic,false);
  assert.equal(getReturnRefundPreview(order,[1,2],"other").automatic,false);
  assert.equal(requiresPhysicalReturn({...order,status:"preparing",tracking_number:"123"}),true);
  assert.equal(getBuyerReturnLabel("approved"),"검수 완료 · 환불 예정");
});
