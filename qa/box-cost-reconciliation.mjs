import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='http://127.0.0.1:5196';
process.env.VITE_SUPABASE_ADMIN_URL='https://box-cost-fixture.supabase.co';
process.env.VITE_SUPABASE_ADMIN_ANON_KEY='fixture-only';
const server=await createServer({configFile:path.join(root,'apps/admin-web/vite.config.js'),logLevel:'error',
  server:{host:'127.0.0.1',port:5196,strictPort:true},plugins:[{
    name:'box-cost-fixture-entry',
    configureServer(s){s.middlewares.use(async (req,res,next)=>{
      if(!req.url?.startsWith('/__box_cost'))return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<div id="root"></div><script type="module" src="/@id/virtual:box-cost"></script>'));
    });},
    resolveId(id){if(id==='virtual:box-cost')return id;},
    load(id){if(id==='virtual:box-cost')return `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
      import Shipment from '/src/pages/AdminShipmentDetailPage.jsx';import Settlements from '/src/pages/AdminSettlementsPage.jsx';import '/src/index.css';
      const view=new URLSearchParams(location.search).get('view');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[view==='shipment'?'/admin/shipments/74':'/admin/settlements']},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/shipments/:shipmentId',element:React.createElement(Shipment)}),React.createElement(Route,{path:'/admin/settlements',element:React.createElement(Settlements)}))));`;},
  }]});
let browser;
const shipment={id:74,seller_name:'테스트 셀러',seller_phone:'01000000000',status:'inspected',box_count:2,box_cost_charged:10000,pickup_date:'2026-09-09'};
const adjustment={id:999,shipment_id:74,seller_user_id:'fixture-seller',seller_name:'테스트 셀러',seller_phone:'01000000000',sale_source:'box_cost_adjustment',book_title:'상품화 비용 조정 (추가 지급)',sale_amount:0,fee_percent:0,fee_amount:0,box_cost_deducted:-5000,net_amount:5000,status:'pending',scheduled_date:'2026-11-02',bank_name:'테스트은행',account_number:'12345678',account_holder:'테스트 셀러'};
const writes=[];const errors=[];
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1100},serviceWorkers:'block'});
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(url.origin===origin)return route.continue();
    if(url.hostname!=='box-cost-fixture.supabase.co')return route.fulfill({status:204,body:''});
    const name=url.pathname.split('/').pop();
    if(name==='shipments')return json(shipment);
    if(name==='admin_update_shipment_box_count'){
      writes.push({name,body:request.postDataJSON()});shipment.box_count=1;shipment.box_cost_charged=5000;
      return json({...shipment,additional_pending_amount:5000});
    }
    if(name==='list_admin_settlements'){
      const visible=request.postDataJSON().p_statuses.includes(adjustment.status);
      return json({rows:visible?[adjustment]:[],total_count:visible?1:0});
    }
    if(name==='admin_get_jeonil_settlements')return json({payable:[],waiting:[],completed:[],fee_percent:50});
    if(name==='admin_complete_settlement_payouts'){
      writes.push({name,body:request.postDataJSON()});adjustment.status='completed';adjustment.completed_at=new Date().toISOString();
      return json({updated_count:1,completed_count:1,settlements:[]}); // 알림 API는 테스트하지 않는다.
    }
    return json([]);
  });
  await page.goto(origin+'/__box_cost?view=shipment',{waitUntil:'domcontentloaded'});
  await page.getByText('실제 박스 수 (상품화 비용)',{exact:true}).waitFor();
  await page.getByText('실제 박스 수 (상품화 비용)',{exact:true}).locator('..').locator('input').fill('1');
  await page.getByRole('button',{name:'저장',exact:true}).click();
  await page.getByText(/추가 지급 대기 5,000원은 정산 메뉴/).waitFor();
  assert.deepEqual(writes[0].body,{p_shipment_id:74,p_box_count:1,p_expected_box_count:2});
  await page.goto(origin+'/__box_cost?view=settlements',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'테스트 셀러 정산 상세',exact:true}).click();
  await page.getByText('상품화 비용 조정 (추가 지급)',{exact:true}).waitFor();
  await mkdir(path.join(root,'qa/results/box-cost'),{recursive:true});
  await page.screenshot({path:path.join(root,'qa/results/box-cost/additional-payout.png'),fullPage:true});
  await page.getByRole('button',{name:'지급 완료 처리',exact:true}).click();
  await page.getByPlaceholder('예) 10/1 은행 이체 완료 · 이체번호').fill('테스트 입금 확인');
  await page.getByRole('button',{name:'지급 완료 처리',exact:true}).click();
  await page.getByText('미지급 정산이 없습니다.',{exact:true}).waitFor();
  assert.deepEqual(writes[1].body,{p_rows:[{id:999,net_amount:5000}],p_transfer_reference:'테스트 입금 확인'});
  assert.deepEqual(errors,[]);
  console.log('PASS: browser box save → adjustment notice → payout list/detail → confirmed amount RPC → pending cleared; external requests mocked.');
}catch(e){console.error(JSON.stringify({message:e.message,errors}));process.exitCode=1;}finally{await browser?.close();await server.close();}
