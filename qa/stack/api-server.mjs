// 배포 핸들러를 그대로 HTTP에 연결한다. 업스트림만 요청별 fixture로 대체한다.
// 이 어댑터는 QA 전용이며 제품 빌드·배포 경로에 포함하지 않는다.
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import b2b from '../../apps/public-web/api/b2b-inquiry.js';
import identity from '../../apps/public-web/api/auth/member-identity.js';
import nicepay from '../../apps/public-web/api/payments/nicepay-return.js';

const context = new AsyncLocalStorage();
const fixtureOrigin = 'https://upstream.qa.invalid';
const routes = {'/api/b2b-inquiry':b2b,'/api/auth/member-identity':identity,'/api/payments/nicepay-return':nicepay};
export const fixtureUserId = '00000000-0000-4000-8000-000000000912';
const scenarios = new Set(['ok','queue-retry','queue-fail','queue-denied','no-user','duplicate','expired','stock-conflict','confirm-fail','cancel-fail']);

async function upstream(url, options = {}) {
  const state = context.getStore();
  if (!state) throw new Error('QA: 요청 문맥 밖 업스트림 호출 차단');
  const parsed = new URL(url);
  if (parsed.origin !== fixtureOrigin) throw new Error('QA: 허용하지 않은 외부 요청 차단');
  const body = options.body ? JSON.parse(options.body) : undefined;
  const pathname = parsed.pathname;
  state.calls.push({path:pathname,method:options.method||'GET',body});
  const json = (data, status=200) => Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
  if (pathname.endsWith('/queue_b2b_inquiry_slack')) {
    const attempts = state.calls.filter(c=>c.path===pathname).length;
    if (state.scenario==='queue-fail' || (state.scenario==='queue-retry' && attempts===1)) return json({code:'TEMPORARY'},503);
    if (state.scenario==='queue-denied') return json({code:'DENIED'},403);
    return json({queued:true,referenceId:body.p_inquiry.referenceId});
  }
  if (pathname==='/auth/v1/user') return json(state.scenario==='no-user'?{}:{id:fixtureUserId});
  if (pathname.endsWith('/get_member_phone_binding')) return json({phone:'01000000001'});
  if (pathname.startsWith('/auth/v1/admin/users/')) return json({id:fixtureUserId});
  if (pathname.endsWith('/finalize_pg_checkout_session')) {
    if(state.scenario==='expired') return json({success:false,reason:'session_expired'});
    if(state.scenario==='stock-conflict') return json({message:'book already reserved'},409);
    return json({success:true,order_id:910001,already_completed:state.scenario==='duplicate',payment_status:state.scenario==='duplicate'?'paid':'pending'});
  }
  if (pathname.endsWith('/confirm_pg_payment')) return ['confirm-fail','cancel-fail'].includes(state.scenario)
    ? json({message:'fixture order conflict'},409) : json({order_id:910001,order_number:'QA-ORDER-001',new_status:'preparing'});
  if (pathname.endsWith('/cancel')) return json({resultCode:state.scenario==='cancel-fail'?'9999':'0000'});
  if (pathname.startsWith('/v1/payments/')) return json({resultCode:'0000',status:'paid',amount:23000});
  if (pathname.endsWith('/cancel_unpaid_order') || pathname.endsWith('/notify_ops_slack') || pathname.endsWith('/complete_member_account_merge')) return json({success:true});
  state.unexpected.push(pathname);
  throw new Error(`QA fixture에 없는 업스트림: ${pathname}`);
}

export async function startApiServer({port=0}={}) {
  const savedFetch = globalThis.fetch;
  const values = {SUPABASE_URL:fixtureOrigin,SUPABASE_SERVICE_ROLE_KEY:'qa-service-only',SUPABASE_SERVICE_KEY:'qa-service-only',
    NICEPAY_CLIENT_KEY:'qa-client-only',NICEPAY_SECRET_KEY:'qa-secret-only',NICEPAY_API_BASE:fixtureOrigin,CRON_SECRET:''};
  const previous = Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  Object.assign(process.env,values);
  // HTTP 실행 클라이언트는 로컬 서버에만 접근한다. 실제 핸들러 내부 fetch만 대체한다.
  globalThis.fetch = (url,options) => context.getStore() ? upstream(url,options) : savedFetch(url,options);
  const requests = [];
  const server = http.createServer(async (req,res)=>{
    const url = new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__qa/health') {res.setHeader('Content-Type','application/json');res.end('{"qa":true,"upstream":"fixture","production":false}');return;}
    const handler = routes[url.pathname];
    if(!handler){res.statusCode=404;res.end('Not found');return;}
    const scenario = req.headers['x-qa-scenario'] || 'ok';
    if(!scenarios.has(scenario)){res.statusCode=400;res.end('Unknown QA scenario');return;}
    const chunks=[];for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    try{req.body=JSON.parse(raw);}catch{req.body=raw;}
    const state={scenario,calls:[],unexpected:[],path:url.pathname};
    const originalEnd=res.end;
    res.end=function(...args){
      res.setHeader('X-QA-Upstream-Calls',String(state.calls.length));
      res.setHeader('X-QA-Upstream-Paths',JSON.stringify(state.calls.map(x=>x.path)));
      res.setHeader('X-QA-Unexpected',String(state.unexpected.length));
      const queueCalls=state.calls.filter(c=>c.path.endsWith('/queue_b2b_inquiry_slack'));
      res.setHeader('X-QA-Reference-Count',String(new Set(queueCalls.map(c=>c.body.p_inquiry.referenceId)).size));
      const binding=state.calls.find(c=>c.path.startsWith('/auth/v1/admin/users/'));
      if(binding)res.setHeader('X-QA-Bound-Phone',binding.body.phone);
      res.setHeader('X-QA-Only','local-handler-with-fixtures');
      requests.push({...state,status:res.statusCode});
      // 대량 부하에서도 실행 기록 메모리를 제한한다.
      if(requests.length>10000)requests.shift();
      return originalEnd.apply(this,args);
    };
    res.status=code=>{res.statusCode=code;return res;};
    res.json=body=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));return res;};
    await context.run(state,async()=>{
      try{await handler(req,res);}catch(error){res.status(500).json({error:error.message,code:'QA_ADAPTER_ERROR'});}
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {origin:`http://127.0.0.1:${server.address().port}`,requests,async close(){
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));globalThis.fetch=savedFetch;
    for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=await startApiServer({port:5199});
  console.log(`QA API ${server.origin} — 실제 핸들러 / 외부 응답 fixture`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
}
