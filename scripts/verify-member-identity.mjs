// UI 계약 검증. 모든 인증/DB/문자 요청은 가로채며 실제 SMS나 회원 변경을 하지 않는다.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const env = parseEnv(readFileSync('.env', 'utf8'));
const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const output = '.codex/qa-screenshots'; mkdirSync(output,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome'});
const id = '00000000-0000-0000-0000-000000000901';
const otherId = '00000000-0000-0000-0000-000000000902';
const now = new Date().toISOString();
function sessionFor(provider='phone') {
  const user={id,aud:'authenticated',role:'authenticated',email:provider==='phone'?'':'member@example.invalid',phone:'821012345678',phone_confirmed_at:now,created_at:now,
    app_metadata:{provider,providers:[provider]},user_metadata:{}};
  const payload={sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
  return {access_token:`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,expires_at:payload.exp,user};
}
async function setup({signedIn=false,verified=false,provider='phone',merge=false,emailVerified=true}={}) {
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const state={signedIn,verified,provider,terms:provider!=='phone',otpRequests:0,bindRequests:0};
  if(signedIn) await context.addInitScript(({key,session,mergeRequest})=>{
    sessionStorage.setItem(key,JSON.stringify(session));
    if(mergeRequest) sessionStorage.setItem('subook.member.merge',JSON.stringify(mergeRequest));
  },{key:`sb-${project}-auth-token`,session:sessionFor(provider),mergeRequest:merge?{id:'00000000-0000-0000-0000-000000000999',secret:'fixture-secret'}:null});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/api/auth/member-identity'){state.bindRequests++;return json({success:true});}
    if(url.pathname==='/api/auth/send-phone-otp'){state.otpRequests++;return json({success:true,expiresInSec:300});}
    // 배너 등 부수 API도 로컬 프록시를 통해 외부 서비스로 나가지 않게 한다.
    if(url.pathname.startsWith('/api/'))return json([]);
    if(url.origin==='http://127.0.0.1:5183') return route.continue();
    if(!url.hostname.endsWith('.supabase.co')) return route.fulfill({status:204,body:''});
    const body=route.request().postDataJSON()||{};
    if(url.pathname.endsWith('/otp')){state.otpRequests++;return json({});}
    if(url.pathname.endsWith('/verify')){
      if(body.token!=='123456')return json({error_code:'otp_expired',msg:'Token has expired or is invalid'},403);
      state.signedIn=true;state.verified=true;return json(sessionFor(provider));
    }
    if(url.pathname.endsWith('/user'))return json(sessionFor(provider).user);
    const name=url.pathname.split('/').pop();
    if(name==='get_member_identity_policy')return json({enabled:true,phone_signup_enabled:true,merge_enabled:true});
    if(name==='get_my_member_identity')return json({enabled:true,status:state.verified?'verified':'unverified',phone:state.verified?'01012345678':null,can_merge:true});
    if(name==='get_current_auth_account_role')return json([{account_role:'member',user_id:id,email:provider==='phone'?`${id}@oauth.subook.local`:'member@example.invalid',name:provider==='phone'?id:'회원',phone:'',email_verified_at:provider==='phone'||!emailVerified?null:now,terms_agreed_at:state.terms?now:null,privacy_agreed_at:state.terms?now:null}]);
    if(name==='verify_phone_otp'){if(body.p_code!=='123456')return json({success:false,error:'인증번호가 일치하지 않습니다.'});return json({success:true,status:'merge_required',phone:'01012345678'});}
    if(['start_member_account_merge','prove_member_account_merge','get_member_account_merge'].includes(name))return json({id:'00000000-0000-0000-0000-000000000999',secret:'fixture-secret',completed:false,accounts:[
      {id,email:'member@example.invalid',provider:'email',verified:true,orders:3,points:1500},
      {id:otherId,email:'fr***@example.invalid',provider:'google',verified:false,orders:null,points:null},
    ]});
    if(name==='complete_oauth_signup'){state.terms=true;return json({success:true});}
    if(name==='is_admin_user')return json(false);
    return json([]);
  });
  return {page,context,state,errors};
}
try {
  const signup=await setup();
  await signup.page.goto('http://127.0.0.1:5183/signup');
  await signup.page.getByRole('button',{name:'인증번호 받기',exact:true}).waitFor();
  await signup.page.screenshot({path:`${output}/phone-signup-desktop.png`,fullPage:true});
  await signup.page.setViewportSize({width:390,height:844});
  await signup.page.screenshot({path:`${output}/phone-signup-mobile.png`,fullPage:true});
  assert.equal(await signup.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await signup.page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
  await signup.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();
  await signup.page.getByLabel('인증번호 6자리').fill('000000');
  await signup.page.getByRole('button',{name:'인증하고 계속하기'}).click();
  await signup.page.getByRole('alert').waitFor(); assert.equal(signup.state.bindRequests,0);
  await signup.page.getByLabel('인증번호 6자리').fill('123456');
  await signup.page.getByRole('button',{name:'인증하고 계속하기'}).click();
  await signup.page.waitForURL(/auth\/oauth-consent/);
  assert.equal(await signup.page.locator('input[type=password]').count(),0);
  assert.equal(signup.state.otpRequests,1); assert.equal(signup.state.bindRequests,1);
  assert.deepEqual(signup.errors,[]); await signup.context.close();
  const legacy=await setup({signedIn:true,provider:'email'});
  await legacy.page.goto('http://127.0.0.1:5183/mypage');
  await legacy.page.waitForURL(/auth\/verify-phone/);
  await legacy.page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
  await legacy.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();
  await legacy.page.getByLabel('인증번호 6자리').fill('123456');
  await legacy.page.getByRole('button',{name:'인증하고 계속하기'}).click();
  await legacy.page.waitForURL(/auth\/merge/);
  await legacy.page.getByText('member@example.invalid',{exact:true}).waitFor();
  assert.equal(await legacy.page.getByRole('button',{name:'이 계정을 대표로 통합하기'}).isDisabled(),true);
  await legacy.page.screenshot({path:`${output}/phone-merge-desktop.png`,fullPage:true});
  await legacy.page.setViewportSize({width:390,height:844});
  await legacy.page.screenshot({path:`${output}/phone-merge-mobile.png`,fullPage:true});
  assert.equal(await legacy.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(legacy.errors,[]); await legacy.context.close();
  const migrated=await setup({signedIn:true,verified:true,provider:'email',emailVerified:false});
  await migrated.page.goto('http://127.0.0.1:5183/mypage');
  await migrated.page.locator('.public-mypage-breadcrumb__title').waitFor();
  assert.equal(new URL(migrated.page.url()).pathname,'/mypage');
  assert.deepEqual(migrated.errors,[]); await migrated.context.close();
  console.log('PASS: 신규 휴대폰 가입/오입력/약관 이동/비밀번호 생략/기존 회원 강제 인증/통합 진입/기존 이메일 미인증 계정의 전화 인증 전환/모바일 넘침 없음. 모든 외부 요청 mocked.');
} finally {await browser.close();}
