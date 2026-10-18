// 원본·DB·RLS를 수정하지 않는 재시작 가능한 사전 이미지 생성 도구.
// node frontend/scripts/backfill-product-images.mjs [--write] [--verify] [--limit=10] [--concurrency=4]
import { readFileSync, existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { IMAGE_VARIANTS, IMAGE_VARIANT_PREFIX, PRODUCT_IMAGE_BUCKETS, imageVariantPath } from "../packages/shared-domain/src/storageImage.js";
import { storageRequest, uploadStoredImage } from "../packages/shared-supabase/src/productImageStorage.js";
import { createImageMaintenanceClient, listStoredImages } from "../packages/shared-supabase/src/productImageMaintenance.js";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(frontend, "..");
const env = { ...process.env };
for (const file of [resolve(frontend, ".env"), resolve(root, ".env.local")]) {
  if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, "utf8")));
}
const url = env.VITE_SUPABASE_PUBLIC_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || new URL(url).hostname.split(".")[0] !== env.SUPABASE_PROJECT_REF) {
  throw new Error("Supabase 대상 프로젝트와 서비스 인증 설정이 일치해야 합니다.");
}
const client = createImageMaintenanceClient(url, key);
const write = process.argv.includes("--write");
const verify = process.argv.includes("--verify");
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || Infinity);
const concurrency = Math.min(8, Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] || 4)));
const report = resolve(root, ".tmp", "product-image-backfill.jsonl");
const pending = [];
const complete = [];
let sourceBytes = 0;
let storedBytes = 0;
for (const bucket of PRODUCT_IMAGE_BUCKETS) {
  const all = await listStoredImages(client, bucket);
  const objects = new Map(all.map((file) => [file.path, file]));
  const sources = all.filter((file) => !file.path.startsWith(IMAGE_VARIANT_PREFIX)
    && (file.contentType?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.path)));
  let missing = 0;
  for (const source of sources) {
    sourceBytes += source.size;
    const absent = IMAGE_VARIANTS.filter(({ width }) => !(objects.get(imageVariantPath(source.path, width))?.size > 0));
    storedBytes += IMAGE_VARIANTS.reduce((total, { width }) => total + (objects.get(imageVariantPath(source.path, width))?.size || 0), 0);
    const job = { bucket, ...source, absent };
    if (absent.length) { missing += absent.length; pending.push(job); }
    else complete.push(job);
  }
  console.log(JSON.stringify({ bucket, originals: sources.length, missingVariants: missing }));
}
console.log(JSON.stringify({ mode: write ? "write" : verify ? "verify" : "dry-run", originals: pending.length + complete.length, pending: pending.length,
  complete: complete.length, sourceMB: +(sourceBytes / 1048576).toFixed(2), storedVariantMB: +(storedBytes / 1048576).toFixed(2) }));

if (write) {
  await mkdir(dirname(report), { recursive: true });
  const jobs = pending.slice(0, limit);
  let cursor = 0;
  let done = 0;
  let failed = 0;
  let bytes = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        const { data } = await storageRequest((signal) => client.storage.from(job.bucket).download(job.path, {}, { signal }));
        const original = Buffer.from(await data.arrayBuffer());
        const outputs = await Promise.all(job.absent.map(async (variant) => {
          const { data: buffer, info } = await sharp(original, { limitInputPixels: 100000000 })
            .rotate().resize({ width: variant.width, height: 16000, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" }).jpeg({ quality: variant.quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
          const path = imageVariantPath(job.path, variant.width);
          await uploadStoredImage(client, job.bucket, path, buffer, "image/jpeg");
          bytes += buffer.length;
          return { path, bytes: buffer.length, width: info.width, height: info.height };
        }));
        await appendFile(report, `${JSON.stringify({ at: new Date().toISOString(), bucket: job.bucket, source: job.path, originalBytes: original.length, outputs })}\n`);
        done++;
      } catch (error) {
        failed++;
        // URL·인증 정보가 포함될 수 있는 SDK 응답 전체는 로그에 출력하지 않는다.
        console.error(JSON.stringify({ bucket: job.bucket, path: job.path, status: error.statusCode || error.code || "conversion-failed" }));
      }
      if ((done + failed) % 25 === 0 || done + failed === jobs.length) console.log(JSON.stringify({ done, failed, total: jobs.length, addedMB: +(bytes / 1048576).toFixed(2) }));
    }
  }));
  if (failed) process.exitCode = 1;
}

if (verify) {
  if (pending.length) { console.error("미생성 파일이 남아 있습니다. --write 완료 후 다시 검증하세요."); process.exitCode = 1; }
  // 버킷·원본 폴더별 한 장씩 공개 HTTP 응답/형식/비율을 실제 다운로드로 확인한다.
  const samples = new Map();
  for (const job of complete) samples.set(`${job.bucket}/${job.path.split("/")[0]}`, job);
  let checked = 0;
  for (const job of samples.values()) {
    for (const variant of IMAGE_VARIANTS) {
      const path = imageVariantPath(job.path, variant.width);
      const publicUrl = client.storage.from(job.bucket).getPublicUrl(path).data.publicUrl;
      await storageRequest(async (signal) => {
        const response = await fetch(publicUrl, { signal });
        if (!response.ok) throw Object.assign(new Error("이미지 공개 조회 실패"), { status: response.status });
        const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
        if (meta.format !== "jpeg" || meta.width > variant.width || !/max-age=31536000/.test(response.headers.get("cache-control") || "")) throw new Error("이미지 형식/크기/캐시 검증 실패");
        checked++;
      });
    }
  }
  console.log(JSON.stringify({ verifiedPublicResponses: checked }));
}
