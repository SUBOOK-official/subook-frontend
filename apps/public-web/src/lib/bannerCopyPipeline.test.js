import test from "node:test";
import assert from "node:assert/strict";
import { createBannerCopyHandler } from "../../api/banner-copy.js";
import { generateBannerCopy, bannerCopySource } from "../../../../packages/shared-domain/src/bannerCopyGeneration.js";
import { fetchBannerCopies, bannerCopyMap } from "./bannerCopies.js";
import { buildAutomaticBookBanners } from "./automaticBookBanners.js";

const env = { SUPABASE_URL: "https://example.test", VITE_SUPABASE_PUBLIC_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", GEMINI_API_KEY: "ai", CRON_SECRET: "cron" };
async function request(handler, query = {}, headers = {}, method = "GET") {
  const res = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
  await handler({ method, query, headers }, res);
  return res;
}
test("public reads need no AI/service key and unauthorized generation never touches storage", async () => {
  let reads=0;
  const handler = createBannerCopyHandler({ env: { ...env, GEMINI_API_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    createStore: ({key}) => { assert.equal(key,"anon"); return { read: async () => { reads++; return [{ product_id:1,copy:"국어 실전의 흐름" }]; } }; },
    generate: () => assert.fail("public read must never generate"),
  });
  assert.equal((await request(handler,{refresh:"1"})).statusCode,401);
  assert.equal((await request(handler,{}, {},"POST")).statusCode,405);
  const result=await request(handler);
  assert.equal(result.statusCode,200);
  assert.deepEqual(Object.keys(result.body),["copies"]);
  assert.equal(reads,1);
});
test("generation caps sources/concurrency, skips cached records, isolates failures and releases lease", async () => {
  let active=0,maxActive=0; const finished=[], released=[], claimed=[];
  const store = {
    sources: async () => Array.from({length:20},(_,i)=>({id:i+1,source_hash:"hash"})),
    claim: async (p) => { claimed.push(p.id); return p.id!==1; },
    finish: async (p) => { finished.push(p.id); return p.id!==3; },
    release: async (p) => { released.push(p.id); },
  };
  const handler=createBannerCopyHandler({env,createStore:()=>store,generate:async(p)=>{
    active++; maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,2)); active--;
    if(p.id===2) throw Error("private provider details");
    return "교재의 핵심을 짧게";
  }});
  const result=await request(handler,{refresh:"1"},{authorization:"Bearer cron"});
  assert.equal(result.statusCode,502);
  assert.deepEqual(result.body,{generated:10,failed:1,skipped:2});
  assert.equal(claimed.length,13); assert.ok(maxActive<=3); assert.deepEqual(released,[2]);
  assert.ok(!JSON.stringify(result.body).includes("private")); assert.equal(finished.length,11);
});
test("Gemini retries transient failures, validates output and never retries bad credentials", async () => {
  let calls=0;
  const complete=(text)=>({ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{thought:true,text:"hidden reasoning"},{text}]}}]})});
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body); assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,"LOW"); assert.ok(options.signal);
    calls++; return calls===1 ? {ok:false,status:429} : complete("핵심 개념을 탄탄하게");
  };
  assert.equal(await generateBannerCopy({title:"교재"},{apiKey:"key",fetchImpl,retryDelayMs:0}),"핵심 개념을 탄탄하게");
  assert.equal(calls,2);
  calls=0;
  await assert.rejects(generateBannerCopy({}, {apiKey:"key",retryDelayMs:0,fetchImpl:async()=>{calls++;return{ok:false,status:401};}}),/401/);
  assert.equal(calls,1);
  await assert.rejects(generateBannerCopy({}, {apiKey:"key",retryDelayMs:0,fetchImpl:async()=>complete("가".repeat(21))}),/INVALID/);
  assert.ok(!bannerCopySource({ai_summary:"<b>설명</b>",seller_name:"private"}).includes("private"));
});
test("stored copy wins without changing order; failed reads and invalid text preserve fallback", async () => {
  const products=[{id:2371},{id:99}];
  const copies=bannerCopyMap([{product_id:2371,copy:"기출로 익히는 실전 감각"},{product_id:99,copy:"가".repeat(21)}]);
  const slides=buildAutomaticBookBanners(products,13,copies);
  assert.deepEqual(slides.map(p=>p.productId),[2371,99]);
  assert.equal(slides[0].summary,"기출로 익히는 실전 감각");
  assert.equal(slides[1].summary,"다음 공부를 함께할 한 권");
  let count=0;
  assert.deepEqual(await fetchBannerCopies({fetchImpl:async(path)=>{assert.equal(path,"/api/banner-copy");count++;throw Error();}}),[]);
  assert.equal(count,2);
});
