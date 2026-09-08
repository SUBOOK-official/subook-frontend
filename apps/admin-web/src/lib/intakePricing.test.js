import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIntakePricing, intakeDiscountError, quickIntakeInspection } from './intakePricing.js';
import { newIntakeGroup, patchIntakeGroup, collectionPending } from './intakeCollection.js';
import { newIntakeVariant, intakeBatchVariants, resolveIntakeVariant } from './intakeWorkbench.js';

test('정액·정률 할인은 정가 변경에 따라 원 단위 반올림하며 직접 판매가는 할인 설정을 해제한다', () => {
  let item = applyIntakePricing({}, { original_price: '20001', discount_type: 'rate', discount_value: '50' });
  assert.equal(item.price, '10001');
  item = applyIntakePricing(item, { original_price: '30000' });
  assert.equal(item.price, '15000');
  item = applyIntakePricing(item, { discount_type: 'amount', discount_value: '3000' });
  assert.equal(item.price, '27000');
  item = applyIntakePricing(item, { price: '12345' });
  assert.equal(item.discount_type, 'none');
  assert.equal(item.discount_value, '');
  assert.equal(item.price, '12345');
});

test('정가 미상·잘못된 할인값은 빈 판매가로 차단하며 0%도 유효하다', () => {
  for (const patch of [
    { original_price: '' }, { discount_value: '' }, { discount_value: '-1' },
    { discount_value: '100' }, { discount_value: '0.5' }, { original_price: '1', discount_value: '99' },
  ]) {
    const item = applyIntakePricing({}, { original_price: '20000', discount_type: 'rate', discount_value: '30', ...patch });
    assert(intakeDiscountError(item));
    assert.equal(item.price, '');
  }
  assert(intakeDiscountError({ original_price: '100', discount_type: 'amount', discount_value: '100' }));
  const zero = applyIntakePricing({}, { original_price: '20000', discount_type: 'rate', discount_value: 0 });
  assert.equal(zero.price, '20000');
  assert.equal(intakeBatchVariants({ ...zero, variants: [newIntakeVariant('1회')] })[0].discount_value, 0);
});

test('일괄 할인과 빠른 검수는 옵션 예외를 보존하고 최종 요청에 계산 결과를 고정한다', () => {
  let group = patchIntakeGroup(newIntakeGroup('A-1'), {
    title_core: '서바이벌', subject: '수학', brand: '시대인재', published_year: '2027', book_type: '모의고사',
    original_price: '20000', discount_type: 'rate', discount_value: '40', is_public: false,
    variants: [newIntakeVariant('1회'), { ...newIntakeVariant('2회'), price: '9000', condition_grade: 'A_PLUS', writing_percentage: '2', has_damage: true }],
  });
  group = patchIntakeGroup(group, quickIntakeInspection());
  assert.equal(group.components_confirmed, true);
  assert.equal(resolveIntakeVariant(group, group.variants[0]).condition_grade, 'S');
  const pending = collectionPending([group]);
  const rows = pending.groups[0].variants;
  assert.equal(rows[0].price, '12000');
  assert.equal(rows[0].discount_type, 'rate');
  assert.equal(rows[1].price, '9000');
  assert.equal(rows[1].discount_type, 'none');
  assert.equal(rows[1].condition_grade, 'A_PLUS');
  assert.equal(rows[1].writing_percentage, '2');
  assert.equal(rows[1].has_damage, true);
  group = patchIntakeGroup(group, { variants: [group.variants[1]] });
  assert.equal(group.price, '9000');
  assert.equal(group.discount_type, 'none');
  assert.equal(group.condition_grade, 'A_PLUS');
});
