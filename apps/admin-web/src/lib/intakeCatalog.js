import { SUBJECT_DETAIL_GROUPS } from '../../../../packages/shared-domain/src/intakeSubjects.js';
import { BRAND_OPTIONS, BOOK_TYPE_OPTIONS, SUBJECT_OPTIONS } from './productCategories.js';

export { SUBJECT_DETAIL_GROUPS };

const clean = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
const subjectKey = (value) => clean(value).normalize('NFKC').replace(/[\s·ㆍ・.]/gu, '').toLocaleLowerCase();
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const subjectAliases = new Map(SUBJECT_OPTIONS.map((subject) => [subjectKey(subject), subject]));
subjectAliases.set('사회탐구', '사회');
subjectAliases.set('과학탐구', '과학');
subjectAliases.set('사탐', '사회');
subjectAliases.set('과탐', '과학');
const detailAliases = new Map();
const details = [];

for (const [subject, groups] of Object.entries(SUBJECT_DETAIL_GROUPS)) {
  for (const option of groups.flatMap((group) => group.options)) {
    const detail = { subject, subject_detail: option };
    details.push(detail);
    detailAliases.set(subjectKey(option), detail);
    // 표지의 아라비아 숫자와 로마 숫자는 같은 과목 표기로 인식한다.
    // 단, 구과정 '미적분'을 신과정 '미적분Ⅰ'로 바꾸지는 않는다.
    if (/[ⅠⅡ]$/u.test(option)) {
      detailAliases.set(subjectKey(option.replace(/Ⅰ$/u, '1').replace(/Ⅱ$/u, '2')), detail);
    }
    if (/[12]$/u.test(option)) {
      detailAliases.set(subjectKey(option.replace(/1$/u, 'Ⅰ').replace(/2$/u, 'Ⅱ')), detail);
    }
    if (/^물리학[ⅠⅡ]$/u.test(option)) {
      for (const alias of [option.replace('물리학', '물리'), option.replace('물리학', '물리').replace(/Ⅰ$/u, '1').replace(/Ⅱ$/u, '2')]) {
        detailAliases.set(subjectKey(alias), detail);
      }
    }
  }
}

export function normalizeIntakeSubject(subject, detail) {
  const category = subjectAliases.get(subjectKey(subject));
  const fromSubject = detailAliases.get(subjectKey(subject));
  const fromDetail = detailAliases.get(subjectKey(detail));
  const parent = category || fromSubject?.subject || fromDetail?.subject || '';
  const selected = fromDetail || (!category ? fromSubject : null);
  return { subject: parent, subject_detail: selected?.subject === parent ? selected.subject_detail : '' };
}

function instructorBase(name) {
  return clean(name).replace(/(?:\s*[TＴ])+$/u, '').replace(/(?<=[가-힣])\s*t$/u, '').trim();
}

function instructorLabel(name) {
  const base = instructorBase(name);
  return base ? `${base}T` : '';
}

function tokenPattern(token) {
  return escapePattern(clean(token)).replace(/ /g, '\\s+');
}

function subjectPattern(subject) {
  let pattern = tokenPattern(subject).replace(/·/g, '[·ㆍ・.]?');
  // 과목의 공식 공백 유무는 OCR에서 흔히 달라지므로 단어 사이는 유연하게 읽는다.
  pattern = pattern.replace(/\\s\+/g, '\\s*');
  if (/[ⅠⅡ]$/u.test(subject)) {
    pattern = pattern.replace(/Ⅰ$/u, '\\s*(?:Ⅰ|I|1)').replace(/Ⅱ$/u, '\\s*(?:Ⅱ|II|2)');
  }
  if (/^물리학[ⅠⅡ]$/u.test(subject)) pattern = pattern.replace('물리학', '물리(?:학)?');
  return pattern;
}

function wholeToken(pattern, flags = 'iu') {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, flags);
}

function inferTitleDetail(title, subject) {
  // 짧은 '화학'보다 '화학 반응의 세계' 등 긴 과목부터 비교한다.
  const match = [...details].sort((a, b) => b.subject_detail.length - a.subject_detail.length)
    .find((detail) => (!subject || detail.subject === subject) && wholeToken(subjectPattern(detail.subject_detail)).test(title));
  return match ? { ...match } : null;
}

export function extractTitleCore(title, metadata = {}) {
  let core = clean(title);
  const normalized = normalizeIntakeSubject(metadata.subject, metadata.subject_detail);
  const year = clean(metadata.published_year);
  const instructor = instructorBase(metadata.instructor_name);
  const patterns = [
    /^20\d{2}$|^2100$/.test(year) ? `${escapePattern(year)}(?:\\s*학년도|\\s*학년|\\s*년)?` : '',
    clean(metadata.brand) ? tokenPattern(metadata.brand) : '',
    instructor ? `${tokenPattern(instructor)}(?:\\s*[TＴt])*` : '',
    normalized.subject_detail ? subjectPattern(normalized.subject_detail) : '',
    normalized.subject ? subjectPattern(normalized.subject) : '',
  ].filter(Boolean);
  for (const pattern of patterns) core = core.replace(wholeToken(pattern, 'giu'), ' ');
  // 메타데이터만 감싸던 빈 괄호/구분자를 정리한다. 본문 안 문장부호는 보존한다.
  return clean(core.replace(/\(\s*\)|\[\s*\]|【\s*】/gu, ' ').replace(/^[\s|:·—–-]+|[\s|:·—–-]+$/gu, ''));
}

export function composeIntakeTitle(item) {
  if (item.product_id) return item.title ?? '';
  const normalized = normalizeIntakeSubject(item.subject, item.subject_detail);
  const core = has(item, 'title_core') ? clean(item.title_core) : extractTitleCore(item.title, item);
  return [clean(item.published_year), clean(item.brand), core, normalized.subject_detail || normalized.subject, instructorLabel(item.instructor_name)]
    .filter(Boolean).join(' ');
}

export function normalizeIntakeCatalogDraft(item = {}) {
  const title = item.title ?? '';
  const normalized = normalizeIntakeSubject(item.subject, item.subject_detail);
  // 새 초안의 명시적인 미선택('')은 복원 시 추론으로 덮어쓰지 않는다.
  const inferred = !has(item, 'subject_detail') && !normalized.subject_detail
    ? inferTitleDetail(title, normalized.subject) : null;
  const metadata = {
    ...item,
    ...normalized,
    ...(inferred || {}),
    published_year: item.published_year ?? '',
    instructor_name: item.instructor_name ?? '',
  };
  return { ...metadata, title_core: has(item, 'title_core') ? item.title_core : extractTitleCore(title, metadata), title };
}

export function applyIntakeCatalog(item, patch = {}) {
  const previous = normalizeIntakeCatalogDraft(item);
  const next = { ...previous, ...patch };
  Object.assign(next, normalizeIntakeSubject(next.subject, next.subject_detail));
  if (has(patch, 'title') && !has(patch, 'title_core') && (!next.product_id || previous.product_id !== next.product_id)) {
    next.title_core = extractTitleCore(patch.title, next);
  }
  if (next.product_id) {
    // 기존 마스터 추가 등록에서 자동 조합으로 원래 상품명을 바꾸지 않는다.
    next.title = previous.product_id === next.product_id ? previous.title : next.title;
  } else if (['title', 'title_core', 'subject', 'subject_detail', 'brand', 'published_year', 'instructor_name', 'product_id'].some((key) => has(patch, key))) {
    next.title = composeIntakeTitle(next);
  }
  return next;
}

export function scanIntakeCatalog(extracted = {}) {
  const title = clean(extracted.title);
  const normalized = normalizeIntakeSubject(extracted.subject, extracted.subject_detail);
  const inferred = !normalized.subject_detail ? inferTitleDetail(title, normalized.subject) : null;
  const metadata = {
    product_id: null,
    ...normalized,
    ...(inferred || {}),
    brand: BRAND_OPTIONS.includes(extracted.brand) ? extracted.brand : '',
    book_type: BOOK_TYPE_OPTIONS.includes(extracted.book_type) ? extracted.book_type : '',
    published_year: clean(extracted.published_year),
    instructor_name: clean(extracted.instructor_name),
  };
  const title_core = extractTitleCore(title, metadata);
  return { ...metadata, title_core, title: composeIntakeTitle({ ...metadata, title_core }) };
}
