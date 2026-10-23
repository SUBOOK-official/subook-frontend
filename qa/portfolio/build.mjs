import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { qaRoot,escapeHtml as e } from '../stack/support.mjs';

const dir=path.join(qaRoot,'portfolio');
const data=JSON.parse(await readFile(path.join(dir,'scenario-cases.json'),'utf8'));
const cases=data.cases;
assert.equal(cases.length,40);assert.equal(new Set(cases.map(c=>c.id)).size,40);
for(const c of cases){assert.ok(c.steps.length&&c.expected&&c.precondition);assert.equal(c.evidenceType,'qa-work-record');}
const count=(field,status)=>cases.filter(c=>c[field]===status).length;
assert.deepEqual(['Pass','Fail','Blocked'].map(s=>count('cycle1',s)),[28,8,4]);
assert.deepEqual(['Pass','Deferred'].map(s=>count('cycle2',s)),[39,1]);
const defects=[...new Set(cases.map(c=>c.bug).filter(Boolean))];assert.equal(defects.length,8);
const bugText=await readFile(path.join(dir,'BUG_REPORTS.md'),'utf8');
for(const id of defects)assert.ok(bugText.includes('## '+id));

const overview=['# 수북 테스트 케이스와 수행 대장','',data.notice,'',
  '1차는 W3~W5 첫 실행 누적, RC2는 W6 재검증 결과다. 자동화 열은 구현된 검사 또는 후속 검증 경로이며, 업무 TC 전체가 자동화되었다는 뜻이 아니다.','',
  '| TC | 영역 | 우선순위 | 검증 | 첫 실행 | RC2 | 결함 |','|---|---|---|---|---|---|---|',
  ...cases.map(c=>`| ${c.id} | ${c.area} | ${c.priority} | ${c.title} | ${c.cycle1} | ${c.cycle2} | ${c.bug||'—'} |`),'',
  ...cases.flatMap(c=>[`## ${c.id} ${c.title}`,'',`- 영역 / 우선순위: ${c.area} / ${c.priority}`,`- 사전조건·데이터: ${c.precondition}`,
    `- 담당 역할: ${c.owner}`,`- 첫 실행 → RC2: ${c.cycle1} → ${c.cycle2}`,`- 관련 결함: ${c.bug||'없음'}`,`- 자동화·후속 경로: ${c.automation}`,'',
    ...c.steps.map((s,i)=>`${i+1}. ${s}`),'',`**기대 결과**: ${c.expected}`,'',`**재검증 결과**: ${c.cycle2==='Pass'?'기대 결과 충족. 관련 수정과 영향 범위 회귀를 확인하고 Pass 처리.':'업로드 차단은 정상. 용량 표기 개선은 QA-BUG-008로 후속 이관.'}`,''])];
await writeFile(path.join(dir,'TEST_CASES.md'),overview.join('\n').trimEnd()+'\n');

const actual=[];
for(const tool of ['selenium','postman','jmeter']){
  try{
    const latest=JSON.parse(await readFile(path.join(qaRoot,'results','stack',tool,'latest.json'),'utf8'));
    const bytes=await readFile(path.join(latest.directory,'summary.json'));
    const run=JSON.parse(bytes);actual.push({tool,run,hash:createHash('sha256').update(bytes).digest('hex'),relative:path.relative(dir,latest.directory).replaceAll('\\','/')});
  }catch(error){if(error.code!=='ENOENT')throw error;actual.push({tool,missing:true});}
}
const evidence=['# 실제 자동화 실행 증거','',`생성 시각: ${new Date().toISOString()}. 이 문서는 로컬 실행 원본에서 생성했다.`,'',
  ...actual.flatMap(x=>x.missing?[`## ${x.tool}`,'','미실행','']:[`## ${x.tool}`,'',`- 시각: ${x.run.startedAt} ~ ${x.run.finishedAt}`,`- 소스 커밋: ${x.run.commit}`,
    `- 결과: ${x.run.summary.passed} Pass / ${x.run.summary.failed} Fail / ${x.run.summary.blocked} Blocked`,
    `- 범위: ${x.run.scope}`,`- 증거: [summary.json](${x.relative}/summary.json) / [HTML](${x.relative}/report.html)`,
    `- summary SHA-256: ${x.hash}`,`- 실행 환경: ${JSON.stringify(x.run.environment)}${x.run.browser?' / '+JSON.stringify(x.run.browser):''}`,
    ...(x.tool==='postman'?[`- Assertion: ${JSON.stringify(x.run.assertions)}; Newman failures: ${x.run.newmanFailures}`]:[]),
    ...(x.tool==='jmeter'?x.run.results.filter(r=>r.profile).map(r=>`- ${r.id}: 측정 ${r.actual.samples}건 / p95 ${r.actual.p95Ms}ms / 오류 ${r.actual.errorPercent}% / ${r.actual.rps}req/s / 워밍업 제외${r.actual.warmupExcluded}건`):[]),'']),
  '원문 결과는 qa/results 아래에 보관하고 Git에서는 제외한다. clone 후 재실행하면 새 시각의 결과가 생성된다. 실행 시 dirty 상태와 파일별 해시는 각 summary.json에 있으며 SHA만으로 미커밋 QA 코드를 식별하지 않는다.',''];
await writeFile(path.join(dir,'RUN_EVIDENCE.md'),evidence.join('\n'));

function inline(text){return e(text).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`(.*?)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');}
function markdown(text){
  const out=[];let table=false;
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('|')){
      if(/^\|[\s:|-]+\|$/.test(line))continue;
      const tag=table?'td':'th';if(!table){out.push('<div class="table-scroll"><table>');table=true;}
      out.push('<tr>'+line.slice(1,-1).split('|').map(v=>`<${tag}>${inline(v.trim())}</${tag}>`).join('')+'</tr>');continue;
    }
    if(table){out.push('</table></div>');table=false;}
    if(!line.trim())continue;
    const h=line.match(/^(#{1,3}) (.*)/);if(h){const n=Math.min(h[1].length+1,4);out.push(`<h${n}>${inline(h[2])}</h${n}>`);}
    else if(line.startsWith('> '))out.push(`<aside>${inline(line.slice(2))}</aside>`);
    else out.push(`<p${line.startsWith('- ')?' class="bullet"':''}>${inline(line.replace(/^- /,'• '))}</p>`);
  }
  if(table)out.push('</table></div>');return out.join('\n');
}
const intro=await readFile(path.join(dir,'README.md'),'utf8');const release=await readFile(path.join(dir,'RELEASE_REPORT.md'),'utf8');
const rows=cases.map(c=>`<tr data-search="${e([c.id,c.area,c.title,c.priority,c.bug].join(' ').toLowerCase())}" data-status="${c.cycle2}"><td><code>${c.id}</code><small>${c.area} · ${c.priority}</small></td><td><details><summary>${e(c.title)}</summary><p><b>사전조건</b> ${e(c.precondition)}</p><ol>${c.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol><p><b>기대</b> ${e(c.expected)}</p><p><b>연결</b> ${e(c.automation)}</p></details></td><td>${c.cycle1}</td><td><span class="badge ${c.cycle2}">${c.cycle2}</span></td><td>${e(c.bug||'—')}</td></tr>`).join('');
const actualCards=actual.map(x=>x.missing?`<article><h3>${x.tool}</h3><p>아직 실행 결과가 없습니다.</p></article>`:
  `<article><h3>${e(x.tool)}</h3><div class="number">${x.run.summary.passed}<span> / ${x.run.summary.total} Pass</span></div><p>${e(x.run.startedAt)}</p><p>${e(x.run.scope)}</p><a href="${x.relative}/report.html">실행 리포트 열기 →</a>${x.tool==='jmeter'?x.run.results.filter(r=>r.profile).map(r=>`<p>${e(r.id)} · ${r.actual.samples}건 · p95 ${r.actual.p95Ms}ms · 오류 ${r.actual.errorPercent}%</p>`).join(''):''}</article>`).join('');
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수북 QA 포트폴리오</title><style>
:root{color-scheme:light;--navy:#10253e;--muted:#607286;--line:#d9e2e9;--green:#08775d}*{box-sizing:border-box}body{margin:0;background:#f2f5f7;color:var(--navy);font:15px/1.7 system-ui,'Malgun Gothic',sans-serif}header{background:var(--navy);color:white;padding:48px max(24px,calc((100vw - 1180px)/2)) 28px}header p{max-width:780px;color:#c6d7e3}h1{font-size:40px;line-height:1.2;margin:12px 0 20px;letter-spacing:-1px}.eyebrow{color:#8fd8c7;font-size:12px;font-weight:700;letter-spacing:2px}.label{display:inline-block;border:1px solid #5b7188;border-radius:4px;padding:3px 9px;font-size:12px}nav{position:sticky;top:0;background:white;border-bottom:1px solid var(--line);padding:8px max(20px,calc((100vw - 1180px)/2));display:flex;gap:6px;overflow:auto;z-index:2}button{font:inherit;cursor:pointer;border:0;background:transparent;border-radius:5px;padding:10px 15px;white-space:nowrap;color:var(--muted)}button[aria-selected=true]{background:var(--navy);color:white}main{max-width:1220px;margin:auto;padding:30px 20px 70px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}.stats article,.cards article{background:white;border:1px solid var(--line);padding:22px;border-radius:7px}.number{font-size:34px;font-weight:700;line-height:1.2;margin:8px 0}.number span{font-size:15px;font-weight:400}.stats small,small{display:block;color:var(--muted)}section.panel{background:white;border:1px solid var(--line);border-radius:8px;padding:30px}section[hidden]{display:none}h2{font-size:25px;margin-top:0}h3{font-size:20px;margin:30px 0 10px}h4{font-size:18px;margin:26px 0 10px}a{color:#126784;text-underline-offset:3px}aside{border-left:4px solid #2c967f;background:#edf7f4;padding:14px 18px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;border-bottom:1px solid var(--line);padding:13px 12px;vertical-align:top}th{background:#f3f6f8;font-size:13px;white-space:nowrap}td{font-size:14px}summary{cursor:pointer;font-weight:650}details p{font-size:13px;max-width:590px}details[open]{padding-bottom:10px}code{font-family:Consolas,monospace;font-size:12px}.badge{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:700}.Pass{background:#e4f4ed;color:#086b4c}.Deferred{background:#fff0cc;color:#805600}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center}input,select{font:inherit;padding:10px;border:1px solid var(--line);border-radius:5px}input{min-width:300px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.cards h3{margin-top:0}.cards p{font-size:13px;overflow-wrap:anywhere}.bullet{padding-left:16px}.muted{color:var(--muted);font-size:13px}footer{margin-top:22px;color:var(--muted);font-size:12px}@media(max-width:750px){h1{font-size:30px}.stats{grid-template-columns:repeat(2,1fr)}.cards{grid-template-columns:1fr}section.panel{padding:18px}input{min-width:180px;width:100%}header{padding:30px 20px}main{padding:20px 12px}}
</style></head><body><header><span class="eyebrow">SUBOOK / QUALITY ASSURANCE</span><h1>개발 초기부터 출시까지,<br>수북 QA 프로젝트</h1><span class="label">진성욱 · 6주 QA 수행 기록</span><p>요구사항 검토, 테스트 설계, 결함 처리와 출시 판정까지. Selenium · Postman · JMeter 자동화 코드와 실행 원문, 화면 캡처를 제공합니다.</p></header>
<nav role="tablist" aria-label="포트폴리오 탐색">${[['overview','프로젝트'],['cases','TC 40'],['bugs','버그 8'],['release','주간 기록·릴리스'],['actual','자동화·증빙']].map(([id,title],i)=>`<button role="tab" aria-selected="${i===0}" aria-controls="${id}" data-tab="${id}">${title}</button>`).join('')}</nav>
<main><div class="stats"><article><small>업무 TC</small><div class="number">40</div>첫 실행28 Pass · 8 Fail · 4 Blocked</article><article><small>등록 결함</small><div class="number">8</div>7 Closed · 1 Deferred</article><article><small>RC2</small><div class="number">97.5<span>%</span></div>39 Pass / 전체40</article><article><small>구현한 자동화 도구</small><div class="number">3</div>Selenium · Postman · JMeter</article></div>
<section class="panel" id="overview" role="tabpanel">${markdown(intro)}</section>
<section class="panel" id="cases" role="tabpanel" hidden><h2>테스트 케이스</h2><p class="muted">제목을 누르면 조건·절차·기대 결과가 펼쳐집니다.</p><div class="toolbar"><input id="search" aria-label="TC 검색" placeholder="TC ID, 결제, 정산, 버그 ID 검색"><select id="status" aria-label="RC2 상태"><option value="">전체 상태</option><option>Pass</option><option>Deferred</option></select><span id="count">40건</span></div><div class="table-scroll"><table id="cases-table"><thead><tr><th>ID / 우선순위</th><th>검증 내용</th><th>첫 실행</th><th>RC2</th><th>결함</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="panel" id="bugs" role="tabpanel" hidden>${markdown(bugText)}</section>
<section class="panel" id="release" role="tabpanel" hidden>${markdown(release)}</section>
<section class="panel" id="actual" role="tabpanel" hidden><h2>현재 코드로 실행한 자동화</h2><p>로컬 실행 원본에서 집계한 결과입니다. 각 도구의 범위·시각·원문을 함께 확인하세요.</p><div class="cards">${actualCards}</div><p><a href="../evidence/2026-10-24/index.html">화면 캡처·원본 로그 보기</a> · <a href="EVIDENCE_GUIDE.md">증빙 자료 안내</a></p><p><a href="RUN_EVIDENCE.md">환경·소스·해시 기록</a> · <a href="../stack/README.md">실행 가이드와 공식 문서</a></p><aside>Newman 개발 의존성의 잔여 audit 항목과 로컬 fixture 범위는 실행 가이드에 기록했습니다. 실제 운영 용량·PG·DB 통합 결과로 확대 해석하지 않습니다.</aside></section>
<footer>TC 원본: scenario-cases.json · 화면 생성: ${e(new Date().toISOString())} · 브라우저 로컬 파일로 열 수 있습니다.</footer></main>
<script>const tabs=[...document.querySelectorAll('[data-tab]')];tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(x=>x.setAttribute('aria-selected',String(x===b)));document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==b.dataset.tab)}));const filter=()=>{const q=document.querySelector('#search').value.toLowerCase(),s=document.querySelector('#status').value;let n=0;document.querySelectorAll('#cases-table tbody tr').forEach(r=>{r.hidden=!r.dataset.search.includes(q)||(s&&r.dataset.status!==s);if(!r.hidden)n++});document.querySelector('#count').textContent=n+'건'};document.querySelector('#search').addEventListener('input',filter);document.querySelector('#status').addEventListener('change',filter);</script></body></html>`;
await writeFile(path.join(dir,'index.html'),html);
console.log('Portfolio: 40 cases, 8 bug reports, reconciled counts; TEST_CASES.md / RUN_EVIDENCE.md / index.html generated.');
