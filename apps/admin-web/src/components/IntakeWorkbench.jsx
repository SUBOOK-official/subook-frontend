import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@shared-supabase/adminSupabaseClient';
import { formatCurrency } from '@shared-domain/format';
import { bookConditionLabel } from '@shared-domain/status';
import AdminShell from './AdminShell';
import IntakeCamera from './IntakeCamera';
import IntakeBatchOptions from './IntakeBatchOptions';
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from '../lib/productCategories';
import { COVER_BUCKET, DETAIL_BUCKET, MAX_DETAIL_PHOTOS, uploadImageToBucket } from '../lib/adminImageUpload';
import { prepareStudioImagePayload, requestStudioGeneration, studioResultToFile } from '../lib/studioClient';
import { requestCoverScan } from '../lib/coverScanClient';
import { blankIntake, INTAKE_STEPS, intakeError, intakePayload, intakeBatchVariants, intakeBookCount, resolveIntakeVariant } from '../lib/intakeWorkbench';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100';
const secondary = 'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-40';
const primary = 'rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40';
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>; }
function SelectField({ label, value, options, onChange }) {
  return <Field label={label}><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">선택</option>{options.map((option) => <option key={option}>{option}</option>)}</select></Field>;
}
function readWorkspace(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (draft?.version === 1 && draft.active?.requestKey && Array.isArray(draft.held)) return {
      ...draft, active: { ...blankIntake(), ...draft.active }, held: draft.held.map((held) => ({ ...blankIntake(), ...held })),
    };
  } catch { /* 저장소를 사용할 수 없으면 새 작업으로 시작하고 저장 시 오류 안내 */ }
  return { version: 1, active: blankIntake(), held: [], completed: [], pending: null };
}
async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('로그인이 만료되었습니다. 다시 로그인하세요.');
  return data.session.access_token;
}
function localDate(value) {
  if (!value) return '날짜 미상';
  return new Date(value).toLocaleDateString('ko-KR');
}

export default function IntakeWorkbench({ shipment, onChangeCustomer, legacyDraft }) {
  const storageKey = `subook.admin.intake.v1.${shipment.id}`;
  const [workspace, setWorkspace] = useState(() => readWorkspace(storageKey));
  const item = workspace.active;
  const isBatch = item.mode === 'batch';
  const bookCount = isBatch ? intakeBookCount(item) : 1;
  const completedCount = workspace.completed.reduce((sum, entry) => sum + (entry.book_count || 1), 0);
  const itemRef = useRef(item);
  itemRef.current = item;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [prices, setPrices] = useState(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [priceRetry, setPriceRetry] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [comparisonId, setComparisonId] = useState('');
  const comparisonRow = item.variants.find((row) => row.id === comparisonId) || item.variants[0];
  const comparisonItem = isBatch && comparisonRow ? resolveIntakeVariant(item, comparisonRow) : item;
  const locked = Boolean(busy || workspace.pending);
  const patch = useCallback((values) => {
    setWorkspace((state) => ({ ...state, active: { ...state.active, ...values } }));
    setMessage('');
  }, []);
  const persist = useCallback((state) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setSaveError(''); setSavedAt(new Date()); return true;
    } catch {
      setSaveError('임시 저장 공간을 사용할 수 없습니다. 브라우저 저장 공간을 확인하세요.'); return false;
    }
  }, [storageKey]);
  useEffect(() => { const timer = setTimeout(() => persist(workspace), 350); return () => clearTimeout(timer); }, [workspace, persist]);
  useEffect(() => {
    const flush = () => persist(workspace);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [workspace, persist]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); setSearching(false); setSearchError(''); return undefined; }
    let active = true;
    setSearching(true); setSearchError('');
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('admin_search_products_for_register', { p_search: search.trim(), p_limit: 30, p_offset: 0 });
      if (!active) return;
      setResults(error ? [] : data || []);
      setSearchError(error ? '교재 검색에 실패했습니다. 다시 검색하세요.' : '');
      setSearching(false);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  useEffect(() => {
    if (item.step !== 3 || item.condition_grade === 'DISCARD') return undefined;
    let active = true;
    setPriceBusy(true); setPrices(null); setPriceError('');
    supabase.rpc('admin_intake_price_context', { p_item: {
      product_id: item.product_id, title: item.title, option: comparisonItem.option, condition_grade: comparisonItem.condition_grade,
      subject: item.subject, brand: item.brand, book_type: item.book_type, published_year: item.published_year,
    } }).then(({ data, error }) => {
      if (!active) return;
      setPrices(data); setPriceBusy(false);
      if (error) setPriceError('가격 자료를 불러오지 못했습니다. 다시 조회하거나 판매가를 직접 입력하세요.');
    }).catch(() => { if (active) { setPriceBusy(false); setPriceError('가격 자료 연결에 실패했습니다. 다시 조회하세요.'); } });
    return () => { active = false; };
  }, [item.step,item.product_id,item.title,comparisonItem.option,comparisonItem.condition_grade,item.subject,item.brand,item.book_type,item.published_year,priceRetry,item.condition_grade]);

  async function runJob(label, job) {
    if (busyRef.current || workspace.pending) return;
    busyRef.current = true; setBusy(label); setMessage('');
    try { await job(); } catch (error) { if (mounted.current) setMessage(error.message || '처리하지 못했습니다. 다시 시도하세요.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(''); }
  }
  const capture = useCallback((file) => {
    const snapshot = itemRef.current;
    runJob(snapshot.step === 2 ? '내지 사진 저장 중…' : '표지 저장·인식 중…', async () => {
      const prepared = await prepareStudioImagePayload(file);
      const compressed = new File([studioResultToFile(prepared, 'capture')], 'capture.jpg', { type: prepared.mimeType });
      const detail = snapshot.step === 2;
      const url = await uploadImageToBucket(detail ? DETAIL_BUCKET : COVER_BUCKET, compressed, `intake/${shipment.id}`);
      if (!mounted.current || itemRef.current.requestKey !== snapshot.requestKey) return;
      if (detail) {
        patch({ inspection_image_urls: [...snapshot.inspection_image_urls, url].slice(0, MAX_DETAIL_PHOTOS) });
        return;
      }
      patch({ scan_image_url: url, cover_image_url: url, step: 1 });
      setCandidates([]);
      // 업로드한 원본은 인식 실패 시에도 현재 책에 남아 수동 검색·재인식 가능.
      const result = await requestCoverScan(await accessToken(), prepared);
      if (!mounted.current || itemRef.current.requestKey !== snapshot.requestKey) return;
      setCandidates(result.candidates || []);
      const extracted = result.extracted || {};
      const title = extracted.published_year && !String(extracted.title || '').includes(String(extracted.published_year))
        ? `${extracted.published_year} ${extracted.title || ''}`.trim() : extracted.title || '';
      patch({ product_id: null, title, subject: SUBJECT_OPTIONS.includes(extracted.subject) ? extracted.subject : '',
        brand: BRAND_OPTIONS.includes(extracted.brand) ? extracted.brand : '', book_type: BOOK_TYPE_OPTIONS.includes(extracted.book_type) ? extracted.book_type : '',
        published_year: extracted.published_year || '', instructor_name: extracted.instructor_name || '', option: extracted.option || '', options: [], price: '', original_price: '' });
    });
  // runJob은 busyRef로 동시 촬영을 차단한다. 현재 책은 itemRef로 읽는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id, patch, workspace.pending]);

  async function chooseProduct(product) {
    runJob('교재 정보 확인 중…', async () => {
      let row = product;
      if (!Array.isArray(product.options)) {
        const { data, error } = await supabase.rpc('admin_search_products_for_register', { p_search: product.title, p_limit: 100, p_offset: 0 });
        if (error) throw error;
        row = data?.find((entry) => entry.id === product.id);
        if (!row) throw new Error('교재를 찾지 못했습니다. 검색어로 다시 확인하세요.');
      }
      const options = Array.isArray(row.options) ? row.options : [];
      patch({ product_id: row.id, title: row.title, subject: row.subject || '', brand: row.brand || '',
        book_type: row.book_type || '', published_year: row.published_year || '', instructor_name: row.instructor_name || '',
        cover_image_url: row.cover_image_url || itemRef.current.scan_image_url || '',
        original_price: row.representative_original_price || '', price: '',
        option: options.length === 1 ? options[0].option || '' : '', options, step: 1 });
      setSearch(''); setCandidates([]);
    });
  }
  function next() {
    const error = intakeError(item, item.step);
    if (error) { setMessage(error); return; }
    patch({ step: item.step === 2 && item.condition_grade === 'DISCARD' ? 4 : Math.min(4, item.step + 1) });
  }
  function hold() {
    if (!item.title.trim() && !item.scan_image_url) { setMessage('촬영하거나 교재를 입력한 뒤 보류하세요.'); return; }
    const state = { ...workspace, held: [...workspace.held, item], active: blankIntake(item.location, item.mode) };
    if (!persist(state)) return;
    setWorkspace(state); setSearch(''); setCandidates([]); setMessage('');
  }
  function resume(held) {
    const remaining = workspace.held.filter((entry) => entry.requestKey !== held.requestKey);
    if (item.title.trim() || item.scan_image_url) remaining.push(item);
    const state = { ...workspace, held: remaining, active: held };
    if (!persist(state)) return;
    setWorkspace(state); setCandidates([]); setSearch(''); setMessage('');
  }
  async function submit() {
    if (busyRef.current) return;
    if (!workspace.pending) {
      const error = intakeError(item, 4);
      if (error) { setMessage(error); return; }
    }
    const pending = workspace.pending || { requestKey: item.requestKey, item: intakePayload(item),
      ...(isBatch ? { kind: 'batch', variants: intakeBatchVariants(item) } : {}) };
    const state = { ...workspace, pending };
    if (!persist(state)) return;
    setWorkspace(state);
    busyRef.current = true; setBusy('등록 결과 확인 중…'); setMessage('');
    try {
      const { data, error } = await supabase.rpc(pending.kind === 'batch' ? 'admin_register_intake_batch' : 'admin_register_intake_book', {
        p_shipment_id: shipment.id, p_request_key: pending.requestKey,
        ...(pending.kind === 'batch' ? { p_common: pending.item, p_variants: pending.variants } : { p_item: pending.item }),
      });
      if (error) {
        // DB가 명시적으로 거부한 요청은 트랜잭션이 롤백되므로 수정 가능.
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) {
          const failed = { ...state, pending: null }; persist(failed); setWorkspace(failed);
        }
        throw new Error(error.message || '등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.');
      }
      if (!data?.success) throw new Error('등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.');
      const completed = { ...data, requestKey: pending.requestKey, location: item.location };
      const nextState = { ...state, pending: null, active: blankIntake(item.location, item.mode), completed: [completed, ...state.completed].slice(0, 100) };
      persist(nextState); setWorkspace(nextState); setLastResult(completed); setCandidates([]); setSearch('');
    } catch (error) { setMessage(error.message); }
    finally { busyRef.current = false; setBusy(''); }
  }
  async function convertCover() {
    runJob('AI 표지 가공 중…', async () => {
      const url = item.scan_image_url || item.cover_image_url;
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('원본 사진을 불러오지 못했습니다.');
      const file = new File([await response.blob()], 'cover.jpg', { type: response.headers.get('content-type') || 'image/jpeg' });
      const generated = await requestStudioGeneration(await accessToken(), await prepareStudioImagePayload(file));
      const result = await uploadImageToBucket(COVER_BUCKET, studioResultToFile(generated, 'cover'), `intake/${shipment.id}`);
      if (mounted.current) patch({ cover_image_url: result });
    });
  }

  return <AdminShell activeModule="register" title="상품 등록" description="교재를 분류하고 대표 사진으로 등록하는 작업대">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div><p className="text-xs font-semibold text-slate-500">현재 수거 건</p><p className="mt-1 font-bold text-slate-900">{shipment.seller_name} <span className="ml-2 text-sm font-normal text-slate-500">{shipment.pickup_date} · 등록 {completedCount}권 · 보류 {workspace.held.length}건</span></p></div>
      <div className="flex gap-3">{legacyDraft ? <Link to={`/admin/register?mode=batch&shipmentId=${shipment.id}`} className="text-sm text-slate-500 underline">이전 작성 내용 이어쓰기</Link> : null}<button type="button" className={secondary} disabled={locked} onClick={() => { if (persist(workspace)) onChangeCustomer(); }}>수거 건 변경</button><Link to={`/admin/shipments/${shipment.id}`} className={secondary}>수거 건 보기</Link></div>
    </div>
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p className="font-bold text-blue-900">먼저 같은 교재 종류끼리 분류해 주세요</p>
      <p className="mt-1 text-sm text-slate-700">학년도·과목·교재명이 같은 책을 모으세요. 예: 서바이벌 모의고사 1~30회는 대표 표지·내지를 한 번 촬영하고 여러 옵션으로 등록할 수 있습니다.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{[['single','한 권 등록'],['batch','같은 교재 여러 옵션 등록']].map(([mode,label]) => <button type="button" key={mode} disabled={locked || item.step>1} aria-pressed={item.mode===mode} className={`${secondary} ${item.mode===mode ? 'border-blue-700 text-blue-700 ring-1 ring-blue-700' : ''}`} onClick={() => patch({ mode, condition_grade: item.condition_grade==='DISCARD' && mode==='batch' ? '' : item.condition_grade })}>{label}</button>)}</div>
    </div>
    <ol className="mb-5 grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-2" aria-label="등록 진행 단계">{INTAKE_STEPS.map((label,index) => <li key={label} aria-current={item.step === index ? 'step' : undefined}><button type="button" disabled={locked || index > item.step} onClick={() => patch({ step: index })} className={`w-full rounded-lg px-2 py-3 text-sm font-bold disabled:cursor-default ${item.step === index ? 'bg-blue-700 text-white' : index < item.step ? 'text-blue-700' : 'text-slate-400'}`}><span className="mr-1">{index+1}</span><span className="hidden sm:inline">{label}</span></button></li>)}</ol>
    {lastResult ? <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-emerald-800">{lastResult.batch ? `${lastResult.option_count}개 옵션 · ${lastResult.book_count}권 등록 완료` : <>{lastResult.discarded ? '판매불가 기록 완료' : '등록 완료'} · 일련번호 <span className="text-xl">{lastResult.serial_number}</span></>}</p><p className="mt-1 text-sm text-emerald-800">{lastResult.title} · {lastResult.location || '위치 미지정'} · {lastResult.discarded ? '비공개' : lastResult.is_public ? '스토어 공개' : '비공개'}</p></div><button type="button" onClick={() => setLastResult(null)} aria-label="등록 완료 알림 닫기" className={secondary}>확인</button></div>{lastResult.batch ? <details className="mt-3 text-sm text-emerald-900"><summary className="cursor-pointer font-semibold">옵션별 일련번호 확인</summary><div className="mt-2 grid max-h-64 gap-2 overflow-auto sm:grid-cols-3">{lastResult.books.map((book) => <p key={book.book_id}>{book.option} · <strong>{book.serial_number}</strong></p>)}</div></details> : null}</div> : null}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <div className="space-y-4 xl:sticky xl:top-5">
        <IntakeCamera onCapture={capture} disabled={locked || ![0,2].includes(item.step) || (item.step===2 && item.inspection_image_urls.length>=MAX_DETAIL_PHOTOS)} label={item.step===2 ? '내지 촬영' : '표지 촬영'} />
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">보류한 책 <span className="text-amber-700">{workspace.held.length}</span></h2><span className="text-xs text-slate-500">이 브라우저에 자동 저장</span></div>{workspace.held.length ? <div className="mt-3 max-h-64 space-y-2 overflow-auto">{workspace.held.map((held) => <button key={held.requestKey} type="button" disabled={locked} onClick={() => resume(held)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-2 text-left disabled:opacity-40">{held.scan_image_url ? <img src={held.scan_image_url} alt="" className="h-12 w-10 rounded object-contain" /> : null}<span className="min-w-0 flex-1 truncate text-sm">{held.title || '교재 확인 필요'}</span><span className="text-xs text-blue-700">이어하기</span></button>)}</div> : <p className="mt-2 text-sm text-slate-500">가격 판단이 어려운 책은 보류 후 이어서 처리하세요.</p>}</div>
      </div>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="현재 교재 작업">
        <p className="text-xs font-bold text-blue-700">STEP {item.step+1} / 5</p><h2 className="mt-1 text-xl font-bold text-slate-900">{INTAKE_STEPS[item.step]}</h2>
        {busy ? <p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-700">{busy}</p> : null}
        {message ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}
        {saveError ? <p role="alert" className="mt-3 text-sm text-rose-700">{saveError}</p> : null}
        {workspace.pending ? <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p>등록 요청의 결과를 확인하고 있습니다. 같은 요청으로 다시 확인해도 재고가 중복 생성되지 않습니다.</p><button type="button" className={`${primary} mt-3`} disabled={Boolean(busy)} onClick={submit}>등록 결과 다시 확인</button></div> : null}
        <fieldset disabled={locked} className="mt-5 min-w-0 space-y-5 disabled:opacity-60">
          {item.step===0 ? <>
            <p className="text-sm text-slate-600">{isBatch ? '같은 교재 중 대표 한 권의 표지를 촬영하세요. 이 사진을 모든 회차·옵션에 함께 사용합니다.' : '표지가 화면에 꽉 차도록 놓고 촬영하세요.'}</p>
            {item.scan_image_url ? <img src={item.scan_image_url} alt="촬영한 표지" className="mx-auto max-h-72 rounded-lg object-contain" /> : <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">촬영하면 교재 후보가 여기에 표시됩니다.</div>}
            <button type="button" className={secondary} onClick={() => patch({ step: 1 })}>직접 검색·입력으로 시작</button>
          </> : null}
          {item.step===1 ? <>
            {candidates.length ? <div><p className="mb-2 text-sm font-semibold">표지 인식 후보 — 학년도·회차를 확인하세요</p><div className="space-y-2">{candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => chooseProduct(candidate)} className="w-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-left text-sm font-semibold">{candidate.title}</button>)}</div></div> : null}
            <Field label="기존 교재 검색"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="교재명 · 강사 · 과목" /></Field>
            {searching ? <p className="text-sm text-slate-500">검색 중…</p> : null}{searchError ? <p role="alert" className="text-sm text-rose-700">{searchError}</p> : null}
            {results.length ? <div className="max-h-64 space-y-2 overflow-auto">{results.map((product) => <button key={product.id} type="button" onClick={() => chooseProduct(product)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left">{product.cover_image_url ? <img src={product.cover_image_url} alt="" className="h-16 w-12 object-contain" /> : null}<span className="min-w-0"><span className="block text-sm font-bold">{product.title}</span><span className="text-xs text-slate-500">{product.published_year} · {product.brand} · {product.inventory_count ?? 0}권</span></span></button>)}{results.length===30 ? <p className="text-xs text-slate-500">검색 결과가 많습니다. 학년도·과목을 추가해 좁혀보세요.</p> : null}</div> : search && !searching && !searchError ? <p className="text-sm text-slate-500">검색 결과가 없습니다. 아래에 신규 교재 정보를 입력하세요.</p> : null}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-blue-700">{item.product_id ? '기존 교재에 재고 추가' : '신규 교재'}</span>{item.product_id ? <button type="button" onClick={() => patch({ product_id: null, options: [], price: '', cover_image_url: item.scan_image_url || '' })} className="text-xs underline">신규 교재로 변경</button> : null}</div>
              <Field label="교재명"><input className={inputClass} value={item.title} disabled={Boolean(item.product_id)} onChange={(event) => patch({ title: event.target.value })} placeholder={isBatch ? '예: 2027 서바이벌 수학 모의고사 (회차는 옵션에 입력)' : '학년도·회차가 구분되는 정확한 교재명'} /></Field>
              {!item.product_id ? <div className="mt-4 grid grid-cols-2 gap-3"><SelectField label="과목" value={item.subject} options={SUBJECT_OPTIONS} onChange={(subject) => patch({ subject })} /><SelectField label="브랜드" value={item.brand} options={BRAND_OPTIONS} onChange={(brand) => patch({ brand })} /><SelectField label="유형" value={item.book_type} options={BOOK_TYPE_OPTIONS} onChange={(book_type) => patch({ book_type })} /><Field label="학년도"><input type="number" min="2000" max="2100" className={inputClass} value={item.published_year} onChange={(event) => patch({ published_year: event.target.value })} /></Field><Field label="강사명 (선택)"><input className={inputClass} value={item.instructor_name} onChange={(event) => patch({ instructor_name: event.target.value })} /></Field></div> : <p className="mt-2 text-sm text-slate-500">{item.published_year} · {item.subject} · {item.brand} · {item.book_type}</p>}
              {!isBatch ? <div className="mt-4"><Field label="옵션·구성 (낱권·회차·세트)"><input list="intake-options" className={inputClass} value={item.option} onChange={(event) => patch({ option: event.target.value, price: '' })} placeholder="기본 구성은 비워두세요" /><datalist id="intake-options">{item.options.map((option,index) => <option key={index} value={option.option || ''} />)}</datalist></Field><p className="mt-2 text-xs text-slate-500">한 번 등록하면 재고 1개가 생성됩니다. 세트는 구성 전체를 확인하세요.</p></div> : <p className="mt-3 text-xs text-slate-600">상품명에는 공통 교재명을, 아래 옵션에는 각각의 회차를 입력하세요. 1~30회 전체를 한 세트로 등록하는 경우에는 한 권 등록을 사용하세요.</p>}
            </div>
            {isBatch ? <IntakeBatchOptions item={item} phase="options" onChange={(variants) => patch({ variants })} /> : null}
          </> : null}
          {item.step===2 ? <>
            <p className="font-semibold">{item.title} {isBatch ? `· ${item.variants.length}개 옵션 · ${bookCount}권 공통 상태` : item.option ? `· ${item.option}` : ''}</p>
            <div><p className="mb-2 text-sm font-semibold">{isBatch ? '공통 등급' : '등급'}</p><div className="grid grid-cols-2 gap-2">{Object.entries(bookConditionLabel).filter(([grade]) => !isBatch || grade !== 'DISCARD').map(([grade,label]) => <button type="button" key={grade} aria-pressed={item.condition_grade===grade} onClick={() => patch({ condition_grade: grade })} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${item.condition_grade===grade ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-300'}`}>{grade==='DISCARD' ? '판매불가' : label}</button>)}</div></div>
            {item.condition_grade==='DISCARD' ? <Field label="판매불가 사유"><textarea className={inputClass} value={item.discard_reason} onChange={(event) => patch({ discard_reason: event.target.value })} placeholder="필기 과다, 페이지 누락 등" /></Field> : <>
              <div><p className="text-sm font-semibold">필기 비율 (%)</p><div className="mt-2 flex gap-2"><button type="button" className={secondary} onClick={() => patch({ writing_percentage: '0' })}>필기 없음</button><input type="number" min="0" max="100" aria-label="필기 비율" className={`${inputClass} mt-0 min-w-0 flex-1`} value={item.writing_percentage} onChange={(event) => patch({ writing_percentage: event.target.value })} /></div></div>
              <div><p className="mb-2 text-sm font-semibold">손상 여부</p><div className="flex gap-2">{[[false,'손상 없음'],[true,'손상 있음']].map(([value,label]) => <button type="button" key={label} aria-pressed={item.has_damage===value} className={`${secondary} ${item.has_damage===value ? 'border-blue-700 bg-blue-50 text-blue-700' : ''}`} onClick={() => patch({ has_damage: value })}>{label}</button>)}</div></div>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={item.components_confirmed} onChange={(event) => patch({ components_confirmed: event.target.checked })} />{isBatch ? '모든 옵션의 답지·회차·구성품을 확인했습니다' : '답지·회차·세트 구성품을 확인했습니다'}</label>
            </>}
            <Field label="검수 메모 (선택)"><textarea className={inputClass} value={item.inspection_notes} onChange={(event) => patch({ inspection_notes: event.target.value })} /></Field>
            <div><p className="text-sm font-semibold">{isBatch ? '대표 내지 사진' : '내지 사진'} {item.inspection_image_urls.length}/{MAX_DETAIL_PHOTOS}</p><div className="mt-3 grid grid-cols-2 gap-3">{item.inspection_image_urls.map((url,index) => <div key={url} className="rounded-lg border border-slate-200 p-2"><img src={url} alt={`내지 사진 ${index+1}`} className="h-36 w-full object-contain" /><button type="button" className="mt-2 w-full text-xs text-rose-700 underline" onClick={() => patch({ inspection_image_urls: item.inspection_image_urls.filter((_,i) => i!==index) })}>삭제 후 다시 촬영</button></div>)}</div><p className="mt-2 text-xs text-slate-500">{isBatch ? '대표 한 권의 내지만 촬영하세요. 표지와 내지 사진이 모든 옵션에 공통 적용됩니다.' : '왼쪽 카메라에서 내지를 촬영하면 현재 책에 연결됩니다.'}</p></div>
            {isBatch ? <IntakeBatchOptions item={item} phase="inspection" onChange={(variants) => patch({ variants })} /> : null}
          </> : null}
          {item.step===3 ? <>
            <p className="font-semibold">{item.title} · {bookConditionLabel[comparisonItem.condition_grade]} {comparisonItem.option ? `· ${comparisonItem.option}` : ''}</p>
            {isBatch ? <Field label="가격 자료를 비교할 옵션"><select aria-label="가격 자료를 비교할 옵션" className={inputClass} value={comparisonRow?.id || ''} onChange={(event) => setComparisonId(event.target.value)}>{item.variants.map((row) => <option key={row.id} value={row.id}>{row.option} · {bookConditionLabel[resolveIntakeVariant(item, row).condition_grade]}</option>)}</select></Field> : null}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><Field label={isBatch ? '공통 판매가 (권당, 원)' : '판매가 (원)'}><input type="number" min="1" className={`${inputClass} text-xl font-bold`} value={item.price} onChange={(event) => patch({ price: event.target.value })} placeholder="비교 가격을 선택하거나 직접 입력" /></Field>{isBatch ? <p className="mt-2 text-xs text-slate-600">아래 비교 가격을 누르면 공통 판매가에 적용됩니다. 개별 입력한 옵션 가격은 유지됩니다.</p> : null}{prices?.recommended_price ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-blue-700">동일 옵션·등급의 최근 판매가 중앙값 <strong>{formatCurrency(prices.recommended_price)}</strong></p><button type="button" className={secondary} onClick={() => patch({ price: String(prices.recommended_price) })}>{isBatch ? '공통 가격으로 적용' : '이 가격 적용'}</button></div> : null}</div>
            {priceBusy ? <p role="status" className="text-sm text-slate-500">수북 판매 기록·현재 판매가 조회 중…</p> : null}
            {priceError ? <div role="alert" className="text-sm text-rose-700">{priceError}<button type="button" className={`${secondary} ml-2`} onClick={() => setPriceRetry((value) => value+1)}>다시 조회</button></div> : null}
            {prices ? <>
              <div><h3 className="font-bold">이 교재의 판매 기록</h3><p className="mt-1 text-xs text-slate-500">최근 20건 · 취소·환불 제외 · 주문 당시 상품 판매가 기준</p>{prices.sales?.length ? <div className="mt-3 max-h-60 space-y-2 overflow-auto">{prices.sales.map((sale) => <button key={`${sale.source}-${sale.id}`} type="button" onClick={() => patch({ price: String(sale.price) })} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left"><span className="text-sm"><span className="font-semibold">{sale.option || '기본 구성'} · {bookConditionLabel[sale.condition_grade] || sale.condition_grade}</span><span className="mt-1 block text-xs text-slate-500">{localDate(sale.sold_at)} · {sale.source==='legacy' ? '기존 판매 기록' : '주문 판매 기록'}{sale.exact_match ? ' · 동일 조건' : ' · 옵션·등급 비교 필요'}</span></span><span className="shrink-0 text-sm font-bold text-blue-700">{formatCurrency(sale.price)} 적용</span></button>)}</div> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">판매 기록이 없습니다. 현재 판매 중인 교재와 비교하세요.</p>}</div>
              <div><h3 className="font-bold">수북에서 현재 판매 중</h3><p className="mt-1 text-xs text-slate-500">학년도·등급·낱권/세트 구성을 비교하세요. 적용 가격은 해당 구성의 중앙값입니다.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{prices.listings?.map((listing,index) => <button key={index} type="button" onClick={() => patch({ price: String(listing.price) })} className="rounded-lg border border-slate-200 p-3 text-left"><div className="flex gap-3">{listing.cover_image_url ? <img src={listing.cover_image_url} alt="" className="h-20 w-14 shrink-0 object-contain" /> : null}<span className="text-sm font-semibold">{listing.title}</span></div><p className="mt-2 text-xs text-slate-600">{listing.published_year} · {bookConditionLabel[listing.condition_grade]} · {listing.option || '기본 구성'}</p><p className="mt-1 text-xs text-slate-500">재고 {listing.stock_count}개{listing.min_price!==listing.max_price ? ` · ${formatCurrency(listing.min_price)}~${formatCurrency(listing.max_price)}` : ''}</p><p className="mt-2 font-bold text-blue-700">{formatCurrency(listing.price)} 적용</p></button>)}</div>{!prices.listings?.length ? <p className="mt-3 text-sm text-slate-500">비교할 판매 중 교재가 없습니다. 가격을 직접 입력하거나 보류하세요.</p> : null}</div>
            </> : null}
            <Field label="정가 (원, 확인되는 경우만)"><input type="number" min="1" className={inputClass} value={item.original_price} onChange={(event) => patch({ original_price: event.target.value })} placeholder="정가 미상·비매품은 비워두세요" /></Field>
            {isBatch ? <IntakeBatchOptions item={item} phase="price" onChange={(variants) => patch({ variants })} /> : null}
          </> : null}
          {item.step===4 ? <>
            <div className="flex gap-4 rounded-lg bg-slate-50 p-4">{item.cover_image_url ? <img src={item.cover_image_url} alt="등록할 표지" className="h-32 w-24 object-contain" /> : null}<div><p className="font-bold">{item.title}</p><p className="mt-2 text-sm text-slate-600">{isBatch ? `${item.variants.length}개 옵션 · 총 ${bookCount}권` : `${item.option || '기본 구성'} · ${bookConditionLabel[item.condition_grade]}`}</p><p className="mt-2 text-xl font-bold">{isBatch ? `판매가 합계 ${formatCurrency(item.variants.reduce((sum,row) => sum + Number(resolveIntakeVariant(item,row).price) * Number(row.quantity),0))}` : item.condition_grade==='DISCARD' ? '판매불가' : formatCurrency(Number(item.price))}</p><p className="mt-2 text-xs text-slate-500">{isBatch ? '전체 옵션 공통 · ' : ''}내지 사진 {item.inspection_image_urls.length}장</p></div></div>
            {item.condition_grade!=='DISCARD' ? <>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="보관 위치"><input className={inputClass} value={item.location} onChange={(event) => patch({ location: event.target.value })} placeholder="예: A-2" /></Field><Field label={isBatch ? '시작 일련번호 (비우면 자동 배정)' : '일련번호 (비우면 자동 배정)'}><input type="number" min="1" className={inputClass} value={item.serial_number} onChange={(event) => patch({ serial_number: event.target.value })} /></Field></div>
              {isBatch ? <p className="text-xs text-slate-600">옵션 목록 순서대로 수량만큼 각각 재고가 생성됩니다.{item.serial_number && Number(item.serial_number)>0 ? ` 일련번호 ${item.serial_number}~${Number(item.serial_number)+bookCount-1}` : ' 각 재고의 일련번호는 등록 완료 후 확인할 수 있습니다.'}</p> : null}
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={item.is_public} onChange={(event) => patch({ is_public: event.target.checked })} />등록 후 스토어 공개</label>
              {!item.product_id && item.cover_image_url ? <div className="flex flex-wrap items-center gap-3"><button type="button" className={secondary} onClick={convertCover}>표지를 AI 상품 사진으로 가공</button>{item.scan_image_url && item.scan_image_url!==item.cover_image_url ? <button type="button" className="text-sm underline" onClick={() => patch({ cover_image_url: item.scan_image_url })}>촬영 원본 사용</button> : null}</div> : null}
            </> : <p className="text-sm text-rose-700">판매불가 사유: {item.discard_reason}</p>}
            {isBatch ? <IntakeBatchOptions item={item} phase="review" onChange={(variants) => patch({ variants })} /> : null}
          </> : null}
        </fieldset>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex gap-2">{item.step>0 ? <button type="button" disabled={locked} className={secondary} onClick={() => patch({ step: item.step===4 && item.condition_grade==='DISCARD' ? 2 : item.step-1 })}>이전</button> : null}<button type="button" disabled={locked} className={secondary} onClick={hold}>{isBatch ? '보류·다음 교재' : '보류·다음 책'}</button></div>
          {item.step===4 ? <button type="button" disabled={locked} onClick={submit} className={primary}>{isBatch ? `${bookCount}권 일괄 등록` : item.condition_grade==='DISCARD' ? '판매불가 기록·다음 책' : '등록·다음 책'}</button> : item.step>0 || item.scan_image_url ? <button type="button" disabled={locked} onClick={next} className={primary}>{item.step===2 ? '확인·가격 결정' : '확인·다음'}</button> : null}
        </div>
        {savedAt && !saveError ? <p className="mt-3 text-right text-xs text-slate-400">{savedAt.toLocaleTimeString('ko-KR')} 자동 저장</p> : null}
      </section>
    </div>
  </AdminShell>;
}
