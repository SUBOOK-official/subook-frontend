import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDetailImageUrl,
  getThumbnailImageUrl,
  getZoomImageUrl,
  toSupabaseRenderUrl,
} from "./storageImage.js";

const OBJECT_URL =
  "https://affeayqergefwudytfop.supabase.co/storage/v1/object/public/product-covers/sixshop/A.png";

test("object/public URL을 render/image 변환 URL로 바꾸고 width·quality를 붙인다", () => {
  const out = toSupabaseRenderUrl(OBJECT_URL, { width: 400, quality: 70 });
  assert.equal(
    out,
    "https://affeayqergefwudytfop.supabase.co/storage/v1/render/image/public/product-covers/sixshop/A.png?width=400&quality=70",
  );
});

test("data: URI(목업 SVG)는 변환하지 않고 원본 그대로 반환한다", () => {
  const dataUri = "data:image/svg+xml;utf8,<svg>SUBOOK MOCK</svg>";
  assert.equal(getThumbnailImageUrl(dataUri), dataUri);
});

test("스토리지 밖 외부 URL은 건드리지 않는다", () => {
  const external = "https://cdn.example.com/foo.jpg";
  assert.equal(toSupabaseRenderUrl(external, { width: 400 }), external);
});

test("null·빈 문자열·비문자열은 안전하게 그대로 반환한다", () => {
  assert.equal(toSupabaseRenderUrl(null), null);
  assert.equal(toSupabaseRenderUrl(""), "");
  assert.equal(toSupabaseRenderUrl(undefined), undefined);
  assert.equal(toSupabaseRenderUrl(42), 42);
});

test("이미 쿼리스트링이 있어도 render/image로 바꾸고 width를 병합한다", () => {
  const withQuery = `${OBJECT_URL}?token=abc`;
  const out = toSupabaseRenderUrl(withQuery, { width: 300 });
  assert.ok(out.includes("/render/image/public/product-covers/sixshop/A.png?"));
  assert.ok(out.includes("token=abc"));
  assert.ok(out.includes("width=300"));
});

test("사이즈별 헬퍼가 용도에 맞는 width를 적용한다", () => {
  assert.ok(getThumbnailImageUrl(OBJECT_URL).includes("width=400"));
  assert.ok(getDetailImageUrl(OBJECT_URL).includes("width=900"));
  assert.ok(getZoomImageUrl(OBJECT_URL).includes("width=1600"));
});

test("quality를 명시적으로 0 이하로 주면 quality 파라미터를 생략한다", () => {
  const out = toSupabaseRenderUrl(OBJECT_URL, { width: 400, quality: 0 });
  assert.ok(out.includes("width=400"));
  assert.ok(!out.includes("quality="));
});
