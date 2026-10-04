import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleSmsHook, verifySmsHook } from '../../api/auth/phone-sms-hook.js';
import identityHandler from '../../api/auth/member-identity.js';

const secret = `v1,whsec_${Buffer.alloc(32,7).toString('base64')}`;
function signed(raw, timestamp = Math.floor(Date.now()/1000)) {
  const id='fixture-hook-1';
  const signature=createHmac('sha256',Buffer.alloc(32,7)).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return new Headers({'webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':`v1,${signature}`});
}
test('SMS hook 서명은 원문/시간/서명을 검증한다',()=>{
  const raw='{"user":{"phone":"821012345678"},"sms":{"otp":"123456"}}';
  // 실행 중 초가 바뀌어 미래 301초가 허용 범위 300초로 들어오는 흔들림을 막는다.
  const timestamp=1700000000;
  const now=timestamp*1000;
  const headers=signed(raw,timestamp);
  assert.equal(verifySmsHook(raw,headers,secret,now),true);
  assert.equal(verifySmsHook(raw+' ',headers,secret,now),false);
  assert.equal(verifySmsHook(raw,signed(raw,timestamp-300),secret,now),true);
  assert.equal(verifySmsHook(raw,signed(raw,timestamp+300),secret,now),true);
  assert.equal(verifySmsHook(raw,signed(raw,timestamp-301),secret,now),false);
  assert.equal(verifySmsHook(raw,signed(raw,timestamp+301),secret,now),false);
  assert.equal(verifySmsHook(raw,headers,'',now),false);
});
test('SMS hook은 유효한 서명+발송 예약에만 1번 전송하고 실패를 숨기지 않는다',async(t)=>{
  const values={SUPABASE_SEND_SMS_HOOK_SECRET:secret,SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',SOLAPI_API_KEY:'fixture',SOLAPI_API_SECRET:'fixture',SOLAPI_FROM:'01000000000'};
  const original=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]])); Object.assign(process.env,values);
  t.after(()=>{for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const raw='{"user":{"phone":"821012345678"},"sms":{"otp":"123456"}}';
  const request=()=>new Request('https://fixture.invalid/hook',{method:'POST',headers:signed(raw),body:raw});
  let sent=0; let duplicate=false; let unavailable=false;
  t.mock.method(globalThis,'fetch',async(url)=>{
    if(String(url).endsWith('reserve_member_auth_sms_hook'))return Response.json(duplicate?{sent:true}:{success:true});
    if(String(url).endsWith('complete_member_auth_sms_hook'))return new Response(null,{status:204});
    if(String(url).startsWith('https://api.solapi.com/')){sent++;return unavailable?Response.json({errorCode:'failed'},{status:500}):Response.json({statusCode:'2000'});}
    throw Error('Unexpected request');
  });
  const invalid=new Request('https://fixture.invalid/hook',{method:'POST',body:raw});
  assert.equal((await handleSmsHook(invalid)).status,401); assert.equal(sent,0);
  assert.equal((await handleSmsHook(request())).status,200);assert.equal(sent,1);
  duplicate=true;assert.equal((await handleSmsHook(request())).status,200);assert.equal(sent,1);
  duplicate=false;unavailable=true;assert.equal((await handleSmsHook(request())).status,502);assert.equal(sent,2);
});
function responseRecorder(){return {code:null,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('전화 연결 API는 JWT 확인 후 DB에서 증명한 번호만 사용한다',async(t)=>{
  const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
  t.after(()=>{if(saved.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=saved.url;if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;});
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});
    if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'fixture-user',phone:''});
    if(String(url).endsWith('/get_member_phone_binding'))return Response.json({phone:'821011111111',previous_user_id:null});
    if(String(url).endsWith('/admin/users/fixture-user'))return Response.json({id:'fixture-user'});
    throw Error('Unexpected request');
  });
  const unauth=responseRecorder();await identityHandler({method:'POST',headers:{},body:{action:'bind'}},unauth);
  assert.equal(unauth.code,401);assert.equal(calls.length,0);
  const res=responseRecorder();await identityHandler({method:'POST',headers:{authorization:'Bearer fixture-user-token'},body:{action:'bind',phone:'821099999999',user_id:'someone-else'}},res);
  assert.equal(res.code,200);
  assert.deepEqual(calls.at(-1).body,{phone:'821011111111',phone_confirm:true});
  assert.deepEqual(calls[1].body,{p_user_id:'fixture-user'});
});
