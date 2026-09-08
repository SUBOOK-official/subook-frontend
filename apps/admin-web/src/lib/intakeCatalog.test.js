import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECT_DETAIL_GROUPS, applyIntakeCatalog, composeIntakeTitle, extractTitleCore, normalizeIntakeCatalogDraft, normalizeIntakeSubject, scanIntakeCatalog } from './intakeCatalog.js';

const book = (patch = {}) => ({
  product_id: null, published_year: '2027', brand: '시대인재', title_core: '백야 Assignment',
  subject: '과학', subject_detail: '지구과학Ⅰ', instructor_name: '박선', ...patch,
});

test('선택한 카테고리 순서로 완성 상품명을 만들고 강사 T는 한 번만 붙인다', () => {
  assert.equal(composeIntakeTitle(book()), '2027 시대인재 백야 Assignment 지구과학Ⅰ 박선T');
  for (const instructor_name of ['박선T', '박선 TT', '박선t', '박선Ｔ']) {
    assert.equal(composeIntakeTitle(book({ instructor_name })), '2027 시대인재 백야 Assignment 지구과학Ⅰ 박선T');
  }
  assert.equal(composeIntakeTitle(book({ instructor_name: '' })), '2027 시대인재 백야 Assignment 지구과학Ⅰ');
  assert.equal(composeIntakeTitle(book({ instructor_name: 'Scott' })).endsWith('ScottT'), true);
});

test('하위 과목을 비우면 상위 과목을 쓰며 종합 옵션은 없다', () => {
  for (const subject of ['국어', '수학', '과학', '사회', '영어', '한국사', '기타']) {
    assert.equal(composeIntakeTitle(book({ subject, subject_detail: '', instructor_name: '' })), `2027 시대인재 백야 Assignment ${subject}`);
  }
  const choices = Object.values(SUBJECT_DETAIL_GROUPS).flatMap((groups) => groups.flatMap((group) => group.options));
  assert.equal(choices.some((name) => /종합|묶음|전체/u.test(name)), false);
  assert.equal(new Set(choices).size, choices.length);
});

test('OCR 과목 별칭을 공식 표기로 정리하되 구과정과 신과정을 구분한다', () => {
  for (const subject of ['물리1', '물리학 1', '물리학I', '물리학Ⅰ']) {
    assert.deepEqual(normalizeIntakeSubject(subject), { subject: '과학', subject_detail: '물리학Ⅰ' });
  }
  assert.deepEqual(normalizeIntakeSubject('과학탐구', '생명과학2'), { subject: '과학', subject_detail: '생명과학Ⅱ' });
  assert.deepEqual(normalizeIntakeSubject('사회탐구', '사회문화'), { subject: '사회', subject_detail: '사회·문화' });
  assert.deepEqual(normalizeIntakeSubject('사회', '사회와문화'), { subject: '사회', subject_detail: '사회와 문화' });
  assert.deepEqual(normalizeIntakeSubject('수학', '미적분'), { subject: '수학', subject_detail: '미적분' });
  assert.deepEqual(normalizeIntakeSubject('수학', '미적분1'), { subject: '수학', subject_detail: '미적분Ⅰ' });
  assert.deepEqual(normalizeIntakeSubject('수학', '미적분II'), { subject: '수학', subject_detail: '미적분Ⅱ' });
  assert.deepEqual(normalizeIntakeSubject('수학', '공통수학Ⅱ'), { subject: '수학', subject_detail: '공통수학2' });
  assert.deepEqual(normalizeIntakeSubject('과탐', '통합과학'), { subject: '과학', subject_detail: '통합과학' });
  assert.deepEqual(normalizeIntakeSubject('수학', '지구과학Ⅰ'), { subject: '수학', subject_detail: '' });
});

test('인식 제목의 메타데이터를 중복 제거하고 제목 내부의 비슷한 단어는 보존한다', () => {
  assert.equal(extractTitleCore('2027학년도 시대인재 백야 Assignment 지구과학 1 박선T', book()), '백야 Assignment');
  assert.equal(extractTitleCore('2027 시대인재 (수학) 수학의 정석', book({ subject: '수학', subject_detail: '', instructor_name: '' })), '수학의 정석');
  assert.equal(extractTitleCore('국어의 기술', { subject: '국어' }), '국어의 기술');
  assert.equal(extractTitleCore('EBSi 수학자들의 이야기 2027선 박선생', { brand: 'EBS', subject: '수학', published_year: '2027', instructor_name: '박선' }), 'EBSi 수학자들의 이야기 2027선 박선생');
  assert.equal(extractTitleCore('생명과학의 이해', { subject: '과학', subject_detail: '생명과학' }), '생명과학의 이해');
});

test('구 초안은 원래 이름을 보존하며 핵심 제목을 준비한다', () => {
  const legacy = { title: '2027 시대인재 백야 Assignment 박선T 지구과학Ⅰ', subject: '과학', brand: '시대인재', published_year: '2027', instructor_name: '박선', requestKey: 'saved-key', variants: [{ option: '1회', quantity: '2' }] };
  const restored = normalizeIntakeCatalogDraft(legacy);
  assert.equal(restored.title, legacy.title);
  assert.equal(restored.title_core, '백야 Assignment');
  assert.equal(restored.subject_detail, '지구과학Ⅰ');
  assert.equal(restored.requestKey, legacy.requestKey);
  assert.deepEqual(restored.variants, legacy.variants);
  assert.equal(applyIntakeCatalog(restored, { price: '10000' }).title, legacy.title);
  assert.equal(normalizeIntakeCatalogDraft({ ...legacy, subject_detail: '' }).subject_detail, '');
});

test('카테고리 변경 시 핵심 제목은 보존하고 대분류 변경 시 하위 선택을 비운다', () => {
  let item = { ...book(), title: composeIntakeTitle(book()) };
  item = applyIntakeCatalog(item, { published_year: '2028', brand: '메가스터디' });
  assert.equal(item.title, '2028 메가스터디 백야 Assignment 지구과학Ⅰ 박선T');
  item = applyIntakeCatalog(item, { subject: '국어' });
  assert.equal(item.subject_detail, '');
  assert.equal(item.title, '2028 메가스터디 백야 Assignment 국어 박선T');
  item = applyIntakeCatalog(item, { subject_detail: '독서', instructor_name: '' });
  assert.equal(item.title, '2028 메가스터디 백야 Assignment 독서');
  item = applyIntakeCatalog(item, { subject_detail: '' });
  assert.equal(item.title, '2028 메가스터디 백야 Assignment 국어');
});

test('기존 마스터 이름은 바꾸지 않고 신규로 전환할 때만 자동 조합한다', () => {
  const original = { ...book(), product_id: 5, title: '기존 마스터의 원래 표기' };
  const updated = applyIntakeCatalog(original, { published_year: '2028', title: '의도치 않은 덮어쓰기' });
  assert.equal(updated.title, original.title);
  assert.equal(updated.title_core, original.title_core);
  assert.equal(composeIntakeTitle(updated), original.title);
  const detached = applyIntakeCatalog(original, { product_id: null });
  assert.equal(detached.title, '2027 시대인재 백야 Assignment 지구과학Ⅰ 박선T');
  const selected = applyIntakeCatalog(original, { product_id: 8, title: '2028 메가스터디 새 책 미적분', subject: '수학', subject_detail: '미적분', brand: '메가스터디', published_year: '2028', instructor_name: '' });
  assert.equal(selected.title, '2028 메가스터디 새 책 미적분');
  assert.equal(selected.title_core, '새 책');
});

test('스캔 결과에서 구체적인 과목을 찾아 신규 상품명과 핵심 제목을 분리한다', () => {
  const scan = scanIntakeCatalog({ title: '2027 시대인재 백야 Assignment 박선T 지구과학1', subject: '과학', brand: '시대인재', published_year: 2027, instructor_name: '박선T', book_type: '워크북' });
  assert.equal(scan.title_core, '백야 Assignment');
  assert.equal(scan.title, '2027 시대인재 백야 Assignment 지구과학Ⅰ 박선T');
  assert.equal(scan.subject, '과학');
  assert.equal(scan.subject_detail, '지구과학Ⅰ');
  assert.equal(scan.book_type, '워크북');
  const revised = scanIntakeCatalog({ title: '수능특강 화학 반응의 세계', subject: '과학', brand: 'EBS', published_year: '2028' });
  assert.equal(revised.subject_detail, '화학 반응의 세계');
  assert.equal(revised.title_core, '수능특강');
});
