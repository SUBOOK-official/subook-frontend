import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, copyFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qaRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name)=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const day=option('--date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
assert.match(day,/^\d{4}-\d{2}-\d{2}$/);
const out=path.join(qaRoot,'evidence',day);
const e=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=async(f)=>JSON.parse(await readFile(f,'utf8'));
const sha=(b)=>createHash('sha256').update(b).digest('hex');
async function files(dir){const all=[];for(const d of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())all.push(...await files(p));else if(d.isFile())all.push(p);}return all.sort();}
async function manifest(){
 const items=[];
 for(const f of await files(out)){if(path.basename(f)==='manifest.json')continue;const b=await readFile(f);items.push({path:path.relative(out,f).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}
 await writeFile(path.join(out,'manifest.json'),JSON.stringify({algorithm:'SHA-256',createdAt:new Date().toISOString(),files:items},null,2)+'\n');
 console.log(JSON.stringify({output:out,files:items.length,bytes:items.reduce((n,x)=>n+x.bytes,0)}));
}
if(process.argv.includes('--manifest')){await manifest();process.exit(0);}
await mkdir(out,{recursive:true});
const runs={};
const sources=[];
for(const tool of ['selenium','postman','jmeter']){
 const latest=await json(path.join(qaRoot,'results','stack',tool,'latest.json'));
 const summary=await json(path.join(latest.directory,'summary.json'));
 assert.equal(summary.tool,tool);assert.ok(summary.finishedAt);
 const target=path.join(out,'local',tool);
 await cp(latest.directory,target,{recursive:true});
 runs[tool]=summary;
 for(const f of await files(latest.directory)){
  const relative=path.relative(latest.directory,f);const b=await readFile(f);
  assert.equal(sha(b),sha(await readFile(path.join(target,relative))));
  sources.push({path:'local/'+tool+'/'+relative.replaceAll('\\','/'),source:f,sha256:sha(b)});
 }
}
const ciId=option('--ci-run');let ci=null,artifacts=null;
if(ciId){
 assert.match(ciId,/^\d+$/);
 const gh=(args)=>execFileSync('gh',args,{encoding:'utf8',maxBuffer:30*1024*1024,windowsHide:true});
 ci=JSON.parse(gh(['run','view',ciId,'--repo','SUBOOK-official/subook-frontend','--json','status,conclusion,headSha,jobs,url,createdAt,updatedAt']));
 artifacts=JSON.parse(gh(['api','repos/SUBOOK-official/subook-frontend/actions/runs/'+ciId+'/artifacts']));
 await writeFile(path.join(out,'ci-run.json'),JSON.stringify(ci,null,2)+'\n');
 await writeFile(path.join(out,'ci-artifacts.json'),JSON.stringify(artifacts,null,2)+'\n');
 const job=ci.jobs.find(x=>x.name==='stack-regression');
 if(job?.status==='completed')await writeFile(path.join(out,'ci-stack-job.log'),gh(['run','view',ciId,'--repo','SUBOOK-official/subook-frontend','--job',String(job.databaseId),'--log']));
}
await mkdir(path.join(out,'test-source'),{recursive:true});
await cp(path.join(qaRoot,'stack'),path.join(out,'test-source','stack'),{recursive:true});
for(const name of ['package.json','package-lock.json'])await copyFile(path.join(qaRoot,name),path.join(out,'test-source',name));
await mkdir(path.join(out,'documents'),{recursive:true});
for(const name of ['README.md','TEST_CASES.md','BUG_REPORTS.md','RELEASE_REPORT.md','RUN_EVIDENCE.md','EVIDENCE_GUIDE.md','scenario-cases.json']){
 let body=await readFile(path.join(qaRoot,'portfolio',name),'utf8');
 if(name.endsWith('.md')){
  body=body.replaceAll('../stack/','../test-source/stack/').replaceAll('../evidence/2026-10-24/index.html','../index.html');
  for(const [tool,run] of Object.entries(runs))body=body.replaceAll('../results/stack/'+tool+'/'+run.id,'../local/'+tool);
 }
 await writeFile(path.join(out,'documents',name),body);
}
const metadata={title:'수북 QA 실행 증빙',owner:'진성욱',assembledAt:new Date().toISOString(),date:day,runs,ci,artifacts};
await writeFile(path.join(out,'evidence-data.json'),JSON.stringify(metadata,null,2)+'\n');
await writeFile(path.join(out,'source-index.json'),JSON.stringify(sources,null,2)+'\n');
const kst=s=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
const screenshotFiles=(await files(path.join(out,'local','selenium'))).filter(f=>f.endsWith('.png'));
const gallery=runs.selenium.results.map(r=>{
 const img=screenshotFiles.find(f=>path.basename(f).startsWith(r.id));
 assert.ok(img,'Missing screenshot '+r.id);
 const href=path.relative(out,img).replaceAll('\\','/');
 return '<article class="shot"><div><span class="badge">'+e(r.status)+'</span><h3>'+e(r.id)+' · '+e(r.name)+'</h3><p>'+e(r.steps)+'</p><p><b>확인:</b> '+e(r.actual)+'</p></div><a href="'+e(href)+'"><img loading="lazy" src="'+e(href)+'" alt="'+e(r.id+' '+r.name)+'"></a><footer><a href="'+e(href)+'" download>원본 PNG</a> · '+r.durationMs+'ms</footer></article>';
}).join('');
const loadRows=runs.jmeter.results.filter(r=>r.profile).map(r=>'<tr><td>'+e(r.id)+'</td><td>'+r.profile.threads+'</td><td>'+r.actual.samples+'</td><td>'+r.actual.p95Ms+'ms</td><td>'+r.actual.errorPercent+'%</td><td>'+r.actual.rps+'</td></tr>').join('');
const ciJob=ci?.jobs.find(j=>j.name==='stack-regression');
const ciDescription=ci?.jobs.map(job=>job.name+': '+(job.conclusion||job.status)).join(' · ');
const stats=[['Selenium',runs.selenium.summary.passed+'/'+runs.selenium.summary.total,'화면 검사'],['Postman',runs.postman.summary.passed+'/'+runs.postman.summary.total,'API 요청'],['Assertions',runs.postman.assertions.total,'검증문'],['JMeter',runs.jmeter.summary.passed+'/'+runs.jmeter.summary.total,'부하 프로파일']];
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수북 QA 실행 증빙 | 진성욱</title><style>'+
'*{box-sizing:border-box}body{margin:0;background:#f1f4f7;color:#152c42;font:15px/1.65 system-ui,"Malgun Gothic",sans-serif}header.hero{padding:54px max(24px,calc((100vw - 1180px)/2));background:#142e46;color:white}h1{font-size:38px;margin:8px 0 12px}h2{font-size:26px;margin-top:0}h3{margin:10px 0}p{margin:8px 0}a{color:#096b82;text-underline-offset:3px}.hero a{color:#a6ebdf}.kicker{font-size:12px;letter-spacing:2px;color:#90e0c7}main{max-width:1220px;margin:auto;padding:28px 20px 70px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:26px}.stat,section,.shot{background:white;border:1px solid #dbe3ea;border-radius:8px}.stat{padding:18px}.stat strong{font-size:32px;display:block}.stat small{color:#577086}section{padding:26px;margin:26px 0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.shot{overflow:hidden}.shot>div,.shot footer{padding:16px 20px}.shot img{display:block;width:100%;height:340px;object-fit:contain;background:#e9eef2;border-block:1px solid #dbe3ea}.badge{background:#e1f3eb;color:#077157;padding:3px 8px;border-radius:4px;font-size:12px;float:right}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #dbe3ea}th{background:#f1f5f8}.scope{border-left:4px solid #14957d;padding:10px 16px;background:#eaf7f2}.links{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}code{font:12px/1.6 Consolas,monospace;overflow-wrap:anywhere}.muted{color:#577086;font-size:13px}@media(max-width:760px){.stats,.grid{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}section{padding:16px}h1{font-size:30px}table{font-size:12px}td,th{padding:8px}.shot img{height:auto}}</style></head><body>'+
'<header class="hero"><div class="kicker">SUBOOK / TEST EXECUTION EVIDENCE</div><h1>수북 QA 실행 증빙</h1><p>진성욱 · Selenium / Postman / JMeter</p><p>'+e(kst(runs.selenium.startedAt))+' 실행 결과</p><a href="execution-evidence.pdf">PDF 보고서</a> · <a href="manifest.json">파일 무결성 목록</a> · <a href="source-index.json">원본 위치·해시</a></header><main>'+
'<div class="stats">'+stats.map(s=>'<article class="stat">'+e(s[0])+'<strong>'+e(s[1])+'</strong><small>'+e(s[2])+'</small></article>').join('')+'</div>'+
'<section><h2>실행 환경과 확인 범위</h2><p>'+e(runs.selenium.environment.os)+' / '+e(runs.selenium.environment.cpu)+' / Node '+e(runs.selenium.environment.node)+' / Chrome '+e(runs.selenium.browser.version)+'</p><div class="scope">'+e(runs.selenium.scope)+'<br>'+e(runs.jmeter.scope)+'</div><p class="muted">로컬 실행 커밋 '+e(runs.selenium.commit)+' 및 당시 미커밋 파일 해시는 각 summary.json에 보관했다. 아래 PNG는 Selenium이 저장한 원본이다.</p></section>'+
'<section><h2>01 / 화면 자동화</h2><p>검사별 조작, 판정, 화면을 연결했다. 이미지를 누르면 원본 해상도로 열린다.</p><div class="links"><a href="local/selenium/summary.json">Selenium summary</a><a href="local/selenium/report.html">실행 리포트</a></div><div class="grid">'+gallery+'</div></section>'+
'<section><h2>02 / API 검증</h2><p>'+runs.postman.summary.total+' 요청, '+runs.postman.assertions.total+' assertions. 상태 코드·응답 본문·후속 호출·재시도·보상 처리 순서를 검증했다.</p><div class="links"><a href="report-screenshots/newman-report.png">API 보고서 캡처</a><a href="local/postman/newman.json">Newman 원본 JSON</a><a href="local/postman/junit.xml">JUnit XML</a><a href="local/postman/upstream-evidence.json">외부 호출 원문</a><a href="local/postman/report.html">API 리포트</a><a href="test-source/stack/postman/subook.postman_collection.json">Postman Collection</a></div><p class="scope">'+e(runs.postman.scope)+'</p></section>'+
'<section><h2>03 / 부하 검증</h2><table><thead><tr><th>프로파일</th><th>VU</th><th>표본</th><th>p95</th><th>오류율</th><th>req/s</th></tr></thead><tbody>'+loadRows+'</tbody></table><p class="muted">표는 워밍업 제외 결과다. JMeter HTML Dashboard는 전체 실행 구간을 집계한다.</p><div class="links">'+['smoke','baseline','peak'].map(p=>'<a href="local/jmeter/'+p+'.jtl">'+p+' JTL</a><a href="local/jmeter/'+p+'-dashboard/index.html">'+p+' Dashboard</a>').join('')+'<a href="report-screenshots/jmeter-dashboard.png">JMeter 보고서 캡처</a><a href="test-source/stack/jmeter/subook-local.jmx">JMX 시험 계획</a></div></section>'+
'<section><h2>04 / CI 실행 기록</h2>'+(ci?'<p><b>stack-regression: '+e(ciJob?.conclusion)+'</b> · 전체 workflow: '+e(ci.conclusion)+'</p><p>커밋 <code>'+e(ci.headSha)+'</code></p><p class="muted">'+e(ciDescription)+'</p><div class="links"><a href="'+e(ciJob?.url)+'">GitHub 작업 기록</a><a href="ci-run.json">CI 메타데이터</a><a href="ci-stack-job.log">원본 작업 로그</a><a href="ci-artifacts.json">Artifact 정보</a></div>':'<p>CI 기록 미포함</p>')+'</section>'+
'<section><h2>05 / 첨부 자료</h2><p>documents: TC와 버그 리포트 · test-source: Selenium 소스, Postman Collection, JMeter JMX · local: 도구별 실행 원문 · ci-artifacts: GitHub에서 내려받은 결과</p><p>manifest.json은 각 파일의 SHA-256과 크기를 기록한다. source-index.json으로 로컬 실행 원본과 복사본의 일치를 확인할 수 있다.</p></section></main></body></html>';
await writeFile(path.join(out,'index.html'),html);
await manifest();
