// 실행 위치: 워크스페이스 루트. --upload가 없으면 파일 검증/분류만 수행한다.
// node frontend/scripts/import-study-materials.mjs "C:\path\학습 교재" [--upload]
import { createReadStream, readFileSync } from "node:fs";
import { readdir, stat, open } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { FileUrlStorage } from "tus-js-client";
import { uploadStudyMaterialBytes, studyMaterialStoragePath } from "../packages/shared-supabase/src/adminStudyMaterialsClient.js";
import { materialCategoryFromPath, validateStudyMaterialFile, STUDY_MATERIAL_BUCKET } from "../packages/shared-domain/src/studyMaterials.js";

const source = resolve(process.argv[2] || "missing-source");
const shouldUpload = process.argv.includes("--upload");
const registerOnly = process.argv.includes("--register-only");
const fromIndex = Number(process.argv.find((arg) => arg.startsWith('--from-index='))?.split('=')[1] || 0);
const concurrency = Math.min(8, Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] || 3)));
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.pdf$/i.test(entry.name)) files.push(path);
  }
}
await walk(source);
const inventory = [];
for (const path of files.sort()) {
  const { size } = await stat(path);
  const category = materialCategoryFromPath(relative(source,path));
  const validation = validateStudyMaterialFile({name:category.file_name,size});
  if (validation) throw Error(`${category.file_name}: ${validation}`);
  const handle = await open(path,'r'); const header=Buffer.alloc(5);
  try { await handle.read(header,0,5,0); } finally { await handle.close(); }
  if (header.toString() !== '%PDF-') throw Error(`Invalid PDF: ${category.file_name}`);
  inventory.push({path,size,...category});
}
const counts = {};
for (const item of inventory) { const key=[item.subject,item.subject_detail].filter(Boolean).join('/'); counts[key]=(counts[key]||0)+1; }
console.log(JSON.stringify({files:inventory.length,bytes:inventory.reduce((sum,item)=>sum+item.size,0),categories:counts}));
if (!shouldUpload && !registerOnly) process.exit(0);

const env={...process.env,...parseEnv(readFileSync('.env','utf8')),...parseEnv(readFileSync('.env.local','utf8'))};
if(new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0] !== env.SUPABASE_PROJECT_REF || readFileSync('backend/supabase/.temp/project-ref','utf8').trim() !== env.SUPABASE_PROJECT_REF) throw Error('Project mismatch');
const client=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:options?.signal || AbortSignal.timeout(30000)})}});
const bucket=client.storage.from(STUDY_MATERIAL_BUCKET);
const urlStorage = new FileUrlStorage('.codex/study-material-import-resume.json');
let completed=0;
const failures=[];
async function importFile(item) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(item.path)) hash.update(chunk);
  // 경로 + 내용으로 ID를 고정해 재실행해도 같은 분류/파일은 중복되지 않는다.
  const key=createHash('sha256').update(relative(source,item.path).replaceAll('\\','/')).update(hash.digest()).digest('hex');
  const id=`${key.slice(0,8)}-${key.slice(8,12)}-${key.slice(12,16)}-${key.slice(16,20)}-${key.slice(20,32)}`;
  const path=studyMaterialStoragePath(id);
  const {data:existing,error:lookupError}=await client.from('admin_study_materials').select('id,size_bytes').eq('id',id).maybeSingle();
  if(lookupError) throw Error(lookupError.message);
  const {data:exists}=await bucket.exists(path);
  if (!exists && registerOnly) return;
  if(!exists) {
    const stream=createReadStream(item.path);
    try { await uploadStudyMaterialBytes({file:stream,size:item.size,path,supabaseUrl:env.VITE_SUPABASE_URL,token:env.SUPABASE_SERVICE_ROLE_KEY,urlStorage}); }
    finally { stream.destroy(); }
  }
  const {data:info,error:infoError}=await bucket.info(path);
  if(infoError || Number(info?.size)!==item.size || info?.contentType!=='application/pdf') throw Error(`Stored size mismatch: ${item.file_name}`);
  if(!existing) {
    const {error}=await client.from('admin_study_materials').insert({id,exam_year:2028,subject:item.subject,subject_detail:item.subject_detail,title:item.title,file_name:item.file_name,storage_path:path,size_bytes:item.size});
    if(error && error.code!=='23505') throw Error(error.message);
  }
  console.log(JSON.stringify({completed:++completed,total:inventory.length,file:item.file_name,subject:item.subject,detail:item.subject_detail}));
}
// 기본 3개 동시 업로드, 스트리밍으로 메모리 사용을 제한한다.
let cursor=fromIndex;
await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<inventory.length) { const item=inventory[cursor++];
    let success=false;
    for(let attempt=0;attempt<3;attempt++) {
      try { await importFile(item); success=true; break; }
      catch(error) {
        console.error(JSON.stringify({file:item.file_name,attempt:attempt+1,error:error.message}));
        if(attempt<2) await new Promise(resolve=>setTimeout(resolve,5000*(attempt+1)));
      }
    }
    if(!success) failures.push(item.file_name);
  }
}));
console.log(JSON.stringify({completed,failed:failures.length,failures}));
if(failures.length) process.exitCode=1;
