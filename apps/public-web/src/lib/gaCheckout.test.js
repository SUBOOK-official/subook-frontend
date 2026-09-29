import test from 'node:test';
import assert from 'node:assert/strict';
import { readGaCheckoutContext } from './gaCheckout.js';
test('실제 태그가 준 식별자만 저장하고 차단·로컬·시간초과에는 새 ID를 만들지 않는다',async()=>{
  const window={location:{origin:'https://subook.kr',search:''},navigator:{},localStorage:{getItem:()=>null},gtag:(cmd,id,field,cb)=>cb(field==='client_id'?'123.456':12345)};
  assert.deepEqual(await readGaCheckoutContext({window}),{clientId:'123.456',sessionId:'12345',experimentVariant:null});
  window.navigator.globalPrivacyControl=true;
  assert.equal(await readGaCheckoutContext({window}),null);
  window.navigator.globalPrivacyControl=false; window.location.origin='http://localhost:5173';
  assert.equal(await readGaCheckoutContext({window}),null);
  window.location.origin='https://subook.kr'; window.gtag=()=>{};
  assert.equal(await readGaCheckoutContext({window,timeoutMs:2}),null);
});
