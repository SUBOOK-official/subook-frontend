import assert from "node:assert/strict";
import test from "node:test";

import { COVER_LONG_SIDE, fitCoverSize } from "./ilseongCover.js";

test("표지 크기: 긴 쪽을 1600px까지 줄이고, 작은 그림은 그대로 둔다", () => {
  assert.deepEqual(fitCoverSize(2000, 2825), { width: Math.round((2000 * COVER_LONG_SIDE) / 2825), height: COVER_LONG_SIDE });
  assert.deepEqual(fitCoverSize(3200, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitCoverSize(600, 848), { width: 600, height: 848 });
});

test("표지 크기: 너무 작거나 읽지 못한 그림은 문구와 함께 막는다", () => {
  assert.throws(() => fitCoverSize(200, 2000), /너무 작아요/);
  assert.throws(() => fitCoverSize(0, 0), /읽지 못했어요/);
});
