import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/admin/cj-delivery.js';
import { canReshipOrder } from '../../../packages/shared-domain/src/orderReshipments.js';

// 실제 CJ 호출 없이 API 인증 → 재발송 선점 → 예약/저장 → 재출력을 확인한다.
async function api(t, { mode='success', admin=true } = {}, run) {
  const env={ SUPABASE_URL:'https://db.test', SUPABASE_ANON_KEY:'anon', SUPABASE_SERVICE_ROLE_KEY:'service',
    CJ_API_BASE_URL:'https://courier.test', CJ_CUST_ID:'fixture', CJ_BIZ_REG_NUM:'1234567890', CJ_LOGISTICS_MOCK:'false' };
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  t.after(()=>Object.entries(previous).forEach(([key,value])=>{if(value===undefined)delete process.env[key];else process.env[key]=value;}));
  const order={id:380,order_number:'ORD-TEST',status:'delivered',tracking_number:'ORIGINAL',total_amount:12000,
    shipping_recipient_name:'테스트',shipping_recipient_phone:'01012345678',shipping_address_line1:'테스트로 1',
    order_items:[{id:1416,title:'천체편',quantity:1}]};
  const request={orderId:380,reshipmentAction:'register',requestKey:'00000000-0000-0000-0000-000000000001',
    reason:'오배송으로 고체편 재발송',items:[{orderItemId:1416,title:'고체편',quantity:1}]};
  let row=null; const calls=[]; const bookings=[];
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input); const body=options.body?JSON.parse(options.body):{};
    calls.push(url.pathname);
    if(url.pathname==='/auth/v1/user')return response({id:'admin'});
    if(url.pathname.endsWith('/rpc/is_admin_user'))return response(admin);
    if(url.host==='courier.test') {
      if(url.pathname==='/ReqOneDayToken')return response({RESULT_CD:'S',DATA:{TOKEN_NUM:'token'}});
      if(url.pathname==='/ReqAddrRfnSm')return response({RESULT_CD:'S',DATA:{CLSFCD:'2T01'}});
      if(url.pathname==='/ReqInvcNo')return response({RESULT_CD:'S',DATA:{INVC_NO:'123456789012'}});
      if(url.pathname==='/RegBook') {
        assert.equal(row.state,'booking','접수 전에 DB에 번호를 먼저 기록');
        bookings.push(body.DATA);
        if(mode==='lost')throw new TypeError('fetch failed');
        if(mode==='duplicate')return response({RESULT_CD:'E',RESULT_DETAIL:'ORA-00001 unique constraint'});
        if(mode==='rejected' && bookings.length===1)return response({RESULT_CD:'E',RESULT_DETAIL:'주소 확인'});
        return response({RESULT_CD:'S'});
      }
    }
    if(url.pathname.endsWith('/rpc/admin_claim_order_reshipment')) {
      if(row?.state==='booking')return response({message:'CJ 접수 결과 확인 필요'},400);
      row??={id:12,order_id:380,request_key:request.requestKey,claim_token:'owner',state:'claimed',reason:body.p_reason,items:body.p_items};
      if(row.state==='failed')row.state='claimed';
      return response(row);
    }
    if(url.pathname.endsWith('/rpc/admin_transition_order_reshipment')) {
      if(body.p_action==='booking')Object.assign(row,{state:'booking',tracking_number:body.p_tracking_number,routing_data:body.p_routing_data});
      else if(body.p_action==='registered') {
        if(mode==='dbfail')return response({message:'DB 저장 실패'},500);
        row.state='registered';
      } else row.state='failed';
      return response(row);
    }
    if(url.pathname==='/rest/v1/orders')return response(order);
    if(url.pathname==='/rest/v1/order_reshipments') {
      if(url.searchParams.has('id'))return response(row);
      return response(row?[{...row,claim_token:undefined}]:[]);
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  const invoke=async(body=request,authorized=true)=>{
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;},setHeader(){}};
    await handler({method:'POST',headers:authorized?{authorization:'Bearer test'}:{},body},res);
    return res;
  };
  await run({invoke,request,order,calls,bookings});
}
test('재발송: 원 주문과 다른 교재명으로 별도 예약하고 원 주문 및 합배송은 유지',async(t)=>{
  await api(t,{},async({invoke,request,order,calls,bookings})=>{
    assert.equal((await invoke(request,false)).statusCode,401);
    assert.deepEqual((await invoke({orderId:380,reshipmentAction:'list'})).data.reshipments,[]);
    assert.equal(calls.includes('/ReqOneDayToken'),false);
    const issued=(await invoke()).data.results[0];
    assert.equal(issued.success,true);
    assert.equal(bookings.length,1);
    assert.equal(bookings[0].CUST_USE_NO,'RS-12');
    assert.equal(bookings[0].MPCK_KEY,'RS-12');
    assert.equal(bookings[0].ARRAY[0].GDS_NM,'고체편');
    assert.equal(bookings[0].ARRAY[0].GDS_QTY,'1');
    assert.equal(issued.order.order_items[0].title,'고체편');
    assert.equal(order.tracking_number,'ORIGINAL');
    assert.equal(order.status,'delivered');
    assert.equal(order.total_amount,12000);
    assert.equal(calls.some(call=>/admin_plan_order_deliveries|admin_claim_order_delivery|admin_transition_order_delivery/.test(call)),false);
    assert.equal((await invoke()).data.results[0].status,'reprint');
    const before=calls.filter(path=>path.startsWith('/Req')).length;
    assert.equal((await invoke({orderId:380,reshipmentAction:'reprint',reshipmentId:12})).data.results[0].trackingNumber,'123456789012');
    assert.equal(calls.filter(path=>path.startsWith('/Req')).length,before);
    assert.equal(bookings.length,1);
    assert.equal('claim_token' in (await invoke({orderId:380,reshipmentAction:'list'})).data.reshipments[0],false);
  });
});
for(const mode of ['lost','duplicate','dbfail'])test(`재발송: ${mode}는 예약 재시도/취소 없이 기존 번호를 보존`,async(t)=>{
  await api(t,{mode},async({invoke,calls,bookings})=>{
    const result=(await invoke()).data.results[0];
    assert.equal(result.success,false);
    assert.match(result.error,/123456789012/);
    await invoke();
    assert.equal(bookings.length,1);
    assert.equal(calls.includes('/CnclBook'),false);
  });
});
test('재발송: CJ 명시적 거부는 같은 재발송을 재시도 가능',async(t)=>{
  await api(t,{mode:'rejected'},async({invoke,bookings})=>{
    assert.equal((await invoke()).data.results[0].success,false);
    assert.equal((await invoke()).data.results[0].success,true);
    assert.equal(bookings.length,2);
  });
});
test('재발송: 관리자 아닌 인증 사용자는 기록 조회·발급 모두 금지',async(t)=>{
  await api(t,{admin:false},async({invoke,calls})=>{
    assert.equal((await invoke()).statusCode,403);
    assert.equal((await invoke({orderId:380,reshipmentAction:'list'})).statusCode,403);
    assert.equal(calls.some(path=>path.startsWith('/Req')||path.includes('order_reshipments')),false);
  });
});
test('환불 신청 중 배송완료 주문도 UI에서 재발송 가능, 미발송·미결제·기환불은 차단',()=>{
  const order={status:'delivered',payment_status:'paid',refund_requested_at:'2026-10-07',items:[{id:1}]};
  assert.equal(canReshipOrder(order),true);
  for(const status of ['pending','preparing','cancelled','refunded'])assert.equal(canReshipOrder({...order,status}),false);
  assert.equal(canReshipOrder({...order,payment_status:'pending'}),false);
  assert.equal(canReshipOrder({...order,items:[{id:1,refunded_at:'2026-10-13'}]}),false);
});
