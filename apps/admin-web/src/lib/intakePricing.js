export function intakeDiscountError(item) {
  const type = item.discount_type || 'none';
  if (!['none', 'amount', 'rate'].includes(type)) return '할인 방식을 확인하세요.';
  if (type === 'none') return '';
  const original = Number(item.original_price), value = Number(item.discount_value);
  if (!Number.isSafeInteger(original) || original < 1 || original > 2147483647) return '할인을 계산할 정가를 입력하세요. 정가 미상은 판매가 직접 입력을 사용하세요.';
  if (item.discount_value === '' || item.discount_value == null || !Number.isSafeInteger(value) || value < 0) return '할인값을 0 이상의 정수로 입력하세요.';
  if (type === 'rate' && value >= 100) return '정률 할인은 0~99%로 입력하세요.';
  if (type === 'amount' && value >= original) return '정액 할인은 정가보다 작게 입력하세요.';
  if (discountedIntakePrice(item) < 1) return '할인 후 판매가는 1원 이상이어야 합니다.';
  return '';
}
export function discountedIntakePrice(item) {
  const original = Number(item.original_price), value = Number(item.discount_value);
  return item.discount_type === 'rate' ? Math.round(original * (100 - value) / 100) : original - value;
}
export function applyIntakePricing(item, patch) {
  const next = { ...item, ...patch };
  if (Object.hasOwn(patch, 'price') && !Object.hasOwn(patch, 'discount_type')) {
    next.discount_type = 'none'; next.discount_value = '';
  }
  if (['discount_type', 'discount_value', 'original_price'].some((key) => Object.hasOwn(patch, key)) && ['amount', 'rate'].includes(next.discount_type)) {
    next.price = intakeDiscountError(next) ? '' : String(discountedIntakePrice(next));
  }
  if (next.discount_type === 'none') next.discount_value = '';
  return next;
}
export function quickIntakeInspection() {
  return { condition_grade: 'S', writing_percentage: '0', has_damage: false, components_confirmed: true, discard_reason: '' };
}
