import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOrderItems, summarizeOrderItems } from './orderItemGroups.js';

const item = (id, title, option, extra = {}) => ({
  id, title, option_label: option, condition_grade: 'S', quantity: 1, unit_price: 5000, total_price: 5000,
  book_location: '모8', book_serial_number: 2600 + id, refunded_at: null, ...extra,
});

test('같은 제목 품목을 첫 등장 순서로 묶고 회차는 숫자 순으로 정렬한다', () => {
  const groups = groupOrderItems([
    item(1, '김성도 모의고사 물리학1', '18'),
    item(2, '브릿지 전국 수학', '29', { unit_price: 5500, total_price: 5500 }),
    item(3, '김성도 모의고사 물리학1', '9'),
    item(4, '김성도 모의고사 물리학1', '13'),
  ]);
  assert.deepEqual(groups.map((group) => group.title), ['김성도 모의고사 물리학1', '브릿지 전국 수학']);
  assert.deepEqual(groups[0].items.map((row) => row.option_label), ['9', '13', '18']);
  assert.equal(groups[0].bookCount, 3);
  assert.equal(groups[0].amount, 15000);
  assert.equal(groups[0].sharedGrade, 'S');
  assert.equal(groups[0].sharedUnitPrice, 5000);
});

test('환불 품목은 묶음에 남기되 권수·금액·위치 미지정 집계에서 뺀다', () => {
  const summary = summarizeOrderItems([
    item(1, '교재 A', '1', { book_location: null }),
    item(2, '교재 A', '2', { refunded_at: '2026-09-15', book_location: null }),
    item(3, '교재 B', null, { quantity: 2, total_price: 10000 }),
    item(4, '교재 C', '1', { refunded_at: '2026-09-15' }),
  ]);
  assert.equal(summary.bookCount, 3);
  assert.equal(summary.titleCount, 2, '전량 환불된 교재 C는 종 수에서 제외');
  assert.equal(summary.refundedCount, 2);
  assert.equal(summary.missingLocationCount, 1);
  assert.equal(summary.groups[0].items.length, 2);
  assert.equal(summary.groups[0].amount, 5000);
});

test('등급·단가가 섞이면 공통값을 비워 품목별로 표시하게 한다', () => {
  const [group] = groupOrderItems([
    item(1, '교재', '1'),
    item(2, '교재', '2', { condition_grade: 'A_PLUS', unit_price: 4000, total_price: 4000 }),
  ]);
  assert.equal(group.sharedGrade, null);
  assert.equal(group.sharedUnitPrice, null);
});

test('제목이 비거나 목록이 아니어도 깨지지 않는다', () => {
  assert.deepEqual(groupOrderItems(null), []);
  const groups = groupOrderItems([item(7, '', null), item(8, null, null)]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, '제목 없음');
});
