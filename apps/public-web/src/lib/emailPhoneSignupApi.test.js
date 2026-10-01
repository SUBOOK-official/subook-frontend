import test from 'node:test';
import assert from 'node:assert/strict';
import kakaoHandler from '../../api/auth/kakao-phone.js';
import signupHandler from '../../api/auth/signup-phone.js';

const response=()=>({code:null,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function config(t) {
  const values={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',SOLAPI_API_KEY:'fixture',SOLAPI_API_SECRET:'fixture',SOLAPI_FROM:'01000000000'};
  const saved=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
  t.after(()=>{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
}
test('카카오 API의 인증 번호와 JWT identity가 일치해야 SMS를 생략한다',async(t)=>{
  config(t);let subject='kakao-123',verified=true,phone='+82 010-1234-5678';const claims=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'member',email:'member@example.invalid',identities:[{provider:'kakao',identity_data:{sub:'kakao-123'}}]});
    if(String(url).includes('kapi.kakao.com'))return Response.json({sub:subject,phone_number:phone,phone_number_verified:verified});
    if(String(url).endsWith('/claim_kakao_member_phone')){claims.push(JSON.parse(options.body));return Response.json({success:true,status:'verified'});}
    throw Error('Unexpected request');
  });
  const req={method:'POST',headers:{authorization:'Bearer fixture'},body:{providerToken:'kakao-token',phone:'01099999999',user_id:'other'}};
  let res=response();await kakaoHandler(req,res);assert.equal(res.code,200);assert.deepEqual(claims,[{p_user_id:'member',p_phone:'01012345678'}]);
  subject='other';res=response();await kakaoHandler(req,res);assert.equal(res.code,403);assert.equal(claims.length,1);
  subject='kakao-123';verified=false;res=response();await kakaoHandler(req,res);assert.equal(res.body.status,'sms_required');assert.equal(claims.length,1);
  verified=true;phone='';res=response();await kakaoHandler(req,res);assert.equal(res.body.status,'sms_required');assert.equal(claims.length,1);
  res=response();await kakaoHandler({...req,headers:{}},res);assert.equal(res.code,401);
});
test('가입 전 SMS는 이메일·번호·한도 검사 뒤 전송하며 Auth 계정을 생성하지 않는다',async(t)=>{
  config(t);const calls=[];let limited=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push(String(url));
    if(String(url).endsWith('/reserve_signup_phone_challenge')){
      const data=JSON.parse(options.body);assert.equal(data.p_email,'member@example.invalid');assert.equal(data.p_phone,'01012345678');assert.match(data.p_secret_hash,/^[a-f0-9]{64}$/);assert.match(data.p_ip_hash,/^[a-f0-9]{64}$/);
      return Response.json(limited?{success:false,error:'한도 초과'}:{success:true});
    }
    if(String(url).startsWith('https://api.solapi.com/'))return Response.json({statusCode:'2000'});
    throw Error('Unexpected request, including Auth creation');
  });
  const req={method:'POST',headers:{'x-vercel-forwarded-for':'127.0.0.1'},body:{action:'send',email:'Member@example.invalid',phone:'010-1234-5678'}};
  let res=response();await signupHandler({...req,body:{...req.body,email:''}},res);assert.equal(res.code,400);assert.equal(calls.length,0);
  res=response();await signupHandler(req,res);assert.equal(res.code,200);assert.match(res.body.secret,/^[a-f0-9]{64}$/);assert.equal(calls.length,2);
  limited=true;res=response();await signupHandler(req,res);assert.equal(res.code,429);assert.equal(calls.length,3);
});
