import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntakePage, validIntakeCrop } from './intakePhotoCrop.js';

function fixture(pixel, width = 200, height = 160) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4, value = pixel(x, y);
    data.set([value, value, value, 255], index);
  }
  return { data, width, height };
}
test('검은 배경에서 펼친 두 쪽·글자를 포함한 종이 전체 영역을 유지한다', () => {
  const found = detectIntakePage(fixture((x, y) => {
    const paper = x >= 30 && x <= 170 && y >= 20 && y <= 140;
    const text = x >= 45 && x <= 155 && y > 35 && y < 120 && y % 12 < 2;
    return paper && !text && (x < 98 || x > 102) ? 235 : 15;
  }));
  assert(found);
  assert(validIntakeCrop(found.rect));
  assert(found.rect.x < 30 / 200 && found.rect.y < 20 / 160);
  assert(found.rect.x + found.rect.width >= 170 / 200);
  assert(found.rect.y + found.rect.height >= 140 / 160);
});
test('비스듬한 종이 외곽선을 얻고 판별이 어려운 사진은 원본을 유지한다', () => {
  const rotated = detectIntakePage(fixture((x, y) => Math.abs(x - 100) / 78 + Math.abs(y - 80) / 68 <= 1 ? 240 : 20));
  assert(rotated && rotated.polygon.length >= 4);
  assert.equal(detectIntakePage(fixture(() => 240)), null);
  assert.equal(detectIntakePage(fixture(() => 10)), null);
  assert.equal(detectIntakePage(fixture((x, y) => x < 160 && y > 10 && y < 150 ? 240 : 10)), null);
  assert.equal(detectIntakePage(fixture((x, y) => x > 90 && x < 110 && y > 60 && y < 90 ? 240 : 10)), null);
});
test('수동 자르기는 이미지 바깥이나 너무 작은 선택 영역을 차단한다', () => {
  assert(validIntakeCrop({ x: .1, y: .1, width: .8, height: .8 }));
  for (const rect of [{ x: -.1, y: 0, width: .5, height: .5 }, { x: .9, y: 0, width: .5, height: .5 }, { x: 0, y: 0, width: .01, height: .5 }, { x: NaN, y: 0, width: .5, height: .5 }]) assert(!validIntakeCrop(rect));
});
