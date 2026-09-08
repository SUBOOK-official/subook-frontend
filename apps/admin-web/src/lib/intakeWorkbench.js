export const INTAKE_STEPS = ['표지 촬영', '교재 확인', '상태 확인', '가격 결정', '등록'];
export function blankIntake(location = '') {
  return {
    requestKey: crypto.randomUUID(), step: 0, product_id: null, title: '', option: '',
    subject: '', brand: '', book_type: '', published_year: '', instructor_name: '',
    condition_grade: '', writing_percentage: '', has_damage: null, components_confirmed: false,
    inspection_notes: '', discard_reason: '', price: '', original_price: '', location,
    serial_number: '', cover_image_url: '', scan_image_url: '', inspection_image_urls: [],
    is_public: true, options: [],
  };
}

export function intakeError(item, step) {
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

export function intakePayload(item) {
  const keys = ['product_id','title','option','subject','brand','book_type','published_year','instructor_name',
    'condition_grade','writing_percentage','has_damage','components_confirmed','inspection_notes','discard_reason',
    'price','original_price','location','serial_number','cover_image_url','inspection_image_urls','is_public'];
  return Object.fromEntries(keys.map((key) => [key, item[key]]));
}
