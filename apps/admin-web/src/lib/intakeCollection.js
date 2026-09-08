import { blankIntake, restoreIntake, updateIntake, newIntakeVariant, intakeError, intakePayload, intakeBatchVariants, intakeBookCount, isIntakeBatch, MAX_INTAKE_BOOKS } from './intakeWorkbench.js';
import { applyIntakeCatalog, normalizeIntakeCatalogDraft } from './intakeCatalog.js';
import { applyIntakePricing } from './intakePricing.js';

export const MAX_INTAKE_GROUPS = 100;
export function newIntakeGroup(location = '') {
  return { ...blankIntake(location), title_core: '', subject_detail: null, photos: [], metadataRevision: 0, selected: true, held: false };
}

export function intakeGroupHasContent(item) {
  if (item.held || item.photos?.length || item.product_id || item.inspection_image_urls?.length || item.scan_image_url || item.cover_image_url) return true;
  if (['title', 'title_core', 'option', 'subject', 'brand', 'book_type', 'published_year', 'instructor_name', 'condition_grade', 'writing_percentage', 'inspection_notes', 'discard_reason', 'price', 'original_price', 'serial_number']
    .some((key) => item[key] !== undefined && item[key] !== null && String(item[key]).trim())) return true;
  if (typeof item.has_damage === 'boolean' || item.components_confirmed) return true;
  return item.variants?.some((row) => row.option?.trim() || Number(row.quantity) !== 1 || row.price || row.condition_grade || row.writing_percentage !== '' && row.writing_percentage != null || typeof row.has_damage === 'boolean' || row.inspection_notes) || false;
}

export function createIntakeCollection(legacy) {
  const previous = legacy?.version === 1 ? legacy : {};
  const drafts = [{ item: previous.active, held: false }, ...(previous.held || []).map((item) => ({ item, held: true }))].filter(({ item }) => item);
  const groups = drafts.filter(({ item }) => intakeGroupHasContent(item) || item.requestKey === previous.pending?.requestKey)
    .map(({ item, held }) => ({ ...newIntakeGroup(), ...normalizeIntakeCatalogDraft(restoreIntake(item)), photos: [], selected: !held, held }));
  // 응답을 잃은 옛 요청의 본문은 재조합하지 않는다. 편집 초안이 없어도 결과 확인 대상은 보존한다.
  if (previous.pending && !groups.some((group) => group.requestKey === previous.pending.requestKey)) {
    const pending = previous.pending;
    const draft = { ...pending.item, requestKey: pending.requestKey, mode: pending.kind === 'batch' ? 'batch' : 'single',
      ...(pending.kind === 'batch' ? { variants: pending.variants.map((row) => ({ ...newIntakeVariant(row.option, row.quantity), ...row })) } : {}) };
    groups.unshift({ ...newIntakeGroup(), ...normalizeIntakeCatalogDraft(restoreIntake(draft)) });
  }
  if (!groups.length) groups.push(newIntakeGroup(previous.active?.location || ''));
  return { version: 2, groups, activeId: groups[0].requestKey, phase: 'capture', captureSlot: 'cover',
    completed: structuredClone(previous.completed || []), pending: previous.pending ? { ...structuredClone(previous.pending), legacy: true } : null };
}
export function patchIntakeGroup(group, patch, manual = true) {
  const catalog = updateIntake(applyIntakePricing(applyIntakeCatalog(group, patch), patch), {});
  const changesMetadata = ['title', 'title_core', 'subject', 'subject_detail', 'brand', 'book_type', 'published_year', 'instructor_name', 'product_id', 'variants']
    .some((key) => Object.prototype.hasOwnProperty.call(patch, key));
  return { ...catalog, metadataRevision: (group.metadataRevision || 0) + (manual && changesMetadata ? 1 : 0) };
}
export function collectionGroupError(group) {
  if (group.photos?.some((photo) => photo.uploadState !== 'done')) return '사진 업로드를 완료하세요.';
  if (!group.product_id && !group.title_core?.trim()) return '책 제목을 입력하세요.';
  return intakeError(group, 4);
}
export function collectionPending(groups) {
  if (!groups.length) throw new Error('등록할 교재를 선택하세요.');
  if (groups.length > MAX_INTAKE_GROUPS || groups.reduce((sum, group) => sum + intakeBookCount(group), 0) > MAX_INTAKE_BOOKS) throw new Error('한 번에 교재 100종, 총 300권까지 등록할 수 있습니다. 선택을 나눠주세요.');
  if (groups.some((group) => !group.requestKey) || new Set(groups.map((group) => group.requestKey)).size !== groups.length) throw new Error('교재 작업 번호가 중복되거나 없습니다. 작업 목록을 다시 확인하세요.');
  for (const group of groups) {
    const error = collectionGroupError(group);
    if (error) throw new Error(`${group.title || '이름 미입력 교재'}: ${error}`);
  }
  return structuredClone({ requestKey: crypto.randomUUID(), kind: 'collection', groups: groups.map((group) => ({
    request_key: group.requestKey, kind: isIntakeBatch(group) ? 'batch' : 'single',
    item: { ...intakePayload(group), subject_detail: group.subject_detail || null },
    ...(isIntakeBatch(group) ? { variants: intakeBatchVariants(group) } : {}),
  })) });
}

let databasePromise;
function openDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('subook-intake', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('workspaces');
      request.result.createObjectStore('photos');
    };
    request.onerror = () => { databasePromise = null; reject(request.error); };
    request.onblocked = () => { databasePromise = null; reject(new Error('다른 상품 등록 탭을 닫고 다시 열어주세요.')); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = null; };
      resolve(database);
    };
  });
  return databasePromise;
}

// 작업 정보와 촬영 원본을 같은 트랜잭션으로 저장한다. 완료 전에는 다음 촬영으로 넘기지 않는다.
export async function changeIntakeCollection(key, change, { putPhoto, deletePhotos = [] } = {}) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['workspaces', 'photos'], 'readwrite');
    const store = transaction.objectStore('workspaces');
    let next;
    let failure;
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        next = change(request.result);
        store.put(next, key);
        if (putPhoto && next.groups.some((group) => group.photos.some((photo) => photo.id === putPhoto.id))) {
          transaction.objectStore('photos').put(putPhoto.blob, putPhoto.id);
        }
        deletePhotos.forEach((id) => transaction.objectStore('photos').delete(id));
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () => reject(failure || transaction.error || new Error('임시 저장을 완료하지 못했습니다.'));
    transaction.onerror = () => { /* onabort에서 한 번만 전달 */ };
  });
}
export async function readIntakePhoto(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('photos').objectStore('photos').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
