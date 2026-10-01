import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import vm from "node:vm";

// Vite 전용 Supabase 연결만 대체하고 실제 업로드 진입점의 경계값·오류 처리를 검사한다.
const source = (await readFile(new URL("../src/lib/adminImageUpload.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export /gm, "");

function setup(uploadError = null) {
  const uploads = [];
  const context = vm.createContext({
    supabase: { storage: { from: (bucket) => ({
      upload: async (path, file, options) => {
        uploads.push({ bucket, path, file, options });
        return { error: uploadError };
      },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
    }) } },
  });
  vm.runInContext(source, context);
  return { upload: context.uploadImageToBucket, uploads };
}

const image = (size, type = "image/png") => ({ size, type, name: "상세 사진.png" });
const MB = 1024 * 1024;

test("10MB 초과~15MB 상세사진을 원본 그대로 업로드한다", async () => {
  const { upload, uploads } = setup();
  for (const size of [10 * MB + 1, 12 * MB, 15 * MB]) {
    const file = image(size);
    const url = await upload("inspection-images", file, "register");
    const sent = uploads.at(-1);
    assert.equal(sent.file, file);
    assert.equal(sent.bucket, "inspection-images");
    assert.match(sent.path, /^register\/[a-zA-Z0-9._-]+$/);
    assert.equal(sent.options.contentType, "image/png");
    assert.equal(sent.options.upsert, false);
    assert.equal(url, `https://storage.test/inspection-images/${sent.path}`);
  }
});

test("15MB 초과·빈 파일·미지원 형식은 서버 전송 전에 차단한다", async () => {
  const { upload, uploads } = setup();
  await assert.rejects(upload("inspection-images", image(15 * MB + 1)), /15MB/);
  await assert.rejects(upload("inspection-images", image(0)), /빈 이미지/);
  await assert.rejects(upload("inspection-images", image(100, "image/svg+xml")), /JPG\/PNG\/WebP\/GIF/);
  assert.equal(uploads.length, 0);
});

test("표지와 상세사진에 동일한 형식·크기 검사를 적용한다", async () => {
  const { upload, uploads } = setup();
  for (const bucket of ["product-covers", "inspection-images"]) {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      await upload(bucket, image(15 * MB, type));
      assert.equal(uploads.at(-1).options.contentType, type);
    }
  }
});

test("새 코드·기존 maximum allowed size 오류를 한국어로 안내한다", async () => {
  for (const error of [
    { code: "EntityTooLarge", message: "too large" },
    { statusCode: "413", message: "too large" },
    { statusCode: "400", message: "The object exceeded the maximum allowed size" },
  ]) {
    const { upload } = setup(error);
    await assert.rejects(upload("inspection-images", image(12 * MB)), (caught) => {
      assert.match(caught.message, /저장소의 용량 제한/);
      assert.equal(caught.cause, error);
      return true;
    });
  }
});

test("권한·네트워크 등 다른 오류는 용량 오류로 바꾸지 않는다", async () => {
  const error = new Error("Access denied");
  const { upload } = setup(error);
  await assert.rejects(upload("inspection-images", image(MB)), (caught) => caught === error);
});
