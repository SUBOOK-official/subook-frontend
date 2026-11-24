import test from "node:test";
import assert from "node:assert/strict";
import { ROTATED_JPEG_QUALITY, rotateLandscapePhoto } from "./photoOrientation.js";

// 브라우저 캔버스를 흉내 내 회전본의 저장 형식·파일명·치수를 확인한다.
// 실제 픽셀 위치는 tests/photo-orientation.browser.html이 진짜 캔버스로 검증한다.
function fakeBrowser({ width, height, encodeAs = null }) {
  const calls = [];
  const canvases = [];
  const saved = { Image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
  globalThis.Image = class {
    set src(_value) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0 };
      canvases.push(canvas);
      canvas.getContext = () => ({
        fillRect: (...args) => calls.push(["fillRect", ...args]),
        setTransform: (...args) => calls.push(["setTransform", ...args]),
        drawImage: (_image, x, y) => calls.push(["drawImage", x, y]),
      });
      canvas.toBlob = (done, type, quality) => {
        calls.push(["toBlob", type, quality]);
        done(new Blob([new Uint8Array(8)], { type: encodeAs || type }));
      };
      return canvas;
    },
  };
  return {
    calls,
    canvases,
    restore() {
      globalThis.Image = saved.Image;
      globalThis.document = saved.document;
      URL.createObjectURL = saved.create;
      URL.revokeObjectURL = saved.revoke;
    },
  };
}

const photo = (name, type) => new File([new Uint8Array(10)], name, { type, lastModified: 1234 });

test("세로·정사각 사진은 캔버스를 만들지 않고 원본 File을 그대로 돌려준다", async () => {
  for (const [width, height] of [[3000, 4000], [2000, 2000]]) {
    const browser = fakeBrowser({ width, height });
    try {
      const source = photo("IMG_0001.jpg", "image/jpeg");
      assert.equal(await rotateLandscapePhoto(source), source);
      assert.equal(browser.canvases.length, 0);
    } finally {
      browser.restore();
    }
  }
});

test("가로로 찍은 JPG·WebP 사진은 세로로 돌려 JPEG로 저장한다", async () => {
  for (const [name, type] of [["IMG_0001.JPG", "image/jpeg"], ["cover.webp", "image/webp"]]) {
    const browser = fakeBrowser({ width: 4000, height: 3000 });
    try {
      const result = await rotateLandscapePhoto(photo(name, type));
      assert.equal(result.type, "image/jpeg");
      assert.equal(result.name, `${name.replace(/\.[^/.]+$/, "")}_portrait.jpg`);
      assert.equal(result.lastModified, 1234);
      // 폭과 높이만 맞바꾼다 — 축소·크롭 없음
      assert.deepEqual({ width: browser.canvases[0].width, height: browser.canvases[0].height }, { width: 3000, height: 4000 });
      // 흰 바탕 → 시계 방향 90도 → 원본 크기 그대로 그리기 → JPEG 고화질 저장 순서
      assert.deepEqual(browser.calls, [
        ["fillRect", 0, 0, 3000, 4000],
        ["setTransform", 0, 1, -1, 0, 3000, 0],
        ["drawImage", 0, 0],
        ["toBlob", "image/jpeg", ROTATED_JPEG_QUALITY],
      ]);
    } finally {
      browser.restore();
    }
  }
  assert.ok(ROTATED_JPEG_QUALITY >= 0.95);
});

test("PNG·GIF 원본은 무손실 그대로 PNG로 저장한다", async () => {
  for (const [name, type] of [["scan.png", "image/png"], ["cover.gif", "image/gif"]]) {
    const browser = fakeBrowser({ width: 71, height: 29 });
    try {
      const result = await rotateLandscapePhoto(photo(name, type));
      assert.equal(result.type, "image/png");
      assert.equal(result.name, `${name.replace(/\.[^/.]+$/, "")}_portrait.png`);
      assert.equal(browser.calls.some(([call]) => call === "fillRect"), false);
      assert.equal(browser.calls.at(-1)[1], "image/png");
    } finally {
      browser.restore();
    }
  }
});

test("브라우저가 JPEG 대신 PNG를 돌려주면 실제 형식에 파일명을 맞춘다", async () => {
  const browser = fakeBrowser({ width: 4000, height: 3000, encodeAs: "image/png" });
  try {
    const result = await rotateLandscapePhoto(photo("IMG_0002.jpg", "image/jpeg"));
    assert.equal(result.type, "image/png");
    assert.equal(result.name, "IMG_0002_portrait.png");
  } finally {
    browser.restore();
  }
});
