import test from "node:test";
import assert from "node:assert/strict";
import { prepareStudioImagePayload } from "../src/lib/studioClient.js";

function mockImages(t, { width, height, sourceDataUrl, canvas }) {
  const originals = Object.fromEntries(["FileReader", "Image", "document"].map((key) => [key, globalThis[key]]));
  globalThis.FileReader = class {
    readAsDataURL() { this.result = sourceDataUrl; queueMicrotask(() => this.onload()); }
  };
  globalThis.Image = class {
    naturalWidth = width;
    naturalHeight = height;
    set src(_value) { queueMicrotask(() => this.onload()); }
  };
  globalThis.document = { createElement: () => canvas() };
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
}

test("CZUR 크기의 전송 가능한 원본은 1600px 축소 없이 그대로 보낸다", async (t) => {
  mockImages(t, { width: 2108, height: 2888, sourceDataUrl: "data:image/jpeg;base64,originalBytes", canvas: () => { throw new Error("원본 재압축 금지"); } });
  assert.deepEqual(await prepareStudioImagePayload({}), { mimeType: "image/jpeg", imageBase64: "originalBytes" });
});

test("큰 원본만 3072px 이내로 축소하고 전송 크기에 맞게 압축한다", async (t) => {
  const qualities = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: (_mime, quality) => {
    qualities.push(quality);
    return `data:image/jpeg;base64,${qualities.length === 1 ? "a".repeat(3_000_001) : "compressed"}`;
  } };
  mockImages(t, { width: 4000, height: 6000, sourceDataUrl: "data:image/jpeg;base64,source", canvas: () => canvas });
  assert.deepEqual(await prepareStudioImagePayload({}), { mimeType: "image/jpeg", imageBase64: "compressed" });
  assert.equal(canvas.width, 2048);
  assert.equal(canvas.height, 3072);
  assert.deepEqual(qualities, [0.9, 0.82]);
});
