import test from "node:test";
import assert from "node:assert/strict";
import { selectDiscountProducts, loadCompleteDiscountCatalog } from "./storefrontDiscounts.js";
test("only discounted books, ordered globally by actual percentage", () => {
  const rows = [{id:1,price:80,originalPrice:100},{id:2,price:60,originalPrice:100},{id:3,price:10},{id:4,price:100,originalPrice:100}];
  assert.deepEqual(selectDiscountProducts(rows,{discounts:['sale'],sort:'discount_desc'}).map(x=>x.id),[2,1]);
  assert.deepEqual(selectDiscountProducts(rows,{discounts:['sale'],sort:'discount_asc'}).map(x=>x.id),[1,2]);
  assert.equal(selectDiscountProducts(rows,{sort:'discount_asc'})[0].id,3);
});
test("reads all pages even when server caps results and omits total count", async () => {
  const calls=[];
  const rows=Array.from({length:7},(_,id)=>({id:id+1}));
  const result=await loadCompleteDiscountCatalog(async({offset})=>{calls.push(offset);return {products:rows.slice(offset,offset+3),totalCount:3,source:'rpc'};},{});
  assert.equal(result.products.length,7);
  assert.deepEqual(calls,[0,3,6,7]);
});
test("never silently displays a partial catalog on failure", async () => {
  await assert.rejects(loadCompleteDiscountCatalog(async({offset})=>offset?{error:new Error('fail')}:{products:[{id:1}]},{}));
});
