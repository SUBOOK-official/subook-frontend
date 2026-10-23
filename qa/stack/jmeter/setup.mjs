import { mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { qaRoot } from '../support.mjs';

export const version='5.6.3';
export const home=path.join(qaRoot,'.tools',`apache-jmeter-${version}`);
try {await access(path.join(home,'bin','ApacheJMeter.jar'));console.log(`JMeter ${version} already installed: ${home}`);}
catch {
  const directory=path.dirname(home);await mkdir(directory,{recursive:true});
  const filename=`apache-jmeter-${version}.tgz`;
  const source=`https://dlcdn.apache.org/jmeter/binaries/${filename}`;
  const hashSource=`https://downloads.apache.org/jmeter/binaries/${filename}.sha512`;
  console.log(`Downloading Apache JMeter ${version} and SHA-512`);
  const response=await fetch(source,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`JMeter download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const hashResponse=await fetch(hashSource,{signal:AbortSignal.timeout(30000)});
  if(!hashResponse.ok)throw new Error(`Checksum HTTP ${hashResponse.status}`);
  const expected=(await hashResponse.text()).match(/[a-fA-F0-9]{128}/)?.[0].toLowerCase();
  const actual=createHash('sha512').update(bytes).digest('hex');
  if(!expected||expected!==actual)throw new Error('JMeter SHA-512 mismatch');
  const archive=path.join(directory,filename);await writeFile(archive,bytes);
  execFileSync('tar',['-xzf',archive,'-C',directory],{stdio:'inherit'});
  await access(path.join(home,'bin','ApacheJMeter.jar'));
  await writeFile(path.join(directory,'jmeter-install.json'),JSON.stringify({version,source,hashSource,sha512:actual,verifiedAt:new Date().toISOString()},null,2));
  // 배포된 텍스트 파일도 읽혀야 설치 완료로 판정한다.
  await readFile(path.join(home,'bin','jmeter.properties'));
  console.log(`Verified and installed: ${home}`);
}
