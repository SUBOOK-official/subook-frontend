import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { apiCases } from './cases.mjs';

export async function exportCollection() {
  const collection={info:{name:'SUBOOK 실제 핸들러 API 회귀',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description:'실제 B2B·계정 연결·나이스페이 복귀 핸들러 검증. DB/PG/알림은 로컬 fixture. 환경의 baseUrl은 127.0.0.1 전용.'},
    variable:[{key:'baseUrl',value:'http://127.0.0.1:5199'}],
    event:[{listen:'prerequest',script:{type:'text/javascript',exec:[
      "if (!new RegExp('^http://127[.]0[.]0[.]1:[0-9]+$').test(pm.variables.get('baseUrl'))) { pm.execution.skipRequest(); throw new Error('QA local target only'); }"
    ]}}],
    item:apiCases.map(c=>({name:`${c.id} ${c.name}`,protocolProfileBehavior:{followRedirects:false},
      request:{method:c.method,header:[{key:'Content-Type',value:'application/json'},
        {key:'X-QA-Scenario',value:c.scenario||'ok'},...(c.token?[{key:'Authorization',value:'Bearer qa-user-only'}]:[]),
        ...Object.entries(c.headers||{}).map(([key,value])=>({key,value}))],
        url:'{{baseUrl}}'+c.path,...(c.method==='POST'?{body:{mode:'raw',raw:JSON.stringify(c.body)}}:{}),
        description:`우선순위 ${c.priority}\n기법 ${c.technique}\n사전조건 ${c.precondition}\n절차 ${c.steps.join(' → ')}\n기대 ${JSON.stringify(c.expect)}`},
      event:[{listen:'test',script:{type:'text/javascript',exec:[
        `const expected = ${JSON.stringify(c.expect)};`,
        "pm.test('HTTP status', () => pm.response.to.have.status(expected.status));",
        "pm.test('QA target identity', () => pm.expect(pm.response.headers.get('X-QA-Only')).to.eql('local-handler-with-fixtures'));",
        "pm.test('Unexpected upstream = 0', () => pm.expect(pm.response.headers.get('X-QA-Unexpected')).to.eql('0'));",
        "pm.test('Upstream call count', () => pm.expect(Number(pm.response.headers.get('X-QA-Upstream-Calls'))).to.eql(expected.calls));",
        "pm.test('Response contract', () => { if (expected.location) { pm.expect(pm.response.headers.get('Location')).to.include(expected.location); } else { const body=pm.response.json(); if(expected.code) pm.expect(body.code).to.eql(expected.code); if(expected.status===200) pm.expect(body.success).to.eql(true); if(expected.status>=400) pm.expect(body.error).to.be.a('string').and.not.empty; } });",
        "if(expected.paths) pm.test('Side effect sequence', () => pm.expect(JSON.parse(pm.response.headers.get('X-QA-Upstream-Paths'))).to.eql(expected.paths));",
        "if(expected.boundPhone) pm.test('Trusted DB phone only', () => pm.expect(pm.response.headers.get('X-QA-Bound-Phone')).to.eql(expected.boundPhone));",
        ...(c.id==='API-B2B-18'?["pm.test('Stable reference across retry', () => pm.expect(pm.response.headers.get('X-QA-Reference-Count')).to.eql('1'));"]:[]),
        ...(c.id.startsWith('API-B2B')&&c.expect.status===200?["pm.test('Reference id', () => pm.expect(pm.response.json().referenceId).to.match(/^B2B-\\d{8}-[0-9A-F]{6}$/));"]:[]),
      ]}}]}))};
  await writeFile(new URL('./subook.postman_collection.json',import.meta.url),JSON.stringify(collection,null,2)+'\n');
  await writeFile(new URL('./local.postman_environment.json',import.meta.url),JSON.stringify({name:'SUBOOK local isolated QA',values:[{key:'baseUrl',value:'http://127.0.0.1:5199',enabled:true}],_postman_variable_scope:'environment'},null,2)+'\n');
  return collection;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await exportCollection();
