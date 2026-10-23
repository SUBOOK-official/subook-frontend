import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const qaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.dirname(qaRoot);
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function beginRun(tool, sources = []) {
  const startedAt = new Date().toISOString();
  const id = startedAt.replace(/[:.]/g, '-') + '-' + process.pid;
  const directory = path.join(qaRoot, 'results', 'stack', tool, id);
  await mkdir(directory, {recursive:true});
  const git = args => execFileSync('git', ['-C', repoRoot, ...args], {encoding:'utf8'}).trim();
  const sourceHashes = {};
  const qaFiles=(await readdir(path.join(qaRoot,'stack'),{recursive:true})).filter(f=>/\.(mjs|json|jmx)$/.test(f)).map(f=>'qa/stack/'+f.replaceAll('\\','/'));
  for (const source of [...new Set([...sources,...qaFiles,'qa/package.json','qa/package-lock.json'])]) sourceHashes[source] = createHash('sha256').update(await readFile(path.join(repoRoot, source))).digest('hex');
  return {tool, id, directory, startedAt, commit:git(['rev-parse','HEAD']),
    worktree:git(['status','--short']), sourceHashes,
    environment:{node:process.version,platform:process.platform,os:os.release(),cpu:os.cpus()[0]?.model}, results:[]};
}

export async function endRun(run, extra = {}) {
  Object.assign(run, extra, {finishedAt:new Date().toISOString()});
  run.summary = {total:run.results.length,passed:run.results.filter(x=>x.status==='PASS').length,
    failed:run.results.filter(x=>x.status==='FAIL').length,blocked:run.results.filter(x=>x.status==='BLOCKED').length};
  const rows = run.results.map(x=>`<tr><td>${escapeHtml(x.id)}</td><td>${escapeHtml(x.name)}</td><td class="${x.status}">${escapeHtml(x.status)}</td><td>${escapeHtml(typeof x.actual==='string'?x.actual:JSON.stringify(x.actual))}</td></tr>`).join('');
  await writeFile(path.join(run.directory,'summary.json'),JSON.stringify(run,null,2));
  await writeFile(path.join(run.directory,'report.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>SUBOOK ${escapeHtml(run.tool)} 검증 결과</title><style>body{font:15px/1.6 system-ui;max-width:1100px;margin:40px auto;color:#16243a;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;text-align:left;padding:10px;vertical-align:top;overflow-wrap:anywhere}.PASS{color:#08744b}.FAIL,.BLOCKED{color:#b42318}code{font-size:12px}pre{white-space:pre-wrap}</style><h1>SUBOOK ${escapeHtml(run.tool)} 검증 결과</h1><p>${escapeHtml(run.startedAt)} · ${escapeHtml(run.environment.platform)} · ${escapeHtml(run.environment.node)}</p><p>Pass ${run.summary.passed} / Fail ${run.summary.failed} / Blocked ${run.summary.blocked}</p><p>${escapeHtml(run.scope||'로컬 격리 검증')}</p><p>소스 기준 <code>${escapeHtml(run.commit)}</code> — 실행 시 작업 트리와 파일 SHA-256은 summary.json에 기록</p><table><thead><tr><th>TC</th><th>검증</th><th>결과</th><th>관찰값</th></tr></thead><tbody>${rows}</tbody></table></html>`);
  await writeFile(path.join(qaRoot,'results','stack',run.tool,'latest.json'),JSON.stringify({directory:run.directory,id:run.id,summary:run.summary},null,2));
  console.log(`${run.tool}: ${run.summary.passed}/${run.summary.total} PASS — ${run.directory}`);
  return run;
}
