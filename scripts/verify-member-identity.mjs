// UI 계약 검증. 모든 인증/DB/문자 요청은 가로채며 실제 SMS나 회원 변경을 하지 않는다.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const env = parseEnv(readFileSync('.env', 'utf8'));
const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4173';
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
async function setup({signedIn=false,verified=false,provider='phone',merge=false,emailVerified=true,duplicate=false,proofChecked=false}={}) {
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const state={signedIn,verified,provider,terms:provider!=='phone',otpRequests:0,bindRequests:0,proofChecked,mergeRequests:0};
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
    if(url.origin===origin) return route.continue();
    if(!url.hostname.endsWith('.supabase.co')) return route.fulfill({status:204,body:''});
    const body=route.request().postDataJSON()||{};
    if(url.pathname.endsWith('/otp')){state.otpRequests++;return json({});}
    if(url.pathname.endsWith('/verify')){
      if(body.token!=='123456')return json({error_code:'otp_expired',msg:'Token has expired or is invalid'},403);
      state.signedIn=true;state.verified=true;return json(sessionFor(provider));
    }
    if(url.pathname.endsWith('/user'))return json(sessionFor(provider).user);
    const name=url.pathname.split('/').pop();
    if(name==='get_member_identity_policy')return json({enabled:true,phone_signup_enabled:false,email_required:true,merge_enabled:true});
    if(name==='get_my_member_identity')return json({enabled:true,status:state.verified?'verified':duplicate&&state.proofChecked?'existing_account':'unverified',phone:state.verified?'01012345678':null,can_merge:!state.verified&&state.proofChecked&&!duplicate});
    if(name==='get_current_auth_account_role')return json([{account_role:'member',user_id:id,email:provider==='phone'?`${id}@oauth.subook.local`:'member@example.invalid',name:provider==='phone'?id:'회원',phone:'',email_verified_at:provider==='phone'||!emailVerified?null:now,terms_agreed_at:state.terms?now:null,privacy_agreed_at:state.terms?now:null}]);
    if(name==='verify_phone_otp'){if(body.p_code!=='123456')return json({success:false,error:'인증번호가 일치하지 않습니다.'});state.proofChecked=true;return json({success:true,status:duplicate?'existing_account':'merge_required',phone:duplicate?undefined:'01012345678'});}
    if(name==='start_member_account_merge')state.mergeRequests++;
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
  // 신규 가입과 이메일 필수 정책은 verify-email-phone-signup.mjs에서 검증한다.
  const legacy=await setup({signedIn:true,provider:'email'});
  await legacy.page.goto(origin+'/mypage');
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
  const protectedAccount=await setup({signedIn:true,provider:'google',duplicate:true});
  await protectedAccount.page.goto(origin+'/auth/verify-phone');
  await protectedAccount.page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
  await protectedAccount.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();
  await protectedAccount.page.getByLabel('인증번호 6자리').fill('123456');
  await protectedAccount.page.getByRole('button',{name:'인증하고 계속하기'}).click();
  await protectedAccount.page.getByRole('heading',{name:'기존 계정으로 이어서',exact:true}).waitFor();
  assert.equal(protectedAccount.state.mergeRequests,0);
  assert.equal(protectedAccount.state.bindRequests,0);
  await protectedAccount.page.setViewportSize({width:390,height:844});
  await protectedAccount.page.screenshot({path:`${output}/phone-conflict-recovery-mobile.png`,fullPage:true});
  assert.equal(await protectedAccount.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(protectedAccount.errors,[]); await protectedAccount.context.close();
  for(const proofChecked of [true,false]){
    const stale=await setup({signedIn:true,provider:'google',duplicate:true,proofChecked});
    await stale.page.goto(origin+'/auth/merge');
    await stale.page.waitForURL(/auth\/verify-phone/);
    await stale.page.getByRole('heading',{name:proofChecked?'기존 계정으로 이어서':'내 번호로, 내 계정 확인',exact:true}).waitFor();
    assert.equal(stale.state.mergeRequests,0);
    assert.equal(await stale.page.getByText('통합할 수 없는 계정입니다.').count(),0);
    assert.deepEqual(stale.errors,[]);await stale.context.close();
  }
  const migrated=await setup({signedIn:true,verified:true,provider:'email',emailVerified:true});
  await migrated.page.goto(origin+'/auth/merge');
  await migrated.page.locator('.public-mypage-breadcrumb__title').waitFor();
  assert.equal(new URL(migrated.page.url()).pathname,'/mypage');
  assert.deepEqual(migrated.errors,[]); await migrated.context.close();
  console.log('PASS: 기존 회원 강제 인증/정상 통합/구글 번호 중복 안내/오류·만료 화면 복구/인증 계정 마이페이지/모바일. 모든 외부 요청 mocked.');
} finally {await browser.close();}
