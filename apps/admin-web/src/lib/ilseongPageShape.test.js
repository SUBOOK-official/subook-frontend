import assert from "node:assert/strict";
import test from "node:test";

import { B5_ASPECT, commonAspect, fitInShape, needsPadNotice, sameAspect, shapeName, shapeOf, snapAspect } from "./ilseongPageShape.js";

test("B5와 거의 같은 판형은 B5로 맞춘다", () => {
  assert.equal(snapAspect(257 / 182), B5_ASPECT);
  // A4·A5(1.4142)
  assert.equal(snapAspect(297 / 210), B5_ASPECT);
  // 신국판 152×225(1.4803)은 다른 모양이다
  assert.equal(snapAspect(225 / 152), 1.4803);
  assert.equal(snapAspect(Number.NaN), B5_ASPECT);
});

test("너무 길쭉한 모양은 받는 범위 끝으로 맞춘다", () => {
  assert.equal(snapAspect(0.2), 0.4);
  assert.equal(snapAspect(5), 2.5);
});

test("B5 세로의 이미지는 2000×2825이고, 다른 모양도 넓이가 같다", () => {
  assert.deepEqual(shapeOf(B5_ASPECT), { aspect: B5_ASPECT, width: 2000, height: 2825 });
  const wide = shapeOf(210 / 297);
  assert.equal(wide.aspect, 0.7071);
  assert.ok(wide.width > wide.height);
  assert.ok(Math.abs(wide.width * wide.height - 2000 * 2825) < 2000 * 2825 * 0.002);
  // 앱 서버가 받는 크기(가로 1000px 이상, 한 변 6000px 이하)
  for (const aspect of [0.4, 0.7071, 1, 1.4125, 2.5]) {
    const shape = shapeOf(aspect);
    assert.ok(shape.width >= 1000 && shape.height >= 600 && shape.width <= 6000 && shape.height <= 6000);
    assert.ok(Math.abs(shape.height / shape.width - shape.aspect) < shape.aspect * 0.001);
  }
});

test("교재의 쪽 모양은 가장 많은 쪽의 모양을 따른다", () => {
  const body = { width: 128, height: 188 };
  const cover = { width: 300, height: 188 };
  assert.equal(commonAspect([cover, body, body, body]), snapAspect(188 / 128));
  // 가로로 긴 교재
  assert.equal(commonAspect([{ width: 297, height: 210 }, { width: 297, height: 210 }]), 0.7071);
  // 쪽 수가 같으면 앞에 나온 모양
  assert.equal(commonAspect([{ width: 100, height: 100 }, { width: 100, height: 200 }]), 1);
  assert.equal(commonAspect([]), B5_ASPECT);
});

test("모양이 다른 쪽은 잘리지 않게 바탕 가운데에 넣는다", () => {
  const shape = shapeOf(B5_ASPECT);
  // 같은 모양이면 바탕을 꽉 채운다
  assert.deepEqual(fitInShape(182, 257, shape), { width: 2000, height: 2825, x: 0, y: 0 });
  // 가로로 긴 쪽은 위아래에 여백이 생긴다
  const wide = fitInShape(297, 210, shape);
  assert.equal(wide.width, 2000);
  assert.equal(wide.x, 0);
  assert.ok(wide.y > 0 && wide.y * 2 + wide.height <= 2825 + 1);
  assert.equal(needsPadNotice(297, 210, shape), true);
  assert.equal(needsPadNotice(210, 297, shape), false);
});

test("쪽 모양 이름과 같은 모양 판단", () => {
  assert.equal(shapeName(null), "");
  assert.equal(shapeName(B5_ASPECT), "");
  assert.equal(shapeName(0.7071), "가로로 긴 쪽");
  assert.equal(shapeName(1), "정사각형에 가까운 쪽");
  assert.equal(shapeName(1.4803), "B5보다 길쭉한 쪽");
  assert.equal(sameAspect(null, 1.4125), true);
  assert.equal(sameAspect(1.4125, 0.7071), false);
});
