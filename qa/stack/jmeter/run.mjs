import { spawn } from 'node:child_process';
import { access,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApiServer } from '../api-server.mjs';
import { qaRoot,beginRun,endRun } from '../support.mjs';

const profiles={smoke:{threads:1,ramp:1,duration:15,warmup:5},baseline:{threads:10,ramp:5,duration:30,warmup:10},peak:{threads:25,ramp:5,duration:30,warmup:10}};
const selected=process.argv[2]||'all';
if(selected!=='all'&&!profiles[selected])throw new Error('Profile must be smoke, baseline, peak, or all');
const run=await beginRun('jmeter',['apps/public-web/api/b2b-inquiry.js','apps/public-web/api/auth/member-identity.js','apps/public-web/api/payments/nicepay-return.js','qa/stack/jmeter/subook-local.jmx']);
let server;
function csv(text){
  const lines=text.trim().split(/\r?\n/),headers=lines.shift().split(',');
  return lines.map(line=>Object.fromEntries(line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g).filter(x=>x).map(x=>x.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"')).map((v,i)=>[headers[i],v])));
}
function metrics(rows){
  if(!rows.length)throw new Error('No measured load samples');
  const times=rows.map(x=>Number(x.elapsed)).sort((a,b)=>a-b),failed=rows.filter(x=>x.success!=='true').length;
  const seconds=(Math.max(...rows.map(x=>Number(x.timeStamp)+Number(x.elapsed)))-Math.min(...rows.map(x=>Number(x.timeStamp))))/1000;
  return {samples:rows.length,failed,errorPercent:100*failed/rows.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],
    p99Ms:times[Math.ceil(times.length*.99)-1],maxMs:times.at(-1),rps:Number((rows.length/seconds).toFixed(2)),measuredSeconds:Number(seconds.toFixed(2))};
}
try{
  const home=process.env.JMETER_HOME||path.join(qaRoot,'.tools','apache-jmeter-5.6.3');
  const jar=path.join(home,'bin','ApacheJMeter.jar');await access(jar);
  server=await startApiServer();
  const health=await fetch(server.origin+'/__qa/health').then(x=>x.json());
  if(!health.qa||health.production!==false)throw new Error('Local QA server identity mismatch');
  for(const [name,profile]of Object.entries(profiles).filter(([name])=>selected==='all'||name===selected)){
    const jtl=path.join(run.directory,name+'.jtl'),dashboard=path.join(run.directory,name+'-dashboard');
    const args=['-Xms256m','-Xmx512m','-jar',jar,'-n','-t',path.join(qaRoot,'stack/jmeter/subook-local.jmx'),'-l',jtl,'-j',path.join(run.directory,name+'-jmeter.log'),
      '-e','-o',dashboard,`-Jport=${new URL(server.origin).port}`,`-Jthreads=${profile.threads}`,`-Jramp=${profile.ramp}`,`-Jduration=${profile.duration}`,
      '-Jjmeter.reportgenerator.overall_granularity=1000','-Jjmeter.save.saveservice.output_format=csv','-Jjmeter.save.saveservice.print_field_names=true'];
    console.log(`JMeter ${name}: ${profile.threads} threads, ${profile.duration}s, warmup ${profile.warmup}s excluded`);
    let log='';const code=await new Promise((resolve,reject)=>{
      const child=spawn('java',args,{windowsHide:true});child.stdout.on('data',x=>{log+=x;});child.stderr.on('data',x=>{log+=x;});child.on('error',reject);child.on('close',resolve);
    });
    await writeFile(path.join(run.directory,name+'-console.log'),log);
    if(code!==0)throw new Error(`JMeter exit ${code}: ${log.slice(-1600)}`);
    const rows=csv(await readFile(jtl,'utf8'));const first=Math.min(...rows.map(x=>Number(x.timeStamp)));
    const measured=rows.filter(x=>Number(x.timeStamp)>=first+profile.warmup*1000);const actual=metrics(measured);
    actual.allSamples=rows.length;actual.warmupExcluded=rows.length-measured.length;
    actual.byEndpoint=Object.fromEntries([...new Set(measured.map(x=>x.label))].map(label=>[label,metrics(measured.filter(x=>x.label===label))]));
    const status=actual.samples>=20&&actual.p95Ms<500&&actual.errorPercent<1?'PASS':'FAIL';
    run.results.push({id:'LOAD-'+name.toUpperCase(),name:`${profile.threads} 동시 사용자`,status,profile,
      expected:'로컬 baseline gate: 표본≥20 / p95<500ms / assertion 오류율<1%; 운영 SLO 아님',actual});
    console.log(`${name}: ${actual.samples} samples, p95=${actual.p95Ms}ms, ${actual.rps} req/s, errors=${actual.errorPercent}%`);
  }
}catch(error){run.results.push({id:'LOAD-RUNNER',name:'JMeter 실행 환경',status:'FAIL',actual:error.stack});}
finally{if(server)await server.close();await endRun(run,{scope:'로컬 Node 실제 API 핸들러 + 즉시 응답 fixture. 단일 PC 부하 생성. Vercel/DB/PG/네트워크 용량·운영 최대 TPS 측정 아님.'});}
if(run.summary.failed||run.summary.blocked)process.exitCode=1;
