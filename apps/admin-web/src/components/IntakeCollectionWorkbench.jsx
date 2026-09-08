import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@shared-supabase/adminSupabaseClient';
import AdminShell from './AdminShell';
import IntakeCamera from './IntakeCamera';
import IntakeBookEditor from './IntakeBookEditor';
import IntakeDetailCrop from './IntakeDetailCrop';
import { cropIntakeDetail } from '../lib/intakePhotoCrop';
import { quickIntakeInspection } from '../lib/intakePricing';
import { BRAND_OPTIONS, BOOK_TYPE_OPTIONS, SUBJECT_OPTIONS } from '../lib/productCategories';
import { SUBJECT_DETAIL_GROUPS, scanIntakeCatalog } from '../lib/intakeCatalog';
import { intakeBookCount, suggestIntakeOption } from '../lib/intakeWorkbench';
import { changeIntakeCollection, readIntakePhoto, createIntakeCollection, newIntakeGroup, patchIntakeGroup, collectionGroupError, collectionPending, intakeGroupHasContent, MAX_INTAKE_GROUPS } from '../lib/intakeCollection';
import { COVER_BUCKET, DETAIL_BUCKET, uploadImageToBucket } from '../lib/adminImageUpload';
import { prepareStudioImagePayload, requestStudioGeneration, studioResultToFile } from '../lib/studioClient';
import { requestCoverScan } from '../lib/coverScanClient';

const secondary = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40';
const primary = 'rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40';
const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const meaningful = intakeGroupHasContent;
const groupName = (group, index) => group.title || `교재 ${index + 1}`;
async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('로그인이 만료되었습니다. 다시 로그인하세요.');
  return data.session.access_token;
}
async function withTimeout(promise, milliseconds = 60000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('연결 시간이 초과되었습니다. 다시 시도하세요.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function Photo({ photo, label, compact = false }) {
  const [localUrl, setLocalUrl] = useState('');
  useEffect(() => {
    if (photo.url) return undefined;
    let active = true;
    let objectUrl;
    readIntakePhoto(photo.id).then((blob) => {
      if (blob && active) { objectUrl = URL.createObjectURL(blob); setLocalUrl(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.id, photo.url]);
  return <div className={compact ? 'w-12 shrink-0' : 'min-w-0'}><div className={`flex items-center justify-center rounded-lg bg-slate-100 ${compact ? 'h-16' : 'h-28'}`}>{photo.url || localUrl ? <img src={photo.url || localUrl} alt={label} className="h-full w-full object-contain" /> : <span className="text-xs">사진 불러오는 중</span>}</div>{!compact ? <p className="mt-1 text-xs text-slate-500">{label} · {photo.uploadState === 'done' ? '업로드 완료' : photo.uploadState === 'error' ? '업로드 실패' : '기기에 저장됨'}</p> : null}</div>;
}

function BulkFields({ count, disabled, onApply, onInspect }) {
  const [values, setValues] = useState({});
  const patch = (key, value) => setValues((previous) => ({ ...previous, [key]: value, ...(key === 'subject' ? { subject_detail: '' } : {}), ...(key === 'discount_type' ? { discount_value: '', price: '' } : {}) }));
  const select = (key, label, options) => <label className="text-xs font-semibold">{label}<select aria-label={`일괄 ${label}`} className={inputClass} value={values[key] || ''} onChange={(event) => patch(key, event.target.value)}><option value="">변경 안 함</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  return <><section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><h2 className="font-bold">선택 교재 빠른 검수</h2><p className="mt-1 text-xs text-slate-600">S등급 · 필기·손상 없음 · 구성 확인. 옵션별 예외와 판매불가 교재는 유지됩니다.</p></div><button type="button" disabled={disabled || !count} className={primary} onClick={onInspect}>선택 {count}종 새 책으로 검수 완료</button></section><details className="rounded-xl border border-blue-200 bg-blue-50 p-4"><summary className="cursor-pointer font-bold text-blue-900">선택 {count}종 공통 정보 입력</summary>
    <fieldset disabled={disabled} className="mt-4 space-y-3"><p className="text-xs text-slate-600">같은 값만 선택해서 적용하세요. 기존 교재의 상품명·카테고리와 옵션별 예외값은 유지됩니다.</p>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">학년도<input aria-label="일괄 학년도" className={inputClass} value={values.published_year || ''} onChange={(event) => patch('published_year', event.target.value)} placeholder="변경 안 함" /></label>{select('brand', '브랜드', BRAND_OPTIONS)}{select('subject', '과목', SUBJECT_OPTIONS)}
        {values.subject && SUBJECT_DETAIL_GROUPS[values.subject] ? <label className="text-xs font-semibold">하위 과목 (선택)<select aria-label="일괄 하위 과목" className={inputClass} value={values.subject_detail || ''} onChange={(event) => patch('subject_detail', event.target.value)}><option value="">선택 안 함 · {values.subject}</option>{SUBJECT_DETAIL_GROUPS[values.subject].map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option}>{option}</option>)}</optgroup>)}</select></label> : null}
        {select('book_type', '유형', BOOK_TYPE_OPTIONS)}{select('condition_grade', '등급', ['S', 'A_PLUS', 'A'])}<label className="text-xs font-semibold">보관 위치<input aria-label="일괄 보관 위치" className={inputClass} value={values.location || ''} onChange={(event) => patch('location', event.target.value)} placeholder="변경 안 함" /></label>
        <label className="text-xs font-semibold">권당 판매가<input aria-label="일괄 판매가" type="number" min="1" disabled={['amount', 'rate'].includes(values.discount_type)} className={`${inputClass} disabled:bg-slate-100`} value={values.price || ''} onChange={(event) => patch('price', event.target.value)} placeholder="변경 안 함" /></label>
        <label className="text-xs font-semibold">일괄 할인 방식<select aria-label="일괄 할인 방식" className={inputClass} value={values.discount_type || ''} onChange={(event) => patch('discount_type', event.target.value)}><option value="">변경 안 함</option><option value="none">판매가 직접 입력</option><option value="amount">정액 할인 (원)</option><option value="rate">정률 할인 (%)</option></select></label>
        {['amount', 'rate'].includes(values.discount_type) ? <label className="text-xs font-semibold">{values.discount_type === 'rate' ? '할인율 (%)' : '할인 금액 (원)'}<input type="number" min="0" aria-label="일괄 할인값" className={inputClass} value={values.discount_value ?? ''} onChange={(event) => patch('discount_value', event.target.value)} /></label> : null}
      </div>
      {['amount', 'rate'].includes(values.discount_type) ? <p className="text-xs text-slate-600">각 교재의 정가에서 계산합니다. 정가가 없는 교재는 따로 입력하세요.</p> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(values.confirmed)} onChange={(event) => patch('confirmed', event.target.checked)} />선택한 교재 모두 필기·손상 없음, 구성품 확인 완료</label>
      <button type="button" className={primary} disabled={!count} onClick={() => {
        const { confirmed, subject_detail, ...rest } = values;
        const payload = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== ''));
        if (['amount', 'rate'].includes(payload.discount_type)) payload.discount_value = values.discount_value ?? '';
        else delete payload.discount_value;
        if (payload.subject) payload.subject_detail = subject_detail || '';
        if (confirmed) Object.assign(payload, { writing_percentage: '0', has_damage: false, components_confirmed: true });
        onApply(payload);
      }}>선택 교재에 적용</button>
    </fieldset>
  </details></>;
}

export default function IntakeCollectionWorkbench({ shipment, onChangeCustomer, legacyDraft }) {
  const storageKey = String(shipment.id);
  const [workspace, setWorkspace] = useState(null);
  const stateRef = useRef(null);
  const mounted = useRef(true);
  const uploading = useRef(new Set());
  const recognizing = useRef(new Set());
  const submitting = useRef(false);
  const photoActionsRef = useRef(new Set());
  const [loadingError, setLoadingError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [photoActions, setPhotoActions] = useState(new Set());
  const [loadRetry, setLoadRetry] = useState(0);
  const mutate = useCallback(async (change, options) => {
    try {
      const next = await changeIntakeCollection(storageKey, change, options);
      if (mounted.current) { stateRef.current = next; setWorkspace(next); setSaveError(''); }
      return next;
    } catch (error) {
      if (mounted.current) setSaveError(`임시 저장을 완료하지 못했습니다. ${error.message || '브라우저 저장 공간을 확인하세요.'}`);
      return null;
    }
  }, [storageKey]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let legacy;
    try { legacy = JSON.parse(localStorage.getItem(`subook.admin.intake.v1.${shipment.id}`)); } catch { /* 새 저장소로 시작 */ }
    changeIntakeCollection(storageKey, (previous) => previous || createIntakeCollection(legacy)).then((next) => {
      if (active) { stateRef.current = next; setWorkspace(next); setLoadingError(''); }
    }).catch(() => { if (active) setLoadingError('사진 임시 저장소를 열지 못했습니다. 브라우저 저장 공간을 확인하고 다시 시도하세요.'); });
    return () => { active = false; mounted.current = false; };
  }, [storageKey, shipment.id, loadRetry]);
  const changeGroup = useCallback((id, change) => mutate((state) => ({ ...state, groups: state.groups.map((group) => group.requestKey === id ? change(group) : group) })), [mutate]);
  function beginPhotoAction(id) {
    if (!id || photoActionsRef.current.has(id) || submitting.current || stateRef.current?.pending) return false;
    photoActionsRef.current.add(id);
    setPhotoActions(new Set(photoActionsRef.current));
    return true;
  }
  function endPhotoAction(id) {
    photoActionsRef.current.delete(id);
    if (mounted.current) setPhotoActions(new Set(photoActionsRef.current));
  }

  // 업로드 2개, 인식 1개를 별도 실행한다. 인식을 기다리는 동안에도 촬영·업로드는 계속된다.
  useEffect(() => {
    if (!workspace || saveError) return;
    for (const group of workspace.groups) for (const photo of group.photos) {
      if (photo.uploadState === 'queued' && uploading.current.size < 2 && !uploading.current.has(photo.id)) {
        uploading.current.add(photo.id);
        (async () => {
          try {
            const blob = await readIntakePhoto(photo.id);
            if (!blob) throw new Error('촬영 원본을 찾지 못했습니다. 삭제 후 다시 촬영하세요.');
            const cropped = photo.slot === 'cover' ? { blob, status: 'original' } : await cropIntakeDetail(blob, photo.cropMode || 'auto', photo.cropRect);
            const prepared = await prepareStudioImagePayload(cropped.blob);
            const compressed = new File([studioResultToFile(prepared, 'capture')], 'capture.jpg', { type: prepared.mimeType });
            const url = await withTimeout(uploadImageToBucket(photo.slot === 'cover' ? COVER_BUCKET : DETAIL_BUCKET, compressed, `intake/${shipment.id}`));
            if (!mounted.current) return;
            await changeGroup(group.requestKey, (current) => {
              if (!current.photos.some((entry) => entry.id === photo.id && (entry.processingRevision || 0) === (photo.processingRevision || 0))) return current;
              const photos = current.photos.map((entry) => entry.id === photo.id ? { ...entry, url, uploadState: 'done', error: '', cropStatus: cropped.status } : entry);
              const updated = { ...current, photos };
              if (photo.slot === 'cover') {
                updated.scan_image_url = url;
                if (!current.product_id) updated.cover_image_url = url;
              } else {
                const oldUrls = new Set(current.photos.filter((entry) => entry.slot !== 'cover').map((entry) => entry.url).filter(Boolean));
                updated.inspection_image_urls = [...current.inspection_image_urls.filter((entry) => !oldUrls.has(entry)), ...photos.filter((entry) => entry.slot !== 'cover' && entry.url).map((entry) => entry.url)].slice(0, 2);
              }
              return updated;
            });
          } catch (error) {
            if (mounted.current) await changeGroup(group.requestKey, (current) => ({ ...current, photos: current.photos.map((entry) => entry.id === photo.id && (entry.processingRevision || 0) === (photo.processingRevision || 0) ? { ...entry, uploadState: 'error', error: error.message } : entry) }));
          } finally {
            uploading.current.delete(photo.id);
            if (mounted.current) setWorkspace((current) => current ? { ...current } : current);
          }
        })();
      }
      if (photo.slot === 'cover' && photo.uploadState === 'done' && photo.recognitionState === 'queued' && recognizing.current.size < 1 && !recognizing.current.has(photo.id)) {
        recognizing.current.add(photo.id);
        (async () => {
          try {
            const blob = await readIntakePhoto(photo.id);
            if (!blob) throw new Error('인식할 원본 사진을 찾지 못했습니다.');
            const result = await requestCoverScan(await accessToken(), await prepareStudioImagePayload(blob));
            if (!mounted.current) return;
            await changeGroup(group.requestKey, (current) => {
              if (!current.photos.some((entry) => entry.id === photo.id)) return current;
              const canFill = !stateRef.current.pending && !current.product_id && current.metadataRevision === photo.revision;
              const updated = canFill ? patchIntakeGroup(current, { ...scanIntakeCatalog(result.extracted), variants: suggestIntakeOption(current, result.extracted?.option) }, false) : current;
              return { ...updated, candidates: result.candidates || [], recognition_error: canFill ? '' : '인식이 완료되었습니다. 직접 입력한 정보는 유지했습니다. 필요하면 아래 기존 교재 후보를 확인하세요.', photos: current.photos.map((entry) => entry.id === photo.id ? { ...entry, recognitionState: 'done' } : entry) };
            });
          } catch (error) {
            if (mounted.current) await changeGroup(group.requestKey, (current) => ({ ...current, recognition_error: `정보 인식 실패: ${error.message} 직접 입력하거나 다시 인식하세요.`, photos: current.photos.map((entry) => entry.id === photo.id ? { ...entry, recognitionState: 'error' } : entry) }));
          } finally {
            recognizing.current.delete(photo.id);
            if (mounted.current) setWorkspace((current) => current ? { ...current } : current);
          }
        })();
      }
    }
  }, [workspace, saveError, changeGroup, shipment.id]);

  const item = workspace?.groups.find((group) => group.requestKey === workspace.activeId) || workspace?.groups[0];
  const locked = Boolean(busy || workspace?.pending || saveError || localSaving);
  async function capture(file) {
    const id = item?.requestKey;
    const slot = workspace.captureSlot;
    if (!id || locked || photoActionsRef.current.has(id)) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { setMessage('15MB 이하 JPG·PNG·WEBP 사진을 선택하세요.'); return; }
    setLocalSaving(true); setMessage('');
    const photo = { id: crypto.randomUUID(), slot, uploadState: 'queued', recognitionState: slot === 'cover' ? 'queued' : 'none', revision: item.metadataRevision, url: '', cropMode: workspace.autoCropDetails === false ? 'original' : 'auto' };
    const next = await mutate((state) => {
      const current = state.groups.find((group) => group.requestKey === id);
      if (!current || state.pending) return state;
      if (current.photos.some((entry) => entry.slot === slot)) throw new Error('같은 위치의 사진이 있습니다. 삭제 후 다시 촬영하세요.');
      const groups = state.groups.map((group) => group.requestKey === id ? { ...group, photos: [...group.photos, photo] } : group);
      if (slot === 'cover') return { ...state, groups, captureSlot: state.activeId === id ? 'inside-0' : state.captureSlot };
      if (state.activeId !== id) return { ...state, groups };
      // 표지·첫 내지 한 묶음을 저장하면 다음 교재 표지를 바로 촬영한다.
      if (slot === 'inside-0' && state.groups.length < MAX_INTAKE_GROUPS) {
        const following = newIntakeGroup(current.location);
        return { ...state, groups: [...groups, following], activeId: following.requestKey, captureSlot: 'cover' };
      }
      return { ...state, groups, captureSlot: 'inside-1' };
    }, { putPhoto: { id: photo.id, blob: file } });
    if (mounted.current) setLocalSaving(false);
    if (!next) throw new Error('사진을 저장하지 못했습니다. 다시 촬영하세요.');
  }
  const patch = (values) => {
    if (locked || !item || photoActionsRef.current.has(item.requestKey)) return;
    const removed = Object.hasOwn(values, 'inspection_image_urls') ? item.photos.filter((photo) => photo.slot !== 'cover' && photo.url && !values.inspection_image_urls.includes(photo.url)) : [];
    mutate((state) => ({ ...state, groups: state.groups.map((group) => group.requestKey === item.requestKey ? { ...patchIntakeGroup(group, values), photos: group.photos.filter((photo) => !removed.some((entry) => entry.id === photo.id)) } : group) }), { deletePhotos: removed.map((photo) => photo.id) });
    setMessage('');
  };
  function processDetail(photo, settings) {
    if (locked || photoActionsRef.current.has(item.requestKey)) return;
    changeGroup(item.requestKey, (group) => ({ ...group, photos: group.photos.map((entry) => entry.id === photo.id ? { ...entry, cropMode: settings.mode, cropRect: settings.rect || null, uploadState: 'queued', error: '', processingRevision: (entry.processingRevision || 0) + 1 } : entry) }));
  }
  function inspectSelected() {
    if (locked || photoActionsRef.current.size) return;
    mutate((state) => ({ ...state, groups: state.groups.map((group) => group.selected && !group.held && group.condition_grade !== 'DISCARD' ? patchIntakeGroup(group, quickIntakeInspection()) : group) }));
    setMessage('선택한 교재를 새 책으로 검수 완료했습니다. 옵션별 예외와 판매불가 교재는 유지했습니다.');
  }
  async function chooseProduct(product) {
    const id = item.requestKey;
    if (!beginPhotoAction(id)) return;
    setMessage('');
    try {
      let row = product;
      if (!Array.isArray(row.options)) {
        const { data, error } = await withTimeout(supabase.rpc('admin_search_products_for_register', { p_search: product.title, p_limit: 100, p_offset: 0 }), 15000);
        if (error) throw error;
        row = data?.find((entry) => entry.id === product.id);
        if (!row) throw new Error('기존 교재를 찾지 못했습니다. 다시 검색하세요.');
      }
      const metadata = await withTimeout(supabase.rpc('admin_intake_catalog_metadata', { p_product_ids: [row.id] }), 15000);
      if (metadata.error) throw metadata.error;
      if (!mounted.current) return;
      await changeGroup(id, (current) => patchIntakeGroup(current, { product_id: row.id, title: row.title, subject: row.subject || '', subject_detail: metadata.data?.find((entry) => entry.product_id === row.id)?.subject_detail || '', brand: row.brand || '', book_type: row.book_type || '', published_year: row.published_year || '', instructor_name: row.instructor_name || '', cover_image_url: row.cover_image_url || current.scan_image_url || '', original_price: row.representative_original_price || '', price: '', options: row.options || [], candidates: [], variants: suggestIntakeOption(current, row.options?.length === 1 ? row.options[0].option : '') }));
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { endPhotoAction(id); }
  }
  async function convertCover() {
    const snapshot = item;
    if (!beginPhotoAction(snapshot.requestKey)) return;
    setMessage('');
    try {
      const photo = item.photos.find((entry) => entry.slot === 'cover');
      let blob = photo ? await readIntakePhoto(photo.id) : null;
      if (!blob) {
        const response = await fetch(item.scan_image_url || item.cover_image_url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('원본 사진을 불러오지 못했습니다.');
        blob = await response.blob();
      }
      const generated = await requestStudioGeneration(await accessToken(), await prepareStudioImagePayload(blob));
      const url = await withTimeout(uploadImageToBucket(COVER_BUCKET, studioResultToFile(generated, 'cover'), `intake/${shipment.id}`));
      if (mounted.current) await changeGroup(snapshot.requestKey, (current) => current.cover_image_url === snapshot.cover_image_url ? { ...current, cover_image_url: url } : current);
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { endPhotoAction(snapshot.requestKey); }
  }
  async function retryRecognition() {
    const snapshot = item;
    if (!beginPhotoAction(snapshot.requestKey)) return;
    try {
      const photo = snapshot.photos.find((entry) => entry.slot === 'cover');
      if (photo) {
        if (recognizing.current.has(photo.id)) { setMessage('이 교재의 정보 인식이 진행 중입니다.'); return; }
        await changeGroup(snapshot.requestKey, (group) => ({ ...group, recognition_error: '', photos: group.photos.map((entry) => entry.id === photo.id ? { ...entry, recognitionState: 'queued', revision: group.metadataRevision } : entry) }));
        return;
      }
      // 이전 작업대에서 가져온 원격 사진도 동일한 저장·인식 큐로 복원한다.
      const response = await fetch(snapshot.scan_image_url || snapshot.cover_image_url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('원본 사진을 불러오지 못했습니다.');
      const blob = await response.blob();
      const id = crypto.randomUUID();
      if (!mounted.current) return;
      await mutate((state) => {
        const current = state.groups.find((group) => group.requestKey === snapshot.requestKey);
        if (state.pending || !current || current.photos.some((entry) => entry.slot === 'cover')) throw new Error('작업 상태가 바뀌었습니다. 현재 교재의 사진을 확인하세요.');
        return { ...state, groups: state.groups.map((group) => group.requestKey === snapshot.requestKey ? { ...group, photos: [...group.photos, { id, slot: 'cover', uploadState: 'done', recognitionState: 'queued', revision: group.metadataRevision, url: snapshot.scan_image_url || snapshot.cover_image_url }] } : group) };
      }, { putPhoto: { id, blob } });
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { endPhotoAction(snapshot.requestKey); }
  }
  async function submit() {
    if (submitting.current || saveError || photoActionsRef.current.size || localSaving) return;
    submitting.current = true; setBusy('등록 결과 확인 중…'); setMessage('');
    try {
      let pending;
      try { pending = stateRef.current.pending || collectionPending(stateRef.current.groups.filter((group) => group.selected && !group.held)); }
      catch (error) { throw new Error(error.message); }
      const saved = await mutate((state) => ({ ...state, pending }));
      if (!saved) return;
      const name = pending.legacy ? pending.kind === 'batch' ? 'admin_register_intake_batch' : 'admin_register_intake_book' : 'admin_register_intake_collection';
      const args = { p_shipment_id: shipment.id, p_request_key: pending.requestKey,
        ...(pending.legacy ? pending.kind === 'batch' ? { p_common: pending.item, p_variants: pending.variants } : { p_item: pending.item } : { p_groups: pending.groups }) };
      const { data, error } = await withTimeout(supabase.rpc(name, args), 120000);
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) await mutate((state) => ({ ...state, pending: null }));
        throw new Error(error.message || '등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.');
      }
      if (!data?.success) throw new Error('등록 결과가 불확실합니다. 같은 요청으로 다시 확인하세요.');
      const ids = pending.legacy ? [pending.requestKey] : pending.groups.map((group) => group.request_key);
      const completedGroups = saved.groups.filter((group) => ids.includes(group.requestKey));
      const next = await mutate((state) => {
        let groups = state.groups.filter((group) => !ids.includes(group.requestKey));
        if (!groups.length) groups = [newIntakeGroup(completedGroups[0]?.location || '')];
        return { ...state, groups, pending: null, activeId: groups[0].requestKey, captureSlot: 'cover', phase: groups.some(meaningful) ? 'review' : 'capture', completed: [{ ...data, requestKey: pending.requestKey, titles: completedGroups.map((group) => group.title) }, ...state.completed].slice(0, 100) };
      }, { deletePhotos: completedGroups.flatMap((group) => group.photos.map((photo) => photo.id)) });
      if (next) { localStorage.removeItem(`subook.admin.intake.v1.${shipment.id}`); setMessage(`${data.group_count || 1}종 · ${data.book_count || 1}권 등록을 완료했습니다.`); }
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { submitting.current = false; if (mounted.current) setBusy(''); }
  }
  if (!workspace) return <AdminShell activeModule="register" title="상품 등록"><div className="rounded-xl bg-white p-8" role={loadingError ? 'alert' : 'status'}>{loadingError || '촬영 작업 불러오는 중…'}{loadingError ? <button type="button" className={`${secondary} ml-3`} onClick={() => setLoadRetry((value) => value + 1)}>다시 시도</button> : null}</div></AdminShell>;

  const selected = workspace.groups.filter((group) => group.selected && !group.held);
  const selectedBooks = selected.reduce((sum, group) => sum + intakeBookCount(group), 0);
  const photos = workspace.groups.flatMap((group) => group.photos);
  const uploadRemaining = photos.filter((photo) => photo.uploadState === 'queued').length;
  const recognitionRemaining = photos.filter((photo) => photo.recognitionState === 'queued').length;
  const completedCount = workspace.completed.reduce((sum, entry) => sum + (entry.book_count || 1), 0);
  const activate = (group, phase = workspace.phase, slot) => mutate((state) => ({ ...state, activeId: group.requestKey, phase, captureSlot: slot || (!group.photos.some((photo) => photo.slot === 'cover') && !group.scan_image_url ? 'cover' : !group.photos.some((photo) => photo.slot === 'inside-0') && !group.inspection_image_urls.length ? 'inside-0' : 'inside-1') }));
  const removePhoto = (photo) => mutate((state) => ({ ...state, captureSlot: photo.slot, groups: state.groups.map((group) => group.requestKey !== item.requestKey ? group : { ...group, photos: group.photos.filter((entry) => entry.id !== photo.id), ...(photo.slot === 'cover' ? { scan_image_url: '', cover_image_url: group.product_id ? group.cover_image_url : '', candidates: [], recognition_error: '' } : { inspection_image_urls: group.inspection_image_urls.filter((url) => url !== photo.url) }) }) }), { deletePhotos: [photo.id] });
  return <AdminShell activeModule="register" title="상품 등록" description="사진을 모아서 찍고, 여러 교재를 한 번에 등록하세요">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div><p className="font-bold">{shipment.seller_name || shipment.name || '선택한 판매자'} · 수거건 #{shipment.id}</p><p className="mt-1 text-sm text-slate-500">같은 교재끼리 먼저 분류하세요. 여러 옵션에는 대표 한 권의 표지·내지를 공유합니다.</p></div><button type="button" disabled={locked || photoActions.size > 0} className={secondary} onClick={onChangeCustomer}>고객 변경</button></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2">{[['capture', '1. 연속 촬영'], ['review', '2. 정보·가격 일괄 확인']].map(([phase, label]) => <button key={phase} type="button" aria-label={phase === 'review' ? '정보·가격 일괄 확인' : '연속 촬영'} disabled={locked} aria-pressed={workspace.phase === phase} className={workspace.phase === phase ? primary : secondary} onClick={() => mutate((state) => {
      const groups = phase === 'review' && state.groups.some(meaningful) ? state.groups.filter(meaningful) : state.groups;
      return { ...state, phase, groups, activeId: groups.some((group) => group.requestKey === state.activeId) ? state.activeId : groups[0].requestKey };
    })}>{label}</button>)}</div><p role="status" className="text-sm text-slate-600">업로드 대기 {uploadRemaining}장 · 정보 인식 {recognitionRemaining}건 · 등록 완료 {completedCount}권</p></div>
    {message ? <p role="alert" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">{message}</p> : null}
    {saveError ? <div role="alert" className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{saveError}<button type="button" className={`${secondary} ml-3`} onClick={() => mutate((state) => ({ ...state }))}>저장 다시 시도</button></div> : null}
    {workspace.pending ? <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-bold">등록 결과 확인이 필요합니다.</p><p className="mt-1 text-sm">보낸 교재와 사진을 그대로 보관하고 있습니다. 같은 요청으로 결과를 확인하면 중복 등록되지 않습니다.</p><button type="button" aria-label="등록 결과 다시 확인" className={`${primary} mt-3`} disabled={Boolean(busy || saveError)} onClick={submit}>{busy || '같은 요청으로 등록 결과 확인'}</button></div> : null}
    <div className={`grid items-start gap-5 ${workspace.phase === 'capture' ? 'xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`}>
      {workspace.phase === 'capture' ? <div className="min-w-0 space-y-4"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-blue-700">{groupName(item, workspace.groups.indexOf(item))}</p><h2 className="mt-1 text-xl font-bold">{workspace.captureSlot === 'cover' ? '대표 표지를 촬영하세요' : '대표 내지를 촬영하세요'}</h2><p className="mt-2 text-sm text-slate-500">표지 → 내지 → 다음 교재로 자동 이동합니다. 정보 인식은 촬영하는 동안 진행됩니다.</p></div>
        <label className="flex items-center gap-2 rounded-lg bg-white p-3 text-sm"><input type="checkbox" disabled={locked} checked={workspace.autoCropDetails !== false} onChange={(event) => { const enabled = event.target.checked; mutate((state) => ({ ...state, autoCropDetails: enabled })); }} />내지 검은 배경 자동 정리 · 원본 보관</label>
        <IntakeCamera onCapture={capture} disabled={locked || photoActions.has(item.requestKey) || item.photos.some((photo) => photo.slot === workspace.captureSlot) || (workspace.captureSlot !== 'cover' && item.inspection_image_urls.length + item.photos.filter((photo) => photo.slot !== 'cover' && !photo.url).length >= 2)} label={workspace.captureSlot === 'cover' ? '표지 촬영' : '내지 촬영'} />
        <div className="flex flex-wrap gap-2"><button type="button" disabled={locked || workspace.groups.length >= MAX_INTAKE_GROUPS} className={secondary} onClick={() => mutate((state) => { const group = newIntakeGroup(item.location); return { ...state, groups: [...state.groups, group], activeId: group.requestKey, captureSlot: 'cover' }; })}>다음 교재 / 직접 입력</button><button type="button" disabled={locked} className={secondary} onClick={() => activate(item, 'review')}>이 교재 정보 확인</button></div>
        {item.photos.length ? <div className="grid grid-cols-3 gap-3">{item.photos.map((photo) => <div key={photo.id}><Photo photo={photo} label={photo.slot === 'cover' ? '대표 표지' : '대표 내지'} /><button type="button" disabled={locked || photoActions.has(item.requestKey)} className="mt-2 text-xs text-rose-700 underline" onClick={() => removePhoto(photo)}>사진 삭제</button>{photo.error ? <p className="mt-1 text-xs text-rose-700">{photo.error}</p> : null}{photo.uploadState === 'error' ? <button type="button" disabled={locked || photoActions.has(item.requestKey)} className="mt-2 text-xs underline" onClick={() => changeGroup(item.requestKey, (group) => ({ ...group, photos: group.photos.map((entry) => entry.id === photo.id ? { ...entry, uploadState: 'queued', error: '' } : entry) }))}>업로드 다시 시도</button> : null}</div>)}</div> : null}
        <IntakeDetailCrop photos={item.photos} disabled={locked || photoActions.has(item.requestKey)} onProcess={processDetail} />
      </div> : null}
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4"><section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-bold">작업 목록 · {workspace.groups.length}종</h2>{workspace.phase === 'review' ? <button type="button" disabled={locked} className="text-xs text-blue-700 underline" onClick={() => mutate((state) => ({ ...state, groups: state.groups.map((group) => ({ ...group, selected: !group.held && !collectionGroupError(group) })) }))}>준비된 교재 선택</button> : null}</div>
        <div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto">{workspace.groups.map((group, index) => <div key={group.requestKey} className={`rounded-xl border p-3 ${group.requestKey === item.requestKey ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><div className="flex items-start gap-2"><input aria-label={`${groupName(group, index)} 등록 선택`} type="checkbox" disabled={locked || group.held} checked={group.selected && !group.held} onChange={(event) => changeGroup(group.requestKey, (current) => ({ ...current, selected: event.target.checked }))} className="mt-1" />{group.photos.find((photo) => photo.slot === 'cover') ? <Photo compact photo={group.photos.find((photo) => photo.slot === 'cover')} label={`${groupName(group, index)} 표지`} /> : group.cover_image_url ? <img src={group.cover_image_url} alt="" className="h-16 w-12 shrink-0 object-contain" /> : null}<button type="button" aria-label={`교재 ${index + 1} 선택`} disabled={locked} onClick={() => activate(group)} className="min-w-0 flex-1 text-left"><p className="break-words text-sm font-semibold">{groupName(group, index)}</p><p className="mt-1 text-xs text-slate-500">{group.variants.length}개 옵션 · {intakeBookCount(group)}권 · 사진 {group.photos.length || (Number(Boolean(group.cover_image_url)) + group.inspection_image_urls.length)}장</p><p className={`mt-1 text-xs ${collectionGroupError(group) ? 'text-amber-800' : 'text-emerald-700'}`}>{group.held ? '보류됨' : collectionGroupError(group) || '등록 준비 완료'}</p></button></div><div className="mt-2 flex gap-3 text-xs"><button type="button" disabled={locked} className="text-slate-500 underline" onClick={() => changeGroup(group.requestKey, (current) => ({ ...current, held: !current.held, selected: current.held }))}>{group.held ? '보류 해제' : '보류'}</button><button type="button" disabled={locked || photoActions.has(group.requestKey)} className="text-rose-700 underline" onClick={() => {
          if (meaningful(group) && !window.confirm('이 교재와 임시 촬영 사진을 작업 목록에서 삭제할까요?')) return;
          mutate((state) => { const remaining = state.groups.filter((entry) => entry.requestKey !== group.requestKey); if (!remaining.length) remaining.push(newIntakeGroup()); return { ...state, groups: remaining, activeId: state.activeId === group.requestKey ? remaining[0].requestKey : state.activeId, captureSlot: 'cover' }; }, { deletePhotos: group.photos.map((photo) => photo.id) });
        }}>삭제</button></div></div>)}</div>
      </section><p className="px-1 text-xs text-slate-500">사진·입력 내용은 이 브라우저에 자동 저장됩니다. 새로고침 후에도 이어서 작업할 수 있습니다.</p>{legacyDraft ? <Link className="block text-xs text-slate-500 underline" to={`/admin/register?mode=batch&shipmentId=${shipment.id}`}>이전 등록 화면의 초안 열기</Link> : null}</aside>
      {workspace.phase === 'review' ? <div className="min-w-0 space-y-4"><BulkFields onInspect={inspectSelected} count={selected.length} disabled={locked || photoActions.size > 0} onApply={(values) => {
        mutate((state) => ({ ...state, groups: state.groups.map((group) => {
          if (!group.selected || group.held) return group;
          const patchValues = group.product_id ? Object.fromEntries(Object.entries(values).filter(([key]) => !['published_year', 'brand', 'subject', 'subject_detail', 'book_type'].includes(key))) : values;
          return patchIntakeGroup(group, patchValues);
        }) })); setMessage('선택한 교재에 공통 정보를 적용했습니다. 옵션별 예외와 각 교재의 상태를 확인하세요.');
      }} />
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{groupName(item, workspace.groups.indexOf(item))}</h2><button type="button" disabled={locked || photoActions.has(item.requestKey)} className={secondary} onClick={() => activate(item, 'capture')}>이 교재 사진 촬영·수정</button></div>
        {photoActions.has(item.requestKey) ? <p role="status" className="text-sm text-blue-700">교재 정보·사진 처리 중… 다른 교재를 계속 확인할 수 있습니다.</p> : null}
        <IntakeBookEditor key={item.requestKey} item={item} onChange={patch} disabled={locked || photoActions.has(item.requestKey)} onChooseProduct={chooseProduct} onConvertCover={convertCover} onRetryRecognition={retryRecognition} onProcessDetail={processDetail} />
        <section className="sticky bottom-3 rounded-xl border border-blue-200 bg-white p-4 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">선택 {selected.length}종 · {selectedBooks}권</p><p className="mt-1 text-xs text-slate-500">누락된 정보는 목록에서 확인하세요. 최대 100종·300권씩 등록합니다.</p></div><button type="button" aria-label="선택 교재 일괄 등록" disabled={locked || photoActions.size > 0 || !selected.length} className={primary} onClick={submit}>{busy || `선택 ${selectedBooks}권 한 번에 등록`}</button></div></section>
      </div> : null}
    </div>
    {workspace.completed.length ? <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold">이 수거건 등록 완료 내역 · {completedCount}권</summary><div className="mt-3 space-y-3">{workspace.completed.map((result) => <div key={result.requestKey} className="border-t border-slate-100 pt-3 text-sm"><p>{result.titles?.join(' / ') || '기존 등록 내역'} · {result.book_count || 1}권</p><div className="mt-1 flex flex-wrap gap-2">{(result.groups || [result]).map((group, index) => <span key={group.request_key || index} className="text-xs text-slate-500">{group.serial_number ? `일련번호 ${group.serial_number}` : group.books?.length ? `일련번호 ${group.books.map((book) => book.serial_number).join(', ')}` : `${group.book_count || 1}권 완료`}</span>)}</div></div>)}</div></details> : null}
  </AdminShell>;
}
