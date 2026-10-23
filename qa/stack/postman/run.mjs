import newman from 'newman';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApiServer } from '../api-server.mjs';
import { beginRun,endRun } from '../support.mjs';
import { exportCollection } from './export.mjs';
import { apiCases } from './cases.mjs';

const run=await beginRun('postman',['apps/public-web/api/b2b-inquiry.js','apps/public-web/api/auth/member-identity.js','apps/public-web/api/payments/nicepay-return.js']);
let server;
try {
  server=await startApiServer();
  const collection=await exportCollection();
  const summary=await new Promise((resolve,reject)=>newman.run({collection,
    environment:{values:[{key:'baseUrl',value:server.origin,enabled:true}]},
    ignoreRedirects:true,timeoutRequest:15000,reporters:['cli','json','junit'],
    reporter:{json:{export:path.join(run.directory,'newman.json')},junit:{export:path.join(run.directory,'junit.xml')}}
  },(error,result)=>error?reject(error):resolve(result)));
  for(const c of apiCases) {
    const execution=summary.run.executions.find(x=>x.item.name.startsWith(c.id+' '));
    const failures=(execution?.assertions||[]).filter(x=>x.error);
    const status=!execution?'BLOCKED':execution.requestError||failures.length?'FAIL':'PASS';
    run.results.push({id:c.id,name:c.name,status,expected:c.expect,actual:{http:execution?.response?.code,assertions:execution?.assertions?.length,
      failures:failures.map(x=>({name:x.assertion,message:x.error.message})),requestError:execution?.requestError?.message}});
  }
  run.assertions=summary.run.stats.assertions;
  run.newmanFailures=summary.run.failures.length;
  await writeFile(path.join(run.directory,'upstream-evidence.json'),JSON.stringify(server.requests,null,2));
}catch(error){run.results.push({id:'API-RUNNER',name:'API 실행 환경',status:'FAIL',actual:error.stack});}
finally{if(server)await server.close();await endRun(run,{scope:'실제 public-web 서버리스 핸들러 + 요청별 Supabase/Nicepay fixture. 실제 DB 트랜잭션·PG·알림 발송 검증 제외.'});}
if(run.summary.failed||run.summary.blocked||run.newmanFailures)process.exitCode=1;
