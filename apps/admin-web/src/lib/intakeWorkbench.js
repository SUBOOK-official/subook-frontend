export const INTAKE_STEPS = ['표지 촬영', '교재 확인', '상태 확인', '가격 결정', '등록'];
export const MAX_INTAKE_OPTIONS = 100;
export const MAX_INTAKE_BOOKS = 300;
export function blankIntake(location = '') {
  return {
    requestKey: crypto.randomUUID(), step: 0, product_id: null, title: '', option: '',
    subject: '', brand: '', book_type: '', published_year: '', instructor_name: '',
    condition_grade: '', writing_percentage: '', has_damage: null, components_confirmed: false,
    inspection_notes: '', discard_reason: '', price: '', original_price: '', location,
    serial_number: '', cover_image_url: '', scan_image_url: '', inspection_image_urls: [],
    is_public: true, options: [], variants: [newIntakeVariant()],
  };
}

export function intakeError(item, step) {
  if (step >= 1 && !item.variants?.length) return '등록할 옵션을 추가하세요. 기본 구성은 이름을 비워두어도 됩니다.';
  if (isIntakeBatch(item)) return batchIntakeError(item, step);
  if (item.variants?.length && Number(item.variants[0].quantity) !== 1) return '수량은 1~100권으로 입력하세요.';
  return singleIntakeError(item.variants?.[0] ? resolveIntakeVariant(item, item.variants[0]) : item, step);
}

function singleIntakeError(item, step) {
  if (step >= 1 && !item.title.trim()) return '교재를 선택하거나 교재명을 입력하세요.';
  if (step >= 1 && !item.product_id && (!item.subject || !item.brand || !item.book_type || !/^20\d{2}$|^2100$/.test(String(item.published_year)))) {
    return '신규 교재의 과목·브랜드·유형·학년도를 확인하세요.';
  }
  if (step >= 2) {
    if (!['S', 'A_PLUS', 'A', 'DISCARD'].includes(item.condition_grade)) return '등급을 선택하세요.';
    if (item.condition_grade === 'DISCARD') {
      return item.discard_reason.trim() ? '' : '판매불가 사유를 입력하세요.';
    }
    if (item.writing_percentage === '' || !Number.isInteger(Number(item.writing_percentage)) || Number(item.writing_percentage) < 0 || Number(item.writing_percentage) > 100) return '필기 비율을 0~100 사이의 정수로 입력하세요.';
    if (item.has_damage === null || !item.components_confirmed) return '손상 여부와 답지·구성품 확인을 완료하세요.';
  }
  if (step >= 3 && (!Number.isSafeInteger(Number(item.price)) || Number(item.price) < 1 || Number(item.price) > 2147483647)) return '판매가를 1원 이상의 정수로 입력하세요.';
  if (item.original_price !== '' && (!Number.isSafeInteger(Number(item.original_price)) || Number(item.original_price) < 1 || Number(item.original_price) > 2147483647)) return '정가를 확인하거나 미상으로 비워두세요.';
  if (step >= 4) {
    if (!item.location.trim()) return '보관 위치를 입력하세요.';
    if (item.is_public && !item.cover_image_url) return '표지를 준비하거나 비공개 등록을 선택하세요.';
    if (item.serial_number !== '' && (!Number.isSafeInteger(Number(item.serial_number)) || Number(item.serial_number) < 1 || Number(item.serial_number) > 2147483647)) return '일련번호는 1 이상의 정수로 입력하세요.';
  }
  return '';
}

export function newIntakeVariant(option = '', quantity = '1') {
  return { id: crypto.randomUUID(), option, quantity: String(quantity), price: '',
    condition_grade: '', writing_percentage: '', has_damage: null, inspection_notes: '' };
}
export function isIntakeBatch(item) {
  return item.variants?.length > 1 || Number(item.variants?.[0]?.quantity) > 1;
}

// 마지막 옵션 하나만 남으면 개별 상태·가격을 기본 입력란으로 옮겨 숨은 예외값을 없앤다.
export function updateIntake(item, values) {
  const updated = { ...item, ...values };
  const row = updated.variants?.[0];
  if (updated.variants?.length !== 1 || Number(row.quantity) !== 1) return { ...updated, option: '' };
  return { ...resolveIntakeVariant(updated, row), variants: [{ ...newIntakeVariant(row.option), id: row.id }] };
}

export function restoreIntake(draft) {
  const { mode, ...saved } = draft;
  const variants = mode === 'single' || !Array.isArray(saved.variants)
    ? [newIntakeVariant(saved.option || '')] : saved.variants;
  return updateIntake({ ...blankIntake(), ...saved }, { variants });
}

// 새 교재의 인식·선택 결과는 빈 기본 행만 채운다. 직접 작성한 옵션은 보존한다.
export function suggestIntakeOption(item, option) {
  return item.variants.length === 1 && isEmptyIntakeVariant(item.variants[0])
    ? [{ ...item.variants[0], option: option || '' }] : item.variants;
}

function isEmptyIntakeVariant(row) {
  return !row.option.trim() && Number(row.quantity) === 1 && row.price === ''
    && !row.condition_grade && row.writing_percentage === '' && row.has_damage === null && !row.inspection_notes;
}

export function appendIntakeVariants(current, added) {
  const rows = current.length === 1 && isEmptyIntakeVariant(current[0]) && added.some((row) => optionKey(row.option))
    ? [] : current;
  return mergeIntakeVariants(rows, added);
}

export function optionKey(option) { return String(option).normalize('NFKC').trim().toLocaleLowerCase(); }
export function createIntakeRange(start, end, prefix = '', suffix = '회', quantity = '1') {
  const first = Number(start), last = Number(end), count = Number(quantity);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > 9999
    || last - first + 1 > MAX_INTAKE_OPTIONS) throw new Error('숫자 범위는 1~9999 사이, 한 번에 최대 100개로 입력하세요.');
  if (!Number.isInteger(count) || count < 1 || count > 100 || (last - first + 1) * count > MAX_INTAKE_BOOKS) throw new Error('옵션당 1~100권, 한 번에 총 300권까지 등록할 수 있습니다.');
  return Array.from({ length: last - first + 1 }, (_, index) => newIntakeVariant(`${prefix}${first + index}${suffix}`, count));
}
export function mergeIntakeVariants(current, added) {
  const seen = new Set(current.map((row) => optionKey(row.option)).filter(Boolean));
  const result = [...current];
  for (const row of added) {
    const key = optionKey(row.option);
    if (!key || !seen.has(key)) { result.push(row); if (key) seen.add(key); }
  }
  if (result.length > MAX_INTAKE_OPTIONS || intakeBookCount({ variants: result }) > MAX_INTAKE_BOOKS) throw new Error('한 번에 옵션 100개, 총 300권까지 등록할 수 있습니다.');
  return result;
}
export function intakeBookCount(item) { return (item.variants || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0); }
export function resolveIntakeVariant(item, row) {
  return { ...item, option: row.option,
    price: row.price === '' ? item.price : row.price,
    condition_grade: row.condition_grade || item.condition_grade,
    writing_percentage: row.writing_percentage === '' ? item.writing_percentage : row.writing_percentage,
    has_damage: row.has_damage === null ? item.has_damage : row.has_damage,
    inspection_notes: row.inspection_notes || item.inspection_notes };
}
export function intakeBatchVariants(item) {
  return item.variants.map((row) => {
    const resolved = resolveIntakeVariant(item, row);
    return { option: row.option.trim(), quantity: Number(row.quantity), price: resolved.price,
      condition_grade: resolved.condition_grade, writing_percentage: resolved.writing_percentage,
      has_damage: resolved.has_damage, inspection_notes: resolved.inspection_notes };
  });
}
function batchIntakeError(item, step) {
  const rows = item.variants || [];
  if (step >= 1) {
    if (!rows.length || rows.length > MAX_INTAKE_OPTIONS) return '등록할 옵션을 1~100개 추가하세요.';
    const seen = new Set();
    for (const row of rows) {
      const key = optionKey(row.option);
      if (!key) return '여러 옵션·수량을 등록할 때는 각 옵션의 이름·구성을 입력하세요.';
      if (seen.has(key)) return `${row.option}: 같은 옵션은 수량을 늘려주세요. 상태가 다르면 별도로 등록하세요.`;
      seen.add(key);
      if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > 100) return `${row.option}: 수량은 1~100권으로 입력하세요.`;
    }
    if (intakeBookCount(item) > MAX_INTAKE_BOOKS) return '한 번에 총 300권까지 등록할 수 있습니다.';
  }
  if (step >= 2 && (item.condition_grade === 'DISCARD' || rows.some((row) => row.condition_grade === 'DISCARD'))) return '판매불가 교재는 옵션 하나·수량 1권으로 따로 기록하세요.';
  for (const row of rows) {
    const error = singleIntakeError(resolveIntakeVariant(item, row), step);
    if (error) return `${row.option || '옵션'}: ${error}`;
  }
  if (step >= 4 && item.serial_number !== '' && Number(item.serial_number) + intakeBookCount(item) - 1 > 2147483647) return '마지막 일련번호가 허용 범위를 넘습니다. 시작 번호를 낮춰주세요.';
  return '';
}

export function intakePayload(item) {
  const resolved = !isIntakeBatch(item) && item.variants?.[0] ? resolveIntakeVariant(item, item.variants[0]) : item;
  const keys = ['product_id','title','option','subject','brand','book_type','published_year','instructor_name',
    'condition_grade','writing_percentage','has_damage','components_confirmed','inspection_notes','discard_reason',
    'price','original_price','location','serial_number','cover_image_url','inspection_image_urls','is_public'];
  return Object.fromEntries(keys.map((key) => [key, resolved[key]]));
}
