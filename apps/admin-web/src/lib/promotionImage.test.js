import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { preparePromotionImage, promotionImageDimensions, PROMOTION_SOURCE_MAX_BYTES } from "./promotionImage.js";

const originalDocument = globalThis.document;
const originalDecode = globalThis.createImageBitmap;
afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalDecode === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalDecode;
});

function imageFile(bytes, type = "image/png", animated = false) {
  const data = new Uint8Array(bytes);
  if (type === "image/png") data.set([0, 0, 0, 0, 73, 68, 65, 84], 8); // IDAT header
  if (type === "image/webp" && animated) { data.set([86, 80, 56, 88], 12); data[20] = 2; }
  return new File([data], "test.png", { type });
}

function browser({ width = 3200, height = 500, encodeSize = 180000, encodeType = "image/webp", encodeFails = false } = {}) {
  const state = { closed: false, encodes: 0, draws: [], decodeOptions: null };
  globalThis.createImageBitmap = async (_file, options) => { state.decodeOptions = options; return { width, height, close() { state.closed = true; } }; };
  const context = { drawImage(...args) { state.draws.push(args.slice(1)); } };
  state.canvas = { width: 0, height: 0, getContext: () => context, toBlob(callback) { state.encodes += 1; callback(encodeFails ? null : new Blob([new Uint8Array(encodeSize)], { type: encodeType })); } };
  globalThis.document = { createElement: () => state.canvas };
  return state;
}

test("가로 배너·세로 팝업은 잘라내지 않고 용도별 크기로 축소한다", () => {
  assert.deepEqual(promotionImageDimensions(6400, 1000), { width: 3200, height: 500 });
  assert.deepEqual(promotionImageDimensions(4000, 1000, { mobile: true }), { width: 1280, height: 320 });
  assert.deepEqual(promotionImageDimensions(2400, 4000, { placement: "home_popup" }), { width: 1200, height: 2000 });
  assert.deepEqual(promotionImageDimensions(400, 300), { width: 400, height: 300 });
});

test("5MB 넘는 PNG 원본도 변환 후 업로드 크기의 WebP 파일이 된다", async () => {
  const state = browser({ width: 6400, height: 1000 });
  const result = await preparePromotionImage(imageFile(8 * 1024 * 1024));
  assert.equal(result.file.type, "image/webp");
  assert.equal(result.file.name, "test.webp");
  assert.equal(result.outputBytes, 180000);
  assert.equal(result.width, 3200);
  assert.equal(result.height, 500);
  assert.ok(result.savedPercent > 95);
  assert.equal(state.decodeOptions.imageOrientation, "from-image");
  assert.deepEqual(state.draws[0], [0, 0, 3200, 500]);
  assert.equal(state.closed, true);
  assert.equal(state.canvas.width, 1);
});

test("작은 WebP는 재압축·확대하지 않는다", async () => {
  const state = browser({ width: 1200, height: 1998 });
  const original = imageFile(164046, "image/webp");
  const result = await preparePromotionImage(original, { placement: "home_popup" });
  assert.equal(result.file, original);
  assert.equal(result.optimized, false);
  assert.equal(state.encodes, 0);
  assert.equal(state.closed, true);
});

test("변환 결과가 더 커지면 원본 파일을 유지한다", async () => {
  browser({ encodeSize: 200000 });
  const original = imageFile(50000, "image/jpeg");
  const result = await preparePromotionImage(original);
  assert.equal(result.file, original);
  assert.equal(result.savedPercent, 0);
});

test("WebP 인코딩 미지원 시 실제 PNG 형식에 맞는 파일명·MIME을 사용한다", async () => {
  const state = browser({ encodeType: "image/png", encodeSize: 700000 });
  const result = await preparePromotionImage(imageFile(8 * 1024 * 1024));
  assert.equal(result.file.type, "image/png");
  assert.equal(result.file.name, "test.png");
  assert.equal(state.encodes, 1);
});

test("움직이는 WebP를 정지 이미지로 바꾸지 않는다", async () => {
  const state = browser();
  const original = imageFile(100000, "image/webp", true);
  const result = await preparePromotionImage(original);
  assert.equal(result.file, original);
  assert.equal(result.animated, true);
  assert.equal(state.encodes, 0);
  await assert.rejects(preparePromotionImage(imageFile(6 * 1024 * 1024, "image/webp", true)), /움직이는 이미지/);
});

test("APNG의 애니메이션 청크를 찾아 원본 움직임을 유지한다", async () => {
  const state = browser();
  const data = new Uint8Array(100000);
  // PNG signature 다음 13바이트 IHDR 청크를 건너뛰어 acTL을 읽는다.
  data.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  data.set([0, 0, 0, 8, 97, 99, 84, 76], 33);
  const original = new File([data], "animated.png", { type: "image/png" });
  const result = await preparePromotionImage(original, { placement: "home_popup" });
  assert.equal(result.file, original);
  assert.equal(result.animated, true);
  assert.equal(state.encodes, 0);
  assert.equal(state.closed, true);
});

test("큰 원본·미지원 형식·손상 파일과 변환 실패를 안내하고 리소스를 해제한다", async () => {
  await assert.rejects(preparePromotionImage({ type: "image/png", size: PROMOTION_SOURCE_MAX_BYTES + 1 }), /25MB/);
  await assert.rejects(preparePromotionImage({ type: "image/svg+xml", size: 100 }), /JPG/);
  await assert.rejects(preparePromotionImage({ type: "image/png", size: 0 }), /빈 이미지/);
  const state = browser({ encodeFails: true });
  await assert.rejects(preparePromotionImage(imageFile(100000)), /변환에 실패/);
  assert.equal(state.closed, true);
  assert.equal(state.canvas.width, 1);
  globalThis.createImageBitmap = async () => { throw Error("broken image"); };
  await assert.rejects(preparePromotionImage(imageFile(100000)), /이미지를 읽지 못/);
});
