import { test } from "node:test";
import assert from "node:assert/strict";
import { processReturnRefund, matchesReturnRefund } from "../api/_lib/returnRefund.js";
import paymentCancelHandler from "../api/admin/payment-cancel.js";
const attempt={ token:"token",claimed_at:"2026-09-13T04:00:00Z",order:{id:1,order_number:"TEST",total_amount:23000,refunded_amount:0,payment_key:"tid",payment_method:"card"},
  item_ids:[1,2],refund_amount:17000,remaining_before:23000,reason:"단순변심",whole_order:true };
const before={balance:23000,total:23000,cancels:[]};
const after={balance:6000,total:23000,cancels:[{amount:17000,at:"2026-09-13T04:00:05Z",done:true}]};
function setup({startError,pgFailure,commitFailure,bank=false}={}) {
  const calls=[]; const value=structuredClone(attempt);
  if(bank){value.order.payment_key=null;value.order.payment_method="bank_transfer";}
  const supabase={rpc:async(name,params)=>{calls.push({name,params});
    if(name==="admin_claim_return_refund"||name==="admin_get_return_refund_attempt")return startError?{error:{message:startError}}:{data:value};
    if(name==="admin_complete_return_refund")return commitFailure?{error:{message:"DB failure"}}:{data:{refund_amount:17000}};
    return {data:null};}};
  let lookup=0;
  return {calls,args:{supabase,returnId:"return",cancelPayment:async()=>{calls.push({name:"PG_CANCEL"});return pgFailure?{ok:false,message:"timeout"}:{ok:true};},
    getPayment:async()=>{calls.push({name:"PG_GET"});return lookup++?after:before;}}};
}
test("미검수·보류·중복 실행 거부는 PG 조회/취소 0회",async()=>{
  const {args,calls}=setup({startError:"검수 승인 필요"}); assert.equal((await processReturnRefund(args)).status,409);
  assert.equal(calls.some(c=>c.name.startsWith("PG_")),false);
});
test("정확한 승인액으로만 취소, 사전조회→취소→결과조회→DB 확정",async()=>{
  const {args,calls}=setup(); const result=await processReturnRefund(args); assert.equal(result.status,200);
  assert.deepEqual(calls.map(c=>c.name),["admin_claim_return_refund","PG_GET","PG_CANCEL","PG_GET","admin_complete_return_refund"]);
});
test("PG 실패와 PG 성공 후 DB 실패는 재취소 없이 attention으로 기록",async()=>{
  for(const options of [{pgFailure:true},{commitFailure:true}]){
    const {args,calls}=setup(options); assert.equal((await processReturnRefund(args)).status,409);
    assert.equal(calls.filter(c=>c.name==="PG_CANCEL").length,1);
    assert.ok(calls.some(c=>c.name==="admin_flag_return_refund"));
  }
});
test("응답 유실 대사: 취소 재요청 없이 거래내역 일치 시에만 DB 완료",async()=>{
  const {args,calls}=setup(); args.action="reconcile"; args.getPayment=async()=>after;
  assert.equal((await processReturnRefund(args)).status,200); assert.equal(calls.some(c=>c.name==="PG_CANCEL"),false);
  const unmatched=setup(); unmatched.args.action="reconcile";
  assert.equal((await processReturnRefund(unmatched.args)).status,409);
  assert.equal(unmatched.calls.some(c=>c.name==="admin_complete_return_refund"),false);
  assert.equal(matchesReturnRefund(attempt,{...after,cancels:[{amount:17000,at:"2026-09-12T00:00:00Z"}]}),false);
  assert.equal(matchesReturnRefund(attempt,{...after,balance:0}),false);
  assert.equal(matchesReturnRefund(attempt,{...after,total:24000}),false);
});
test("무통장 완료는 PG API를 호출하지 않는다",async()=>{
  const {args,calls}=setup({bank:true}); args.transferReference="2026-09-13 송금 완료";
  assert.equal((await processReturnRefund(args)).status,200); assert.equal(calls.some(c=>c.name.startsWith("PG_")),false);
});

test("실제 API 진입점: 구버전 요청 차단, 입력 금액 변조 무시, NICE/토스 공식 응답 대사",async(t)=>{
  const savedFetch=globalThis.fetch;
  const env={SUPABASE_ADMIN_URL:'https://return-review.supabase.co',SUPABASE_ADMIN_ANON_KEY:'example-anon',
    NICEPAY_CLIENT_KEY:'S2_example',NICEPAY_SECRET_KEY:'example-secret',NICEPAY_API_BASE:'https://pg.example',TOSS_SECRET_KEY:'example-secret'};
  const savedEnv=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  t.after(()=>{globalThis.fetch=savedFetch;for(const [key,value] of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  for(const scenario of [{legacy:true},{provider:'nicepay'},{provider:'nicepay',full:true},{provider:'toss'}]){
    const value=structuredClone(attempt);value.order.pg_provider=scenario.provider;
    if(scenario.full)value.refund_amount=23000;
    const calls=[];let pgCancelled=false;
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(typeof input==='string'?input:input.url);const path=url.pathname;
      const body=options.body?JSON.parse(options.body):null;
      calls.push({host:url.hostname,path,body});
      if(url.hostname==='return-review.supabase.co'){
        if(path==='/auth/v1/user')return Response.json({id:'00000000-0000-4000-8000-000000000099'});
        if(path.endsWith('/is_admin_user'))return Response.json(true);
        if(path.endsWith('/admin_assert_legacy_refund_allowed'))return Response.json({message:'RETURN_INSPECTION_REQUIRED',code:'P0001'},{status:400});
        if(path.endsWith('/admin_claim_return_refund'))return Response.json(value);
        if(path.endsWith('/admin_complete_return_refund'))return Response.json({refund_amount:value.refund_amount});
        throw new Error(`예상 밖 DB 요청: ${path}`);
      }
      if(!['pg.example','api.tosspayments.com'].includes(url.hostname))throw new Error('외부 네트워크 요청 차단');
      if(path.endsWith('/cancel')){pgCancelled=true;return Response.json({resultCode:'0000'});}
      const balance=pgCancelled?23000-value.refund_amount:23000;
      const cancels=pgCancelled?[scenario.provider==='nicepay'
        ?{amount:value.refund_amount,cancelledAt:'2026-09-13T04:00:05Z'}
        :{cancelAmount:value.refund_amount,canceledAt:'2026-09-13T04:00:05Z',cancelStatus:'DONE'}]:[];
      return Response.json(scenario.provider==='nicepay'
        ?{resultCode:'0000',tid:'tid',status:pgCancelled?(balance?'partialCancelled':'cancelled'):'paid',amount:23000,balanceAmt:balance,cancels}
        :{paymentKey:'tid',status:pgCancelled?'PARTIAL_CANCELED':'DONE',totalAmount:23000,balanceAmount:balance,cancels});
    };
    const res={status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
    await paymentCancelHandler({method:'POST',headers:{authorization:'Bearer example-admin'},body:scenario.legacy
      ?{orderId:1,itemIds:[1,2],refundAmount:23000}
      :{returnId:'00000000-0000-4000-8000-000000000001',refundAmount:99999999,itemIds:[999999]}},res);
    if(scenario.legacy){assert.equal(res.statusCode,409);assert.ok(calls.every(c=>c.host==='return-review.supabase.co'));continue;}
    assert.equal(res.statusCode,200,JSON.stringify(res.body));assert.equal(res.body.data.refund_amount,value.refund_amount);
    const cancelCalls=calls.filter(c=>c.path.endsWith('/cancel'));assert.equal(cancelCalls.length,1);
    assert.equal(cancelCalls[0].body[scenario.provider==='nicepay'?'cancelAmt':'cancelAmount'],scenario.full?undefined:17000);
    assert.equal(calls.at(-1).path,'/rest/v1/rpc/admin_complete_return_refund');
  }
});
