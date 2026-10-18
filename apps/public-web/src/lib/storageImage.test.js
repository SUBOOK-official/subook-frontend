import assert from "node:assert/strict";
import { test } from "node:test";
import { getDetailImageUrl, getThumbnailImageUrl, getZoomImageUrl, getOriginalImageUrl, installStorageImageFallback } from "../../../../packages/shared-domain/src/storageImage.js";
import { imageVariantDimensions } from "../../../../packages/shared-domain/src/createImageVariants.js";
import { toStoredCoverUrl } from "../../api/prerender-product.js";

const ROOT = "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/";
const SOURCE = `${ROOT}product-covers/sixshop/A.png`;

test("원본 URL은 DB 변경 없이 세 가지 사전 생성 파일로 연결된다", () => {
  for (const [fn, size] of [[getThumbnailImageUrl, 400], [getDetailImageUrl, 900], [getZoomImageUrl, 1600]]) {
    const url = fn(SOURCE);
    assert.equal(url, `${ROOT}product-covers/__variants/v1/sixshop/A.png.${size}.jpg`);
    assert.equal(getOriginalImageUrl(url), SOURCE);
    assert.ok(!url.includes("/render/image/"));
  }
});

test("상세 사진의 공백·한글·쿼리·확장자를 안전하게 보존한다", () => {
  const source = `${ROOT}inspection-images/scan/교재 사진.PNG?v=2`;
  const variant = getDetailImageUrl(source);
  assert.equal(getOriginalImageUrl(variant), new URL(source).href);
  assert.ok(variant.endsWith(".PNG.900.jpg?v=2"));
});

test("이미 최적화된 URL은 이중 변환하지 않는다", () => {
  const variant = getThumbnailImageUrl(SOURCE);
  assert.equal(getThumbnailImageUrl(variant), variant);
});

test("후기·기타 버킷은 원본 직접 제공, 레거시 변환 URL도 과금 경로 제거", () => {
  const review = `${ROOT}review-images/user/a.jpg`;
  assert.equal(getThumbnailImageUrl(review), review);
  const legacy = SOURCE.replace("/object/public/", "/render/image/public/") + "?width=200&quality=50&v=2";
  assert.equal(getThumbnailImageUrl(legacy), getThumbnailImageUrl(SOURCE) + "?v=2");
});

test("외부·비공개·목업·잘못된 값은 그대로 유지한다", () => {
  for (const value of [null, undefined, 42, "", "data:image/svg+xml,<svg/>", "https://example.com/storage/v1/object/public/product-covers/a.png",
    "https://x.supabase.co/storage/v1/object/sign/product-covers/a.png?token=abc"]) {
    assert.equal(getThumbnailImageUrl(value), value);
  }
});

test("세로·가로·작은 사진 모두 비율을 유지하고 작은 원본은 확대하지 않는다", () => {
  assert.deepEqual(imageVariantDimensions(1200, 1800, 400), { width: 400, height: 600 });
  assert.deepEqual(imageVariantDimensions(1800, 1200, 900), { width: 900, height: 600 });
  assert.deepEqual(imageVariantDimensions(100, 200, 400), { width: 100, height: 200 });
  assert.throws(() => imageVariantDimensions(0, 10, 400), /크기/);
});

test("누락 축소본은 원본으로 한 번 복구하고 원본 오류는 기존 핸들러로 전달한다", () => {
  let listener;
  let installs = 0;
  const target = { addEventListener: (_name, handler, capture) => { installs++; listener = handler; assert.equal(capture, true); } };
  installStorageImageFallback(target);
  installStorageImageFallback(target);
  const image = { tagName: "IMG", src: getThumbnailImageUrl(SOURCE), removeAttribute: () => {} };
  let stopped = 0;
  listener({ target: image, stopImmediatePropagation: () => stopped++ });
  assert.equal(image.src, SOURCE);
  listener({ target: image, stopImmediatePropagation: () => stopped++ });
  assert.equal(stopped, 1);
  assert.equal(installs, 1);
});

test("검색봇·공유 미리보기도 실제 저장된 확대 파일을 사용한다", () => {
  assert.equal(toStoredCoverUrl(SOURCE), getZoomImageUrl(SOURCE));
  assert.equal(toStoredCoverUrl("https://external.test/a.jpg"), "https://external.test/a.jpg");
});
