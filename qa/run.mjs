import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { uploadProductImage } from '../packages/shared-supabase/src/productImageStorage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qa/results');
await mkdir(out, { recursive: true });
const cases = JSON.parse(await readFile(path.join(root, 'qa/cases.json'), 'utf8'));
const results = [], observations = [], startedAt = new Date().toISOString();
const origin = 'http://127.0.0.1:5197';
// 실제 환경 파일보다 우선. 외부 요청도 아래 route에서 차단한다.
process.env.VITE_SUPABASE_PUBLIC_URL = 'https://qa-fixture.supabase.co';
process.env.VITE_SUPABASE_PUBLIC_ANON_KEY = 'fixture-only';
process.env.VITE_SUPABASE_URL = 'https://qa-fixture.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fixture-only';
const server = await createServer({configFile:path.join(root, 'apps/public-web/vite.config.js'),server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'error'});
await server.listen();
let browser, active, fatal;
const now = new Date().toISOString(), uid = '00000000-0000-4000-8000-000000000912';
const user = {id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',email_confirmed_at:now,created_at:now,app_metadata:{provider:'kakao',providers:['kakao']},user_metadata:{name:'테스트 회원'}};
const payload = {sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
const books = [{id:900001,option:'7',price:6000,available_count:1},{id:900002,option:'7',price:6000,available_count:1},{id:900003,option:'10',price:8000,available_count:1},{id:900004,option:'11',price:8000,available_count:0,status:'sold_out'}];
const product = {id:900000,title:'수학 모의고사',brand:'시대인재',subject:'수학',book_type:'모의고사',published_year:2027};

async function setup({identity='verified',hang=false,width=1280,height=900}={}) {
  const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1.5,serviceWorkers:'block'});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page = await context.newPage(), cart = [], errors = [];
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    const json=(body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/api/auth/kakao-phone')return json({success:true,status:'sms_required'});
    if(url.pathname.startsWith('/api/'))return json([]);
    if(url.origin===origin)return route.continue();
    if(url.hostname!=='qa-fixture.supabase.co')return route.fulfill({status:204,body:''});
    const name=url.pathname.split('/').pop();
    if(name==='user')return json(user);
    if(name==='get_member_identity_policy')return json({enabled:true,email_required:true});
    if(hang&&['get_current_auth_account_role','get_my_member_identity'].includes(name))return;
    if(name==='get_my_member_identity')return json({enabled:true,status:identity});
    if(name==='get_current_auth_account_role')return json([{account_role:'member',user_id:uid,email:user.email,name:'테스트 회원',email_verified_at:now,terms_agreed_at:now}]);
    if(name==='get_public_store_product_detail')return json({product,options:books.map(b=>({...product,id:b.id,product_id:900000,condition_grade:'S',status:'on_sale',...b})),related_products:[]});
    if(name==='get_cart_items')return json(cart);
    if(name==='add_to_cart'){
      const body=req.postDataJSON(), b=books.find(x=>x.id===Number(body.p_book_id));
      if(!b)throw new Error('예상 밖의 교재 ID');
      if(!cart.some(x=>x.book_id===b.id))cart.push({id:b.id+100,book_id:b.id,product_id:900000,title:product.title,option_label:b.option,condition_grade:'S',price:b.price,quantity:1,subject:product.subject,brand:product.brand,is_sold_out:false});
      return json({cart_item_id:b.id+100});
    }
    if(name==='get_books_pricing_for_order')return json(books.map(b=>({id:b.id,book_id:b.id,price:b.price,status:b.status||'on_sale',is_public:true})));
    if(name==='get_member_dashboard_summary')return json({});
    return json([]);
  });
  async function auth(next='/store/900000') {
    const hash=new URLSearchParams({access_token:token,refresh_token:'fixture-only',provider_token:'fixture-only',expires_in:'3600',token_type:'bearer',type:'signup'});
    await page.goto(`${origin}/auth/callback?next=${encodeURIComponent(next)}#${hash}`);
  }
  active={context,page,cart,errors,auth}; return active;
}
async function check(id,action) {
  const definition=cases.find(x=>x.id===id), start=Date.now();
  try {
    const actual=await action();
    results.push({...definition,status:'PASS',actual,durationMs:Date.now()-start});
    console.log(`PASS ${id} ${definition.name}`);
  } catch(error) {
    results.push({...definition,status:'FAIL',actual:error.message,durationMs:Date.now()-start});
    throw error;
  }
}
async function shot(name,selector) {
  await active.page.evaluate(()=>document.fonts.ready);
  const target=selector?active.page.locator(selector):active.page;
  await target.screenshot({path:path.join(out,`${name}.png`)});
}
async function finishContext(){await active.context.tracing.stop();await active.context.close();active=null;}

try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const s=await setup(), p=s.page;
  await s.auth(); await p.waitForURL('**/store/900000');
  const picker=p.getByRole('region',{name:'옵션 선택',exact:true});
  const trigger=picker.getByRole('button',{name:'옵션을 선택해 주세요'});
  async function select(name){await trigger.click();await picker.getByRole('option',{name,exact:true}).click();}
  await check('BUY-01',async()=>{
    await trigger.click();assert.equal(await picker.getByRole('option',{name:'11 품절'}).getAttribute('aria-disabled'),'true');await p.keyboard.press('Escape');return '11회 aria-disabled=true';
  });
  await check('BUY-02',async()=>{
    await select('7');await select('7');await select('7');
    assert.equal(await p.getByRole('button',{name:'옵션 7 수량 늘리기',exact:true}).isDisabled(),true);
    assert.equal(await p.locator('.public-detail-hero__summary-total').innerText(),'12,000원');
    return '재고 2권 상한 유지, 증량 비활성, 12000원';
  });
  await check('BUY-03',async()=>{
    await select('10');assert.equal(await p.locator('.public-detail-hero__summary-total').innerText(),'20,000원');
    await shot('purchase-detail','.public-detail-hero__info');
    await p.getByRole('button',{name:'장바구니 담기',exact:true}).click();
    await p.waitForFunction(()=>document.body.innerText.includes('장바구니에'));
    assert.deepEqual(s.cart.map(x=>x.book_id).sort(),[900001,900002,900003]);
    return {bookIds:s.cart.map(x=>x.book_id),count:3};
  });
  await check('BUY-04',async()=>{
    await p.goto(origin+'/cart');await p.locator('.cart-item').first().waitFor();
    assert.equal(await p.locator('.cart-item').count(),2);
    assert.equal((await p.locator('.cart-item__qty-value').allTextContents()).map(t=>t.trim()).sort().join(','),'1,2');
    await p.setViewportSize({width:480,height:900});await shot('purchase-cart-mobile','.cart-content');
    await p.setViewportSize({width:1280,height:900});
    await p.locator('.cart-summary__order-btn').click();await p.waitForURL('**/order');await p.locator('.order-item').first().waitFor();
    assert.equal(await p.locator('.order-item').count(),3);
    assert.equal((await p.locator('.order-item__meta').allTextContents()).filter(t=>t.includes('7')).length,2);
    for(const [label,amount] of [['상품금액','20,000원'],['배송비','3,000원'],['총 결제금액','23,000원']]) {
      const row=p.locator('.order-sidebar__row').filter({has:p.getByText(label,{exact:true})});
      assert.equal(await row.locator('span').last().innerText(),amount,`주문서 ${label} 불일치`);
    }
    await p.getByRole('heading',{name:'결제 수단',exact:true}).locator('..').screenshot({path:path.join(out,'payment-method.png')});
    await p.setViewportSize({width:480,height:900});await shot('purchase-order-items','.order-items');
    assert.deepEqual(s.errors,[]);
    return {cartGroups:2,orderItems:3,subtotal:20000,shipping:3000,total:23000};
  });
  await finishContext();
  await check('AUTH-01',async()=>{
    const h=await setup({hang:true,width:480,height:760});await h.auth('/faq');
    await h.page.getByRole('link',{name:'로그인 화면으로 돌아가기'}).waitFor({timeout:12000});await shot('login-loading');
    await h.page.waitForURL('**/login',{timeout:40000});
    await h.page.getByText('로그인 정보를 확인하지 못했어요. 잠시 후 다시 로그인해 주세요.',{exact:true}).waitFor();
    assert.equal(await h.page.evaluate(()=>history.state.usr.from),'/faq');await shot('login-retry');
    await finishContext();return '무응답 대기 종료, 재로그인 안내, /faq 보존';
  });
  await check('AUTH-02',async()=>{
    const h=await setup({identity:'unverified',width:480,height:760});await h.auth('/faq');
    await h.page.waitForURL(url=>url.pathname==='/auth/verify-phone');await shot('login-verify');await finishContext();return '/auth/verify-phone';
  });
  await check('AUTH-03',async()=>{
    const h=await setup({width:480,height:760});await h.auth('/faq');await h.page.waitForURL(url=>url.pathname==='/faq');await finishContext();return '/faq';
  });
  const helper=await readFile(path.join(root,'apps/admin-web/src/lib/adminImageUpload.js'),'utf8');
  const source=helper.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  for(const [index,size] of [15*1024*1024-1,15*1024*1024,15*1024*1024+1].entries()) {
    await check(`IMG-0${index+1}`,async()=>{
      let uploads=0,variants=0,errorMessage=null;
      const context=vm.createContext({uploadProductImage,createImageVariants:async()=>{variants++;return [400,900,1600].map(width=>({width,blob:{size:100,type:'image/jpeg'}}));},supabase:{storage:{from:()=>({upload:async()=>{uploads++;return {error:null};},getPublicUrl:()=>({data:{publicUrl:'https://storage.test/image'}}),remove:async()=>({error:null})})}}});
      vm.runInContext(source,context);
      try{await context.uploadImageToBucket('inspection-images',{name:'boundary.png',type:'image/png',size},'boundary');}catch(e){errorMessage=e.message;}
      if(index<2){assert.equal(errorMessage,null);assert.equal(variants,1);assert.equal(uploads,4);}
      else{assert.match(errorMessage,/15MB/);assert.equal(variants,0);assert.equal(uploads,0);
        if(errorMessage.includes('(15.0MB)'))observations.push({id:'BR-IMG-001',status:'OPEN',severity:'Minor',priority:'P3 proposed',type:'UX improvement',message:errorMessage,bytes:size});}
      return {bytes:size,result:errorMessage?'reject':'allow',variantCalls:variants,storageCalls:uploads,errorMessage};
    });
  }
} catch(error) {
  fatal=error;
  if(active){await active.page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await active.context.tracing.stop({path:path.join(out,'failure-trace.zip')}).catch(()=>{});}
} finally {
  await browser?.close();await server.close();
  for(const c of cases)if(!results.some(r=>r.id===c.id))results.push({...c,status:'BLOCKED',actual:'선행 실행 실패'});
  const report={startedAt,finishedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),platform:process.platform,node:process.version,browser:process.env.PLAYWRIGHT_CHANNEL||'chromium',scope:'Actual UI and upload helper; authentication/catalog/cart/API responses and image conversion/storage replaced with fixtures. No production writes or payment authorization.',results,observations};
  await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
  const esc=s=>String(typeof s==='string'?s:JSON.stringify(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  await writeFile(path.join(out,'report.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>수북 QA 실행 결과</title><style>body{font:16px Arial,sans-serif;margin:48px;color:#202124}h1{font-size:32px}table{border-collapse:collapse;width:100%}td,th{padding:14px;border-bottom:1px solid #ccc;text-align:left}th{background:#f9f4dc}td:first-child{white-space:nowrap}pre{white-space:pre-wrap}p{line-height:1.7}</style><h1>수북 QA 실행 결과</h1><p>${esc(report.finishedAt)} · ${esc(report.commit.slice(0,12))}<br>로컬 UI · 테스트 응답 · 업로드 함수 · ${esc(report.platform)} / ${esc(report.browser)}</p><table><tr><th>TC</th><th>항목</th><th>기대 결과</th><th>상태</th></tr>${results.map(r=>`<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${esc(r.expected)}</td><td>${r.status}</td></tr>`).join('')}</table><h2>별도 관찰</h2><pre>${esc(observations)}</pre><p>PG 승인·운영 DB·실제 저장소 전송·실기기 검증은 이 실행의 범위 밖.</p></html>`);
  console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,total:cases.length,observations:observations.length,output:out}));
}
if(fatal)throw fatal;
