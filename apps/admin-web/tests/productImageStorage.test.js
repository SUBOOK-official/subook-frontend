import test from "node:test";
import assert from "node:assert/strict";
import { uploadProductImage, storageRequest, removeProductImage, fetchWithStorageTimeout } from "../../../packages/shared-supabase/src/productImageStorage.js";
import { imageVariantPath } from "../../../packages/shared-domain/src/storageImage.js";

const variants = [400, 900, 1600].map((width) => ({ width, blob: new Blob(["jpeg"], { type: "image/jpeg" }) }));
const original = new Blob(["original"], { type: "image/png" });
function setup(failAt) {
  const uploads = [];
  const removed = [];
  const client = { storage: { from: () => ({
    upload: async (path, body, options) => {
      uploads.push({ path, body, options });
      return uploads.length === failAt ? { error: { statusCode: "403", message: "denied" } } : { error: null };
    },
    remove: async (paths) => { removed.push(...paths); return { error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
  }) } };
  return { client, uploads, removed };
}

test("축소본 모두 저장되기 전에는 원본 URL을 게시하지 않는다", async () => {
  const { client, uploads } = setup();
  assert.equal(await uploadProductImage(client, "product-covers", "register/original.png", original, variants), "https://storage.test/register/original.png");
  assert.deepEqual(uploads.map(({ path }) => path), [...variants.map(({ width }) => imageVariantPath("register/original.png", width)), "register/original.png"]);
  assert.equal(uploads.at(-1).body, original);
});

test("Storage HTTP 요청에 실제 중단 신호를 전달하고 DB 호출은 그대로 둔다", async () => {
  const seen = [];
  const fetcher = async (_input, init) => { seen.push(init); return {}; };
  await fetchWithStorageTimeout("https://storage.test/storage/v1/object/bucket/file", { method: "POST" }, fetcher);
  await fetchWithStorageTimeout("https://storage.test/rest/v1/products", {}, fetcher);
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(seen[1].signal, undefined);
});

test("축소본 저장 실패 시 원본은 업로드하지 않고 이번 시도의 잔여 파일만 정리한다", async () => {
  const { client, uploads, removed } = setup(2);
  await assert.rejects(uploadProductImage(client, "product-covers", "register/new.png", original, variants), (error) => error.statusCode === "403");
  assert.equal(uploads.length, 2);
  assert.equal(removed.length, 4);
  assert.ok(removed.every((path) => path.includes("register/new.png")));
});

test("스캐너 사진 삭제 시 원본과 모든 축소본을 함께 정리한다", async () => {
  const { client, removed } = setup();
  await removeProductImage(client, "inspection-images", "scan/a.png");
  assert.equal(removed.length, 4);
  assert.ok(removed.includes("scan/a.png"));
});

test("변환 미완료 결과는 저장소 호출 전에 거부한다", async () => {
  const { client, uploads } = setup();
  await assert.rejects(uploadProductImage(client, "product-covers", "a.png", original, variants.slice(0, 2)), /준비되지/);
  assert.equal(uploads.length, 0);
});

test("요청 시간 초과는 실제 신호를 중단하고 재시도한다", async () => {
  const signals = [];
  await assert.rejects(storageRequest((signal) => { signals.push(signal); return new Promise(() => {}); }, { attempts: 2, timeoutMs: 5 }), /초과/);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});
