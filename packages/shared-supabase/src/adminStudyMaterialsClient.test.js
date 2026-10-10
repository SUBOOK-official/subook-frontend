import { test } from "node:test";
import assert from "node:assert/strict";
import { materialCategoryFromPath, validateStudyMaterialFile, STUDY_MATERIAL_MAX_BYTES } from "../../shared-domain/src/studyMaterials.js";
import { fetchStudyMaterialRange, uploadStudyMaterial, uploadStudyMaterialBytes } from "./adminStudyMaterialsClient.js";

test("폴더의 과목·세부과목을 보존하고 PDF 종류/크기를 검사", () => {
  assert.deepEqual(materialCategoryFromPath("수학/미적분1/해설.pdf"), { subject: "수학", subject_detail: "미적분1", file_name: "해설.pdf", title: "해설" });
  assert.equal(materialCategoryFromPath("영어\\단어.PDF").subject_detail, "");
  assert.throws(() => materialCategoryFromPath("잘못된과목/test.pdf"));
  assert.match(validateStudyMaterialFile({name:"test.txt",size:100}), /PDF/);
  assert.match(validateStudyMaterialFile({name:"test.pdf",size:0}), /비어/);
  assert.match(validateStudyMaterialFile({name:"test.pdf",size:STUDY_MATERIAL_MAX_BYTES + 1}), /1GB/);
  assert.equal(validateStudyMaterialFile({name:"test.PDF",size:550414182,type:"application/pdf"}), "");
});

test("TUS는 직접 Storage 주소·6MiB 청크·재시도·재개 사용, 덮어쓰기 금지", async () => {
  let options; let resumed = false;
  class MockUpload {
    constructor(_file, opts) { options = opts; }
    async findPreviousUploads() { return [{uploadUrl:"previous"}]; }
    resumeFromPreviousUpload() { resumed = true; }
    start() { options.onProgress(50,100); options.onSuccess(); }
  }
  let progress;
  await uploadStudyMaterialBytes({file:{},size:100,path:"2028/id.pdf",supabaseUrl:"https://project.supabase.co",token:"test",UploadClass:MockUpload,onProgress:(value)=>{progress=value;}});
  assert.equal(options.endpoint,"https://project.storage.supabase.co/storage/v1/upload/resumable");
  assert.equal(options.chunkSize,6291456); assert.equal(options.headers['x-upsert'],undefined);
  assert.equal(options.metadata.contentType,"application/pdf"); assert.equal(resumed,true); assert.equal(progress,50);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(uploadStudyMaterialBytes({file:{},supabaseUrl:"https://project.supabase.co",signal:controller.signal}), /중지/);
});

test("확장자만 PDF인 파일은 전송 전에 거부", async () => {
  const file = new File(["wrong file"], "test.pdf", {type:"application/pdf"});
  await assert.rejects(uploadStudyMaterial(null, {file,subject:"수학",subject_detail:"대수"}), /올바른 PDF/);
});

test("미리보기는 필요한 바이트만 요청하고 전체 파일 응답은 읽지 않는다", async () => {
  let options;
  const bytes = await fetchStudyMaterialRange("https://example.test/signed", 3, 8, undefined, async (_url, opts) => {
    options = opts; return new Response("%PDF-", {status:206});
  });
  assert.equal(options.headers.Range,"bytes=3-7"); assert.equal(bytes.length,5);
  let cancelled = 0;
  await assert.rejects(fetchStudyMaterialRange("https://example.test/signed", 0, 5, undefined, async () => ({status:200,body:{cancel:async()=>{cancelled++;}},arrayBuffer:()=>{throw Error("전체 파일을 읽으면 안 됨");}})), /PDF 일부/);
  assert.equal(cancelled,2);
  await assert.rejects(fetchStudyMaterialRange("https://example.test/signed",0,5,undefined,async()=>new Response("bad",{status:206})), /길이/);
});
