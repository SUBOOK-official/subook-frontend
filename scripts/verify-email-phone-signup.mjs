// 인증 서비스 응답을 모의 처리해 실제 문자/이메일 발송 없이 UI 전체 흐름을 확인한다.
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const env=parseEnv(readFileSync('.env','utf8')),project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:4173';
const output='.codex/phone-rollout';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const id='00000000-0000-0000-0000-000000000911',now=new Date().toISOString();
function session(provider='email'){
 const payload={sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
 const user={id,aud:'authenticated',role:'authenticated',email:provider==='phone'?'':'member@example.invalid',email_confirmed_at:provider==='phone'?null:now,phone:'821012345678',phone_confirmed_at:now,created_at:now,app_metadata:{provider,providers:[provider]},user_metadata:{},identities:provider==='kakao'?[{provider:'kakao',identity_data:{sub:'kakao-fixture'}}]:[]};
 return {access_token:`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:payload.exp,user,...(provider==='kakao'?{provider_token:'fixture-kakao'}:{})};
}
async function setup({provider='email',signedIn=false,duplicatePhone=false,duplicateEmail=false,preMember=false,kakaoMissingPhone=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
 const errors=[],state={signedIn,verified:signedIn&&!preMember,terms:false,emailOtp:0,phoneOtp:0,finished:false,status:null};page.on('pageerror',e=>errors.push(e.message));
 if(signedIn)await context.addInitScript(({key,s})=>sessionStorage.setItem(key,JSON.stringify(s)),{key:`sb-${project}-auth-token`,s:session(provider)});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),body=route.request().postDataJSON()||{};
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname==='/api/auth/signup-phone')return json(body.action==='send'?{success:true,id:'00000000-0000-0000-0000-000000000912',secret:'a'.repeat(64)}:body.code==='123456'?{success:true,status:duplicatePhone?'existing_account':'verified'}:{error:'인증번호가 일치하지 않습니다.'},body.action==='verify'&&body.code!=='123456'?400:200);
  if(u.pathname==='/api/auth/send-phone-otp'){state.phoneOtp++;return json({success:true});}
  if(u.pathname==='/api/auth/kakao-phone'){
   state.status=kakaoMissingPhone?'unverified':duplicatePhone?'existing_account':'verified';state.verified=state.status==='verified';return json({success:true,status:kakaoMissingPhone?'sms_required':state.status});
  }
  if(u.pathname.startsWith('/api/'))return json([]);
  if(u.origin===origin)return route.continue();
  if(!u.hostname.endsWith('.supabase.co'))return route.fulfill({status:204,body:''});
  if(u.pathname.endsWith('/otp')){assert.ok(body.data.signup_phone_id);assert.ok(body.data.signup_phone_secret);state.emailOtp++;return json({});}
  if(u.pathname.endsWith('/verify')){state.signedIn=true;state.verified=true;return json(session());}
  if(u.pathname.endsWith('/user'))return json(session(provider).user);
  const name=u.pathname.split('/').pop();
  if(name==='get_member_identity_policy')return json({enabled:true,email_required:true,phone_signup_enabled:false,legacy_phone_login_enabled:true,merge_enabled:true});
  if(name==='get_my_member_identity')return json({enabled:true,status:state.status||(state.verified?'verified':'unverified'),phone:state.verified?'01012345678':null,can_merge:false,is_legacy_account:false});
  if(name==='get_current_auth_account_role')return json(preMember&&!state.verified?[{account_role:'guest'}]:[{account_role:'member',user_id:id,email:session(provider).user.email,name:'회원',phone:'01012345678',email_verified_at:provider==='phone'?null:now,terms_agreed_at:state.terms?now:null,privacy_agreed_at:state.terms?now:null}]);
  if(name==='verify_phone_otp'){state.status=duplicatePhone?'existing_account':'verified';state.verified=!duplicatePhone;return json({success:true,status:state.status});}
  if(name==='check_member_email_availability')return json(duplicateEmail?{is_available:false,account_role:'member'}:{is_available:true});
  if(name==='is_legacy_sixshop_email'||name==='is_admin_user')return json(false);
  if(name==='complete_oauth_signup'){state.terms=true;state.finished=true;return json({success:true});}
  return json([]);
 });
 return {context,page,state,errors};
}
try{
 const s=await setup();await s.page.goto(origin+'/signup');
 await s.page.getByRole('heading',{name:'회원가입',exact:true}).waitFor();
 assert.equal(await s.page.getByRole('button',{name:'카카오로 시작하기'}).count(),1);
 await s.page.locator('#public-signup-email').fill('member@example.invalid');await s.page.locator('#public-signup-phone').fill('01012345678');
 await s.page.locator('#public-signup-email').blur();
 await s.page.getByRole('button',{name:'이메일 인증코드 받기',exact:true}).waitFor();
 assert.equal(await s.page.getByRole('button',{name:'이메일 인증코드 받기',exact:true}).isDisabled(),true);
 await s.page.screenshot({path:output+'/email-signup-desktop.png',fullPage:true});
 await s.page.setViewportSize({width:390,height:844});await s.page.screenshot({path:output+'/email-signup-mobile.png',fullPage:true});
 assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await s.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();
 await s.page.getByLabel('휴대폰 인증번호',{exact:true}).fill('000000');await s.page.getByRole('button',{name:'확인',exact:true}).click();
 await s.page.getByText('인증번호가 일치하지 않습니다.',{exact:true}).waitFor();assert.equal(s.state.emailOtp,0);
 await s.page.getByLabel('휴대폰 인증번호',{exact:true}).fill('123456');await s.page.getByRole('button',{name:'확인',exact:true}).click();
 await s.page.getByText('휴대폰 인증 완료',{exact:true}).waitFor();
 await s.page.getByRole('button',{name:'이메일 인증코드 받기',exact:true}).click();
 await s.page.locator('#public-signup-verify-code').fill('123456');
 await s.page.getByText('이메일 인증이 완료되었어요. 나머지 정보를 입력해 주세요.',{exact:true}).first().waitFor();
 assert.equal(new URL(s.page.url()).pathname,'/signup');assert.equal(s.state.emailOtp,1);
 await s.page.locator('#public-signup-password').fill('Fixture123!');await s.page.locator('#public-signup-password-confirm').fill('Fixture123!');await s.page.locator('#public-signup-name').fill('테스트회원');
 await s.page.getByRole('checkbox',{name:'약관 전체 동의 (마케팅 정보 수신 포함)',exact:true}).check();
 await s.page.getByRole('button',{name:'가입하기',exact:true}).click();await s.page.waitForURL(origin+'/');assert.equal(s.state.finished,true);assert.deepEqual(s.errors,[]);await s.context.close();
 const recovery=await setup({provider:'phone',signedIn:true});await recovery.page.goto(origin+'/mypage');await recovery.page.waitForURL(/required-email/);
 await recovery.page.getByRole('heading',{name:'이메일을 등록해 주세요'}).waitFor();assert.deepEqual(recovery.errors,[]);await recovery.context.close();
 const duplicateEmail=await setup({duplicateEmail:true});await duplicateEmail.page.goto(origin+'/signup');
 await duplicateEmail.page.locator('#public-signup-email').fill('member@example.invalid');await duplicateEmail.page.locator('#public-signup-email').blur();
 await duplicateEmail.page.getByText('이미 가입된 이메일입니다.',{exact:true}).waitFor();await duplicateEmail.page.getByRole('link',{name:'로그인하기',exact:true}).click();await duplicateEmail.page.waitForURL(/\/login/);assert.equal(duplicateEmail.state.emailOtp,0);await duplicateEmail.context.close();
 const duplicate=await setup({duplicatePhone:true});await duplicate.page.goto(origin+'/signup');
 await duplicate.page.locator('#public-signup-email').fill('member@example.invalid');await duplicate.page.locator('#public-signup-phone').fill('01012345678');
 await duplicate.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();await duplicate.page.getByLabel('휴대폰 인증번호',{exact:true}).fill('123456');await duplicate.page.getByRole('button',{name:'확인',exact:true}).click();
 await duplicate.page.getByRole('heading',{name:'이미 가입한 계정이 있어요'}).waitFor();assert.equal(duplicate.state.emailOtp,0);await duplicate.page.getByRole('link',{name:'기존 계정으로 로그인',exact:true}).click();await duplicate.page.waitForURL(/\/login/);assert.deepEqual(duplicate.errors,[]);await duplicate.context.close();
 const google=await setup({provider:'google',signedIn:true,preMember:true,duplicatePhone:true});await google.page.goto(origin+'/mypage');await google.page.waitForURL(/verify-phone/);
 await google.page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');await google.page.getByRole('button',{name:'인증번호 받기',exact:true}).click();await google.page.getByLabel('인증번호 6자리').fill('123456');await google.page.getByRole('button',{name:'인증하고 계속하기'}).click();
 await google.page.getByRole('heading',{name:'이미 가입한 계정이 있어요'}).waitFor();assert.equal(google.state.phoneOtp,1);assert.equal(google.page.url().includes('/merge'),false);
 await google.page.screenshot({path:output+'/existing-account-desktop.png',fullPage:true});await google.page.setViewportSize({width:390,height:844});await google.page.screenshot({path:output+'/existing-account-mobile.png',fullPage:true});assert.equal(await google.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await google.page.getByRole('button',{name:'기존 계정으로 로그인',exact:true}).click();await google.page.waitForURL(/\/login/);assert.deepEqual(google.errors,[]);await google.context.close();
 for(const [duplicatePhone,kakaoMissingPhone] of [[false,false],[true,false],[false,true]]){
  const kakao=await setup({provider:'kakao',signedIn:true,preMember:true,duplicatePhone,kakaoMissingPhone});await kakao.page.goto(origin+'/auth/callback');
  if(duplicatePhone)await kakao.page.getByRole('heading',{name:'이미 가입한 계정이 있어요'}).waitFor();
  else if(kakaoMissingPhone)await kakao.page.getByLabel('휴대폰 번호',{exact:true}).waitFor();
  else await kakao.page.waitForURL(/oauth-consent/);
  assert.equal(kakao.state.phoneOtp,0);assert.deepEqual(kakao.errors,[]);await kakao.context.close();
 }
 console.log('PASS: email/social signup, duplicate email/phone login guidance, Google SMS duplicate without merge, Kakao verified/duplicate/missing phone, legacy email gate, desktop/mobile. External calls mocked.');
}finally{await browser.close();}
