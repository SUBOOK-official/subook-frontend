import test from "node:test";
import assert from "node:assert/strict";
import { attachRefundRequestItems } from "./refundRequestItems.js";

test("교재 ID를 주문별로 연결하며 레거시 빈 신청은 전체 품목으로 추정하지 않는다",async()=>{
  const orders=[{id:1,refund_requested_at:"now"},{id:2,refund_requested_at:"now"},{id:3}];
  const client={from:table=>{
    assert.equal(table,"order_refund_request_items");
    return {select:()=>({in:async(key,ids)=>{
      assert.equal(key,"order_id");assert.deepEqual(ids,[1,2]);
      return {data:[{order_id:"1",order_item_id:11}],error:null};
    }})};
  }};
  const result=await attachRefundRequestItems(client,orders);
  assert.deepEqual(result.map(row=>row.refund_requested_item_ids),[[11],[],[]]);
  assert.ok(result.every(row=>!row.refund_request_items_error));
});
test("조회 오류는 미기록과 구분하고 신청 없는 주문은 영향받지 않는다",async()=>{
  const client={from:()=>({select:()=>({in:async()=>({error:new Error("offline")})})})};
  const result=await attachRefundRequestItems(client,[{id:1,refund_requested_at:"now"},{id:2}]);
  assert.equal(result[0].refund_request_items_error,true);
  assert.equal(result[1].refund_request_items_error,false);
});
test("신청 없는 주문은 추가 조회하지 않는다",async()=>{
  const result=await attachRefundRequestItems(null,[{id:1}]);
  assert.deepEqual(result[0].refund_requested_item_ids,[]);
});
