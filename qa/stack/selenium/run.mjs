import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Builder,By,Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { beginRun,endRun } from '../support.mjs';
import { startApiServer } from '../api-server.mjs';
import { startUiServer,authPath } from './fixture.mjs';
import { Page,ProductPage,OrderPage,B2bPage } from './pages.mjs';

const cases=[
  ['SEL-01','품절 옵션 선택 차단','상품 상세 → 옵션 11 펼침','aria-disabled=true'],
  ['SEL-02','같은 옵션의 재고 상한','옵션 7을 세 번 선택','2권·12000원, 증량 비활성'],
  ['SEL-03','선택 교재와 장바구니 일치','7 두 권 + 10 한 권 → 장바구니','book id 900001/900002/900003'],
  ['SEL-04','주문서 수량과 결제금액','장바구니 → 주문서','3권, 상품20000·배송3000·총23000'],
  ['SEL-05','모바일 폭에서 옵션 목록 접근','480px 화면 → 옵션 펼침','목록이 화면 안에서 표시되고 선택 가능'],
  ['SEL-06','인증 완료 회원 목적지 복귀','합성 로그인 callback → /faq','/faq 도착'],
  ['SEL-07','미인증 회원 인증 화면 이동','휴대폰 unverified → /faq','/auth/verify-phone 도착'],
  ['SEL-08','회원 조회 무응답 복구','인증 RPC 무응답 → 최대 대기','/login 안내 + /faq 목적지 보존'],
  ['SEL-09','B2B 실제 핸들러 문의 접수','필수 입력·동의 → 문의하기','접수 완료 및 접수번호, HTTP200'],
  ['SEL-10','B2B 개인정보 미동의 차단','필수 입력·동의 제외 → 문의하기','브라우저 검증 차단, API 호출0'],
].map(([id,name,steps,expected])=>({id,name,steps,expected,priority:id==='SEL-04'?'P0':'P1',precondition:'합성 회원·교재, 독립 Chrome 세션'}));
const run=await beginRun('selenium',['apps/public-web/src/pages/PublicProductDetailPage.jsx','apps/public-web/src/pages/PublicOrderPage.jsx','apps/public-web/src/pages/PublicB2bPage.jsx']);
let api,ui;
try{
  api=await startApiServer();ui=await startUiServer(api.origin);
  for(const c of cases){
    let driver;const start=Date.now();
    ui.reset({identity:c.id==='SEL-07'?'unverified':'verified',hang:c.id==='SEL-08'});
    try{
      const options=new chrome.Options().addArguments('--headless=new','--window-size=1280,1000','--disable-dev-shm-usage',
        '--disable-background-networking','--proxy-server=http://127.0.0.1:1');
      if(process.env.CHROME_BINARY)options.setChromeBinaryPath(process.env.CHROME_BINARY);
      driver=await new Builder().forBrowser('chrome').setChromeOptions(options).build();
      const cap=await driver.getCapabilities();run.browser={name:cap.get('browserName'),version:cap.get('browserVersion')};
      await driver.manage().setTimeouts({implicit:0,pageLoad:30000,script:15000});
      const page=new Page(driver,ui.origin),product=new ProductPage(driver,ui.origin);
      if(c.id==='SEL-05')await driver.manage().window().setRect({width:480,height:900});
      if(['SEL-09','SEL-10'].includes(c.id)){
        const b2b=new B2bPage(driver,ui.origin);await b2b.open('/b2b');await b2b.fill();
        if(c.id==='SEL-09')await b2b.click('[name="privacyConsent"]');
        await b2b.click('.public-b2b__submit');
        if(c.id==='SEL-09'){
          await driver.wait(async()=>(await driver.findElement(By.css('body')).getText()).includes('접수 완료'),15000);
          assert.match(await b2b.text('[role="status"]'),/B2B-\d{8}-[0-9A-F]{6}/);
          assert.equal(ui.state.calls.filter(x=>x.name==='b2b-inquiry'&&x.status===200).length,1);
        }else{
          assert.equal(await driver.executeScript('return document.querySelector("[name=privacyConsent]").validity.valueMissing'),true);
          assert.equal(ui.state.calls.filter(x=>x.name==='b2b-inquiry').length,0);
        }
      }else if(['SEL-06','SEL-07','SEL-08'].includes(c.id)){
        await page.open(authPath('/faq'));
        await page.path(c.id==='SEL-06'?'/faq':c.id==='SEL-07'?'/auth/verify-phone':'/login',40000);
        if(c.id==='SEL-08'){
          await driver.wait(async()=>(await page.text('body')).includes('로그인 정보를 확인하지 못했어요'),10000);
          assert.equal(await driver.executeScript('return history.state.usr.from'),'/faq');
        }
      }else{
        await page.open(authPath());await page.path('/store/900000');
        if(c.id==='SEL-01'){
          await product.showOptions();const sold=await driver.findElement(By.xpath("//*[@role='option' and contains(.,'11') and contains(.,'품절')]"));assert.equal(await sold.getAttribute('aria-disabled'),'true');
        }else if(c.id==='SEL-05'){
          await product.showOptions();const list=await product.element('[role="listbox"]');
          const rect=await driver.executeScript('const r=arguments[0].getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight}',list);
          assert.ok(rect.left>=0&&rect.right<=rect.w&&rect.top>=0&&rect.bottom<=rect.h,JSON.stringify(rect));
          await driver.actions().sendKeys(Key.ESCAPE).perform();await product.option('10');assert.equal(await product.text('.public-detail-hero__summary-total'),'8,000원');
        }else{
          await product.option('7');await product.option('7');
          if(c.id==='SEL-02'){
            await product.option('7');assert.equal(await product.text('.public-detail-hero__summary-total'),'12,000원');
            assert.equal(await (await product.element('[aria-label="옵션 7 수량 늘리기"]')).isEnabled(),false);
          }else{
            await product.option('10');await product.addToCart();assert.deepEqual(ui.state.cart.map(x=>x.book_id).sort(),[900001,900002,900003]);
            if(c.id==='SEL-04'){
              await page.open('/cart');await page.element('.cart-item');assert.equal((await driver.findElements(By.css('.cart-item'))).length,2);
              await page.click('.cart-summary__order-btn');await page.path('/order');await page.element('.order-item');
              assert.equal((await driver.findElements(By.css('.order-item'))).length,3);
              const order=new OrderPage(driver,ui.origin);
              for(const [label,amount] of [['상품금액','20,000원'],['배송비','3,000원'],['총 결제금액','23,000원']])assert.equal(await order.amount(label),amount);
            }
          }
        }
      }
      assert.deepEqual([...new Set(ui.state.unexpected)],[],'정의되지 않은 fixture 요청');
      await writeFile(path.join(run.directory,c.id+'.png'),Buffer.from(await driver.takeScreenshot(),'base64'));
      run.results.push({...c,status:'PASS',actual:c.expected,durationMs:Date.now()-start});console.log(`PASS ${c.id} ${c.name}`);
    }catch(error){
      if(driver)await writeFile(path.join(run.directory,c.id+'-failure.png'),Buffer.from(await driver.takeScreenshot(),'base64')).catch(()=>{});
      run.results.push({...c,status:'FAIL',actual:error.stack,durationMs:Date.now()-start});console.error(`FAIL ${c.id}: ${error.message}`);
    }finally{
      if(driver)await driver.quit();
      await writeFile(path.join(run.directory,c.id+'-calls.json'),JSON.stringify(ui.state,null,2));
    }
  }
}catch(error){run.results.push({id:'SEL-RUNNER',name:'Selenium 실행 환경',status:'FAIL',actual:error.stack});}
finally{if(ui)await ui.close();if(api)await api.close();await endRun(run,{scope:'실제 React UI + 합성 Supabase 응답. B2B는 실제 서버 핸들러 경유. Chrome 데스크톱 및 480px 창; 실기기·OAuth 제공자·운영 DB 제외.'});}
if(run.summary.failed||run.summary.blocked)process.exitCode=1;
