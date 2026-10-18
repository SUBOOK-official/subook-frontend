// 브라우저 인코더 검증용 로컬 페이지. 운영 인증·상품 데이터에 접근하지 않는다.
// node frontend/scripts/verify-product-images.mjs → http://127.0.0.1:4187
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const fixture = await sharp({ create: { width: 1200, height: 1800, channels: 4, background: { r: 50, g: 120, b: 190, alpha: 0.5 } } }).png().toBuffer();
const rotated = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: "#68a36b" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
const modules = new Map([
  ["/packages/shared-domain/src/createImageVariants.js", new URL("../packages/shared-domain/src/createImageVariants.js", import.meta.url)],
  ["/packages/shared-domain/src/storageImage.js", new URL("../packages/shared-domain/src/storageImage.js", import.meta.url)],
  ["/packages/shared-supabase/src/productImageStorage.js", new URL("../packages/shared-supabase/src/productImageStorage.js", import.meta.url)],
]);
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>상품 이미지 사전 생성 검증</title>
<style>body{font:16px sans-serif;margin:36px;color:#17243b}img{max-width:180px;max-height:230px;margin:16px}pre{white-space:pre-wrap}button{padding:12px 20px}</style>
<h1>상품 이미지 사전 생성 검증</h1><button id="run">브라우저 변환 검증</button><pre id="result">준비됨 — 운영 데이터는 변경하지 않습니다.</pre><div id="images"></div>
<script type="module">
import {createImageVariants} from '/packages/shared-domain/src/createImageVariants.js';
import {uploadProductImage} from '/packages/shared-supabase/src/productImageStorage.js';
document.querySelector('#run').onclick = async () => {
  const log = document.querySelector('#result'); log.textContent = '검증 중';
  try {
    const rows=[];
    for (const kind of ['portrait','exif']) {
      const response=await fetch('/'+kind); const file=await response.blob();
      const variants=await createImageVariants(file);
      const sent=[];
      const client={storage:{from:()=>({upload:async(path,blob)=>{sent.push({path,size:blob.size});return {error:null}},getPublicUrl:path=>({data:{publicUrl:path}}),remove:async()=>({error:null})})}};
      await uploadProductImage(client,'product-covers','test/'+kind+'.png',file,variants);
      if(sent.length!==4 || sent.at(-1).path!=='test/'+kind+'.png') throw Error('업로드 순서 오류');
      for(const variant of variants){
        const img=new Image(); img.src=URL.createObjectURL(variant.blob); await img.decode();
        const ratio=kind==='exif'?1.5:2/3;
        if(Math.abs(img.naturalWidth/img.naturalHeight-ratio)>0.01) throw Error('비율/EXIF 방향 오류');
        if(img.naturalWidth>variant.width || variant.blob.type!=='image/jpeg') throw Error('크기/형식 오류');
        img.alt=kind+' '+variant.width+'px'; document.querySelector('#images').append(img);
        rows.push(kind+' '+variant.width+'px → '+img.naturalWidth+'×'+img.naturalHeight+', '+variant.blob.size+' bytes');
      }
    }
    log.textContent='PASS: 브라우저 변환 6개·비율·EXIF 방향·JPEG·축소본 우선 업로드 확인\\n'+rows.join('\\n');
  }catch(error){log.textContent='FAIL: '+error.message;}
};</script></html>`;
createServer(async (req, res) => {
  try {
    if (req.url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); }
    else if (req.url === "/portrait" || req.url === "/exif") { res.setHeader("Content-Type", req.url === "/portrait" ? "image/png" : "image/jpeg"); res.end(req.url === "/portrait" ? fixture : rotated); }
    else if (modules.has(req.url)) { res.setHeader("Content-Type", "application/javascript"); res.end(await readFile(modules.get(req.url))); }
    else { res.statusCode = 404; res.end(); }
  } catch { res.statusCode = 500; res.end("QA server error"); }
}).listen(4187, "127.0.0.1", () => console.log("Image QA: http://127.0.0.1:4187"));
