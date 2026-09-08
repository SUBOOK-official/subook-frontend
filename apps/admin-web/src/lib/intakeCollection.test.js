import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionGroupError, collectionPending, createIntakeCollection, newIntakeGroup, patchIntakeGroup } from './intakeCollection.js';
import { createIntakeRange, intakePayload, newIntakeVariant } from './intakeWorkbench.js';

function ready(patch = {}) {
  return patchIntakeGroup(newIntakeGroup('A-1'), {
    title_core: '실전 N제', published_year: '2027', brand: '시대인재', book_type: 'N제', subject: '수학', subject_detail: '',
    condition_grade: 'S', writing_percentage: '0', has_damage: false, components_confirmed: true, price: '12000',
    cover_image_url: 'https://example.invalid/cover.jpg', inspection_image_urls: ['https://example.invalid/inside.jpg'], ...patch,
  });
}

test('여러 교재 등록은 교재별 옵션·공유 사진·요청 키를 별도로 고정한다', () => {
  const single = ready();
  const batch = ready({ title_core: '서바이벌', variants: createIntakeRange('1', '30') });
  const pending = collectionPending([single, batch]);
  assert.equal(pending.kind, 'collection');
  assert.equal(pending.groups[0].kind, 'single');
  assert.equal(pending.groups[1].kind, 'batch');
  assert.equal(pending.groups[1].variants.length, 30);
  assert.equal(pending.groups[0].request_key, single.requestKey);
  assert.equal(pending.groups[1].request_key, batch.requestKey);
  assert.equal(pending.groups[0].item.subject_detail, null);
  assert.equal(pending.groups[0].item.title, '2027 시대인재 실전 N제 수학');
  const frozen = structuredClone(pending);
  single.inspection_image_urls.push('https://example.invalid/later.jpg');
  batch.variants[0].price = '1000';
  batch.title = '수정된 이름';
  assert.deepEqual(pending, frozen);
});

test('검증은 신규 핵심 제목·업로드·옵션 오류·총 수량·중복 작업 번호를 차단한다', () => {
  assert.equal(collectionGroupError(ready()), '');
  assert.match(collectionGroupError(ready({ title_core: '' })), /책 제목/u);
  assert.match(collectionGroupError(ready({ photos: [{ id: 'p', uploadState: 'queued' }] })), /업로드/u);
  assert.match(collectionGroupError(ready({ photos: [{ id: 'p', uploadState: 'error' }] })), /업로드/u);
  assert.match(collectionGroupError(ready({ price: '' })), /판매가/u);
  assert.throws(() => collectionPending([]), /선택/u);
  const single = ready();
  assert.throws(() => collectionPending([single, single]), /중복/u);
  assert.throws(() => collectionPending([ready({ variants: [newIntakeVariant('한 구성', '0')] })]), /수량/u);
  assert.throws(() => collectionPending([ready({ variants: createIntakeRange('1', '3', '', '회', '100') }), ready()]), /300권/u);
  assert.throws(() => collectionPending(Array.from({ length: 101 }, () => ready())), /100종/u);
});

test('교재 변경은 새 마스터 제목을 그대로 사용하며 마지막 옵션 예외값을 기본값으로 옮긴다', () => {
  const group = ready({ variants: [newIntakeVariant('1회'), { ...newIntakeVariant('2회'), price: '9000', condition_grade: 'A_PLUS' }] });
  const reduced = patchIntakeGroup(group, { variants: [group.variants[1]] });
  assert.equal(reduced.price, '9000');
  assert.equal(reduced.condition_grade, 'A_PLUS');
  assert.equal(reduced.variants[0].price, '');
  const selected = patchIntakeGroup(reduced, { product_id: 17, title: '기존 마스터 원제', subject: '국어', subject_detail: '', brand: '이감', price: '18000', variants: reduced.variants });
  assert.equal(selected.title, '기존 마스터 원제');
  assert.equal(selected.price, '18000');
  assert.equal(selected.variants[0].option, '2회');
  assert.equal(collectionGroupError(selected), '');
});

test('가격·등급·위치 편집은 늦게 오는 OCR 카테고리 입력을 막지 않는다', () => {
  const group = newIntakeGroup();
  assert.equal(patchIntakeGroup(group, { price: '9000', condition_grade: 'S', location: 'A-1' }).metadataRevision, 0);
  assert.equal(patchIntakeGroup(group, { title_core: '직접 제목' }).metadataRevision, 1);
  assert.equal(patchIntakeGroup(group, { variants: [newIntakeVariant('옵션 직접 입력')] }).metadataRevision, 1);
  assert.equal(patchIntakeGroup(group, { title_core: '인식 제목' }, false).metadataRevision, 0);
});

test('옛 보류 교재와 옵션만 입력한 초안도 선택 상태를 바꾸거나 버리지 않고 이관한다', () => {
  const active = { ...newIntakeGroup('A-3'), variants: [newIntakeVariant('01. 별과 외계 행성계')] };
  const held = ready({ title_core: '보류 교재' });
  const restored = createIntakeCollection({ version: 1, active, held: [held], completed: [] });
  assert.equal(restored.groups.length, 2);
  assert.equal(restored.groups[0].requestKey, active.requestKey);
  assert.equal(restored.groups[0].variants[0].option, '01. 별과 외계 행성계');
  assert.equal(restored.groups[1].held, true);
  assert.equal(restored.groups[1].selected, false);
  assert.equal(createIntakeCollection({ version: 1, active: newIntakeGroup('A-3') }).groups[0].location, 'A-3');
});

test('옛 응답 유실 요청은 재조합하지 않고 그대로 복원하며 원본과 참조를 공유하지 않는다', () => {
  for (const kind of [undefined, 'batch']) {
    const active = ready();
    const pending = { requestKey: active.requestKey, item: intakePayload(active), ...(kind ? { kind, variants: [{ option: '01. 별과 외계 행성계', quantity: 2, price: '10000', condition_grade: 'S', writing_percentage: '0', has_damage: false, inspection_notes: '' }] } : {}) };
    const expected = structuredClone(pending);
    const restored = createIntakeCollection({ version: 1, active, held: [], pending });
    const { legacy, ...request } = restored.pending;
    assert.equal(legacy, true);
    assert.deepEqual(request, expected);
    active.inspection_image_urls.push('https://example.invalid/new.jpg');
    assert.deepEqual(request, expected);
    const recovered = createIntakeCollection({ version: 1, pending });
    assert.equal(recovered.groups[0].requestKey, pending.requestKey);
    assert.equal(recovered.groups[0].variants[0].quantity, kind ? 2 : '1');
    assert.ok(recovered.groups[0].variants[0].id);
    assert.deepEqual(recovered.pending.item, pending.item);
  }
});
