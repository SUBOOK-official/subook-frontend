import test from "node:test";
import assert from "node:assert/strict";
import { SHRINK_STEPS, encodeWithinLimit, shrinkImageToLimit } from "./imageShrink.js";

const MB = 1024 * 1024;

test("화질을 먼저 낮추고 그다음 크기를 줄인다 — 원본 크기 단계가 앞에 온다", () => {
  assert.deepEqual(SHRINK_STEPS[0], { scale: 1, quality: 0.95 });
  const firstScaled = SHRINK_STEPS.findIndex((step) => step.scale < 1);
  assert.ok(firstScaled >= 2);
  assert.ok(SHRINK_STEPS.slice(0, firstScaled).every((step) => step.scale === 1));
  assert.ok(SHRINK_STEPS.slice(firstScaled).every((step) => step.scale < 1));
});

test("한도 안에 드는 첫 단계에서 멈춘다", async () => {
  const tried = [];
  const sizes = [20 * MB, 16 * MB, 15 * MB, 9 * MB];
  const blob = await encodeWithinLimit(async (step) => {
    tried.push(step);
    return { size: sizes[tried.length - 1], type: "image/jpeg" };
  }, 15 * MB);
  assert.equal(blob.size, 15 * MB);
  assert.equal(tried.length, 3);
});

test("캔버스가 실패한 단계(null·빈 결과)는 건너뛰고, 끝까지 넘으면 null", async () => {
  let calls = 0;
  const recovered = await encodeWithinLimit(async () => {
    calls += 1;
    return calls < 4 ? (calls === 1 ? null : { size: 0 }) : { size: MB, type: "image/jpeg" };
  }, 15 * MB);
  assert.equal(recovered.size, MB);
  assert.equal(calls, 4);

  let all = 0;
  assert.equal(await encodeWithinLimit(async () => { all += 1; return { size: 16 * MB }; }, 15 * MB), null);
  assert.equal(all, SHRINK_STEPS.length);
});

// 브라우저 캔버스를 흉내 내 실제 축소 함수의 흐름(디코딩 → 단계별 인코딩 → File)을 확인한다.
function fakeBrowser({ width, height, sizeFor }) {
  const drawn = [];
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
      canvas.getContext = () => ({ fillRect() {}, drawImage: (_image, _x, _y, w, h) => drawn.push({ w, h }) });
      canvas.toBlob = (done, type, quality) => {
        const size = sizeFor({ width: canvas.width, height: canvas.height, quality });
        done(size == null ? null : new Blob([new Uint8Array(size)], { type }));
      };
      return canvas;
    },
  };
  return {
    drawn,
    restore() {
      globalThis.Image = saved.Image;
      globalThis.document = saved.document;
      URL.createObjectURL = saved.create;
      URL.revokeObjectURL = saved.revoke;
    },
  };
}

test("회전된 PNG는 원본 크기 그대로 JPEG로 바꿔 한도 안에 넣는다", async () => {
  const browser = fakeBrowser({ width: 3000, height: 4000, sizeFor: () => 2000 });
  try {
    const source = new File([new Uint8Array(10)], "IMG_0001_portrait.png", { type: "image/png", lastModified: 1234 });
    const result = await shrinkImageToLimit(source, 5000);
    assert.equal(result.name, "IMG_0001_portrait.jpg");
    assert.equal(result.type, "image/jpeg");
    assert.equal(result.size, 2000);
    assert.equal(result.lastModified, 1234);
    assert.deepEqual(browser.drawn, [{ w: 3000, h: 4000 }]);
  } finally {
    browser.restore();
  }
});

test("화질만으로 안 되면 크기를 줄이고, 끝내 안 되면 안내한다", async () => {
  const scaled = fakeBrowser({ width: 4000, height: 6000, sizeFor: ({ width }) => (width < 4000 ? 3000 : 9000) });
  try {
    const result = await shrinkImageToLimit(new File([new Uint8Array(10)], "big.jpeg", { type: "image/jpeg" }), 5000);
    assert.equal(result.name, "big.jpg");
    assert.deepEqual(scaled.drawn.at(-1), { w: 3000, h: 4500 });
    assert.equal(scaled.drawn.length, 4);
  } finally {
    scaled.restore();
  }

  const hopeless = fakeBrowser({ width: 4000, height: 6000, sizeFor: () => null });
  try {
    await assert.rejects(
      shrinkImageToLimit(new File([new Uint8Array(10)], "big.png", { type: "image/png" }), 5000),
      /용량을 줄이지 못했습니다/,
    );
  } finally {
    hopeless.restore();
  }
});
