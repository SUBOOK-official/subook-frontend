import { useEffect, useState } from 'react';
import { supabase } from '@shared-supabase/adminSupabaseClient';
import { formatCurrency } from '@shared-domain/format';
import { bookConditionLabel } from '@shared-domain/status';
import IntakeBatchOptions from './IntakeBatchOptions';
import { BOOK_TYPE_OPTIONS, BRAND_OPTIONS, SUBJECT_OPTIONS } from '../lib/productCategories';
import { SUBJECT_DETAIL_GROUPS } from '../lib/intakeCatalog';
import { MAX_DETAIL_PHOTOS } from '../lib/adminImageUpload';
import { intakeBookCount, isIntakeBatch, resolveIntakeVariant } from '../lib/intakeWorkbench';

const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100';
const secondary = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40';
const cardClass = 'min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4';

function Field({ label, children }) {
  return <label className="block min-w-0 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

function SelectField({ label, value, options, onChange, disabled }) {
  return <Field label={label}>
    <select aria-label={label} className={inputClass} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">선택</option>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  </Field>;
}

function localDate(value) {
  if (!value) return '날짜 미상';
  return new Date(value).toLocaleDateString('ko-KR');
}

// 조회 지연이 편집을 막지 않도록 제한 시간을 두고 읽기 요청만 한 번 재시도한다.
async function queryWithRetry(name, args, isActive) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timeout;
    try {
      const result = await Promise.race([
        supabase.rpc(name, args),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('조회 시간이 초과되었습니다.')), 12000); }),
      ]);
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      if (!isActive() || attempt === 1) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default function IntakeBookEditor({ item, onChange, disabled = false, onChooseProduct, onConvertCover, onRetryRecognition }) {
  const [search, setSearch] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [comparisonId, setComparisonId] = useState('');
  const [prices, setPrices] = useState(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [priceRetry, setPriceRetry] = useState(0);
  const [showPrices, setShowPrices] = useState(!item.price);
  const variants = item.variants || [];
  const isBatch = isIntakeBatch(item);
  const bookCount = intakeBookCount(item);
  const discarded = item.condition_grade === 'DISCARD';
  const comparisonRow = variants.find((row) => row.id === comparisonId) || variants[0];
  const comparisonItem = comparisonRow ? resolveIntakeVariant(item, comparisonRow) : item;
  const detailGroups = SUBJECT_DETAIL_GROUPS[item.subject] || [];
  const priceQuery = JSON.stringify({
    product_id: item.product_id, title: item.title, option: comparisonItem.option,
    condition_grade: comparisonItem.condition_grade, subject: item.subject,
    brand: item.brand, book_type: item.book_type, published_year: item.published_year,
  });
  const canCompare = Boolean(item.product_id || item.title?.trim());
  const change = (values) => { if (!disabled) onChange(values); };

  useEffect(() => {
    setResults([]);
    setSearchError('');
    if (!search.trim()) { setSearching(false); return undefined; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await queryWithRetry('admin_search_products_for_register', {
          p_search: search.trim(), p_limit: 30, p_offset: 0,
        }, () => active);
        if (active) setResults(data || []);
      } catch {
        if (active) setSearchError('교재 검색에 실패했습니다. 다시 조회하거나 신규 교재 정보를 입력하세요.');
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [item.requestKey, search, searchRetry]);

  useEffect(() => {
    setPrices(null);
    setPriceError('');
    if (discarded || !canCompare) { setPriceBusy(false); return undefined; }
    let active = true;
    setPriceBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await queryWithRetry('admin_intake_price_context', { p_item: JSON.parse(priceQuery) }, () => active);
        if (active) setPrices(data);
      } catch {
        if (active) setPriceError('가격 자료를 불러오지 못했습니다. 다시 조회하거나 판매가를 직접 입력하세요.');
      } finally {
        if (active) setPriceBusy(false);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [item.requestKey, priceQuery, priceRetry, discarded, canCompare]);

  function selectProduct(product) {
    if (!disabled) onChooseProduct(product);
  }

  return <fieldset disabled={disabled} aria-label="선택 교재 정보 편집" className="min-w-0 space-y-5">
    <section className={cardClass} aria-label="교재 정보">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">교재 정보·옵션</h2>
        <span className="text-xs font-semibold text-blue-700">{variants.length}개 옵션 · {bookCount}권</span>
      </div>
      {item.recognition_error ? <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        <p>{item.recognition_error}</p>
        {onRetryRecognition ? <button type="button" disabled={disabled} onClick={onRetryRecognition} className={`${secondary} mt-2`}>표지 인식 다시 시도</button> : null}
      </div> : null}
      {item.candidates?.length ? <div>
        <p className="mb-2 text-sm font-semibold">표지 인식 후보</p>
        <div className="max-h-44 space-y-2 overflow-auto">
          {item.candidates.map((candidate) => <button type="button" key={candidate.id} disabled={disabled} onClick={() => selectProduct(candidate)} className="w-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-left text-sm font-semibold disabled:opacity-40">{candidate.title}</button>)}
        </div>
      </div> : null}
      <Field label="기존 교재 검색">
        <input type="search" aria-label="기존 교재 검색" disabled={disabled} value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="교재명 · 강사 · 과목" />
      </Field>
      {searching ? <p role="status" className="text-sm text-slate-500">검색 중…</p> : null}
      {searchError ? <div role="alert" className="text-sm text-rose-700">{searchError}<button type="button" disabled={disabled} className={`${secondary} ml-2`} onClick={() => setSearchRetry((value) => value + 1)}>검색 다시 조회</button></div> : null}
      {results.length ? <div className="max-h-56 space-y-2 overflow-auto">
        {results.map((product) => <button key={product.id} type="button" disabled={disabled} onClick={() => selectProduct(product)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left disabled:opacity-40">
          {product.cover_image_url ? <img src={product.cover_image_url} alt="" loading="lazy" className="h-16 w-12 shrink-0 object-contain" /> : null}
          <span className="min-w-0"><span className="block break-words text-sm font-bold">{product.title}</span><span className="text-xs text-slate-500">{product.published_year} · {product.brand} · {product.inventory_count ?? 0}권</span></span>
        </button>)}
        {results.length === 30 ? <p className="text-xs text-slate-500">검색 결과가 많습니다. 학년도·과목을 추가해 좁혀보세요.</p> : null}
      </div> : search && !searching && !searchError ? <p className="text-sm text-slate-500">검색 결과가 없습니다. 아래에 신규 교재 정보를 입력하세요.</p> : null}
      <div className="space-y-4 rounded-lg bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-blue-700">{item.product_id ? '기존 교재에 재고 추가' : '신규 교재'}</span>
          {item.product_id ? <button type="button" disabled={disabled} className="text-xs underline disabled:opacity-40" onClick={() => change({ product_id: null, options: [], price: '', cover_image_url: item.scan_image_url || '' })}>신규 교재로 변경</button> : null}
        </div>
        {!item.product_id ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="학년도"><input type="number" min="2000" max="2100" aria-label="학년도" className={inputClass} value={item.published_year || ''} disabled={disabled} onChange={(event) => change({ published_year: event.target.value })} placeholder="예: 2027" /></Field>
            <SelectField label="브랜드" value={item.brand} options={BRAND_OPTIONS} disabled={disabled} onChange={(brand) => change({ brand })} />
          </div>
          <Field label="책 제목"><input aria-label="책 제목" className={inputClass} value={item.title_core || ''} disabled={disabled} onChange={(event) => change({ title_core: event.target.value })} placeholder="예: 백야 Assignment (단원·회차는 아래 옵션에 입력)" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="과목" value={item.subject} options={SUBJECT_OPTIONS} disabled={disabled} onChange={(subject) => change({ subject, subject_detail: '' })} />
            {detailGroups.length ? <Field label="하위 과목 (선택)">
              <select aria-label="하위 과목 (선택)" className={inputClass} value={item.subject_detail || ''} disabled={disabled} onChange={(event) => change({ subject_detail: event.target.value })}>
                <option value="">선택 안 함 · {item.subject}</option>
                {detailGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option}>{option}</option>)}</optgroup>)}
              </select>
            </Field> : null}
            <SelectField label="유형" value={item.book_type} options={BOOK_TYPE_OPTIONS} disabled={disabled} onChange={(book_type) => change({ book_type })} />
            <Field label="강사명 (선택)"><input aria-label="강사명 (선택)" className={inputClass} value={item.instructor_name || ''} disabled={disabled} onChange={(event) => change({ instructor_name: event.target.value })} placeholder="예: 박선" /></Field>
          </div>
        </> : <p className="text-sm text-slate-600">{item.published_year} · {item.subject_detail || item.subject} · {item.brand} · {item.book_type}</p>}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">{item.product_id ? '등록할 상품명' : '자동 완성 상품명'}</p>
          <output aria-label="완성 상품명" className="mt-1 block break-words font-bold text-slate-900">{item.title || '학년도·브랜드·책 제목·과목을 입력하세요'}</output>
        </div>
        <IntakeBatchOptions item={item} phase="options" onChange={(nextVariants) => change({ variants: nextVariants })} />
      </div>
    </section>

    <section className={cardClass} aria-label="검수 상태">
      <h2 className="text-base font-bold">검수 상태</h2>
      <div>
        <p className="mb-2 text-sm font-semibold">{isBatch ? '공통 등급' : '등급'}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(bookConditionLabel).filter(([grade]) => !isBatch || grade !== 'DISCARD').map(([grade, label]) => <button type="button" key={grade} disabled={disabled} aria-pressed={item.condition_grade === grade} onClick={() => change({ condition_grade: grade })} className={`rounded-lg border px-2 py-3 text-sm font-semibold disabled:opacity-40 ${item.condition_grade === grade ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-300'}`}>{grade === 'DISCARD' ? '판매불가' : label}</button>)}
        </div>
      </div>
      {discarded ? <Field label="판매불가 사유"><textarea aria-label="판매불가 사유" className={inputClass} value={item.discard_reason || ''} disabled={disabled} onChange={(event) => change({ discard_reason: event.target.value })} placeholder="필기 과다, 페이지 누락 등" /></Field> : <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">필기 비율 (%)</p>
            <div className="mt-2 flex gap-2"><button type="button" disabled={disabled} className={`${secondary} shrink-0`} onClick={() => change({ writing_percentage: '0' })}>필기 없음</button><input type="number" min="0" max="100" aria-label="필기 비율" className={`${inputClass} mt-0 flex-1`} value={item.writing_percentage ?? ''} disabled={disabled} onChange={(event) => change({ writing_percentage: event.target.value })} /></div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">손상 여부</p>
            <div className="flex flex-wrap gap-2">{[[false, '손상 없음'], [true, '손상 있음']].map(([value, label]) => <button type="button" key={label} disabled={disabled} aria-pressed={item.has_damage === value} className={`${secondary} ${item.has_damage === value ? 'border-blue-700 bg-blue-50 text-blue-700' : ''}`} onClick={() => change({ has_damage: value })}>{label}</button>)}</div>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" disabled={disabled} checked={Boolean(item.components_confirmed)} onChange={(event) => change({ components_confirmed: event.target.checked })} />{isBatch ? '모든 옵션의 답지·회차·구성품을 확인했습니다' : '답지·회차·세트 구성품을 확인했습니다'}</label>
      </>}
      <Field label="검수 메모 (선택)"><textarea aria-label="검수 메모 (선택)" className={inputClass} value={item.inspection_notes || ''} disabled={disabled} rows={2} onChange={(event) => change({ inspection_notes: event.target.value })} /></Field>
      {isBatch && !discarded ? <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">상태가 다른 옵션 수정</summary>
        <div className="mt-3"><IntakeBatchOptions item={item} phase="inspection" onChange={(nextVariants) => change({ variants: nextVariants })} /></div>
      </details> : null}
    </section>

    {!discarded ? <section className={cardClass} aria-label="판매 가격">
      <h2 className="text-base font-bold">판매 가격</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={isBatch ? '공통 판매가 (권당, 원)' : '판매가 (원)'}><input type="number" min="1" aria-label={isBatch ? '공통 판매가 (권당, 원)' : '판매가 (원)'} className={`${inputClass} font-bold`} value={item.price ?? ''} disabled={disabled} onChange={(event) => change({ price: event.target.value })} placeholder="판매 기록 비교 또는 직접 입력" /></Field>
        <Field label="정가 (원, 확인되는 경우만)"><input type="number" min="1" aria-label="정가 (원, 확인되는 경우만)" className={inputClass} value={item.original_price ?? ''} disabled={disabled} onChange={(event) => change({ original_price: event.target.value })} placeholder="정가 미상·비매품은 비워두세요" /></Field>
      </div>
      {prices?.recommended_price ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-50 p-3">
        <p className="text-sm text-blue-700">동일 옵션·등급의 최근 판매가 중앙값 <strong>{formatCurrency(prices.recommended_price)}</strong></p>
        <button type="button" disabled={disabled} className={secondary} onClick={() => change({ price: String(prices.recommended_price) })}>{isBatch ? '공통 가격으로 적용' : '이 가격 적용'}</button>
      </div> : null}
      <details open={showPrices} onToggle={(event) => setShowPrices(event.currentTarget.open)} className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">수북 판매 기록·현재 판매가 비교</summary>
        <div className="mt-4 space-y-4">
          {isBatch ? <Field label="가격 자료를 비교할 옵션"><select aria-label="가격 자료를 비교할 옵션" className={inputClass} value={comparisonRow?.id || ''} disabled={disabled} onChange={(event) => setComparisonId(event.target.value)}>{variants.map((row) => <option key={row.id} value={row.id}>{row.option || '기본 구성'} · {bookConditionLabel[resolveIntakeVariant(item, row).condition_grade] || '등급 미선택'}</option>)}</select></Field> : null}
          {isBatch ? <p className="text-xs text-slate-500">비교 가격은 공통 판매가에 적용하며, 따로 입력한 옵션 가격은 유지됩니다.</p> : null}
          {priceBusy ? <p role="status" className="text-sm text-slate-500">수북 판매 기록·현재 판매가 조회 중…</p> : null}
          {priceError ? <div role="alert" className="text-sm text-rose-700">{priceError}<button type="button" disabled={disabled} className={`${secondary} ml-2`} onClick={() => setPriceRetry((value) => value + 1)}>가격 다시 조회</button></div> : null}
          {!canCompare ? <p className="text-sm text-slate-500">교재 정보를 입력하면 비교할 가격을 조회합니다.</p> : null}
          {prices ? <>
            <div>
              <h3 className="text-sm font-bold">이 교재의 판매 기록</h3>
              <p className="mt-1 text-xs text-slate-500">최근 20건 · 취소·환불 제외 · 주문 당시 상품 판매가</p>
              {prices.sales?.length ? <div className="mt-3 max-h-56 space-y-2 overflow-auto">{prices.sales.map((sale) => <button key={`${sale.source}-${sale.id}`} type="button" disabled={disabled} onClick={() => change({ price: String(sale.price) })} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left disabled:opacity-40">
                <span className="min-w-0 text-sm"><span className="font-semibold">{sale.option || '기본 구성'} · {bookConditionLabel[sale.condition_grade] || sale.condition_grade}</span><span className="mt-1 block text-xs text-slate-500">{localDate(sale.sold_at)} · {sale.source === 'legacy' ? '기존 판매 기록' : '주문 판매 기록'}{sale.exact_match ? ' · 동일 조건' : ' · 옵션·등급 비교 필요'}</span></span>
                <span className="shrink-0 text-sm font-bold text-blue-700">{formatCurrency(sale.price)} 적용</span>
              </button>)}</div> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">판매 기록이 없습니다. 현재 판매 중인 교재와 비교하세요.</p>}
            </div>
            <div>
              <h3 className="text-sm font-bold">수북에서 현재 판매 중</h3>
              <p className="mt-1 text-xs text-slate-500">학년도·등급·낱권/세트 구성을 비교하세요. 적용 가격은 해당 구성의 중앙값입니다.</p>
              <div className="mt-3 grid max-h-80 gap-3 overflow-auto sm:grid-cols-2">{prices.listings?.map((listing, index) => <button key={index} type="button" disabled={disabled} onClick={() => change({ price: String(listing.price) })} className="rounded-lg border border-slate-200 p-3 text-left disabled:opacity-40">
                <div className="flex gap-3">{listing.cover_image_url ? <img src={listing.cover_image_url} alt="" loading="lazy" className="h-20 w-14 shrink-0 object-contain" /> : null}<span className="min-w-0 break-words text-sm font-semibold">{listing.title}</span></div>
                <p className="mt-2 text-xs text-slate-600">{listing.published_year} · {bookConditionLabel[listing.condition_grade]} · {listing.option || '기본 구성'}</p>
                <p className="mt-1 text-xs text-slate-500">재고 {listing.stock_count}개{listing.min_price !== listing.max_price ? ` · ${formatCurrency(listing.min_price)}~${formatCurrency(listing.max_price)}` : ''}</p>
                <p className="mt-2 font-bold text-blue-700">{formatCurrency(listing.price)} 적용</p>
              </button>)}</div>
              {!prices.listings?.length ? <p className="mt-3 text-sm text-slate-500">비교할 판매 중 교재가 없습니다. 가격을 직접 입력하거나 보류하세요.</p> : null}
            </div>
          </> : null}
        </div>
      </details>
      {isBatch ? <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">가격이 다른 옵션 수정</summary>
        <div className="mt-3"><IntakeBatchOptions item={item} phase="price" onChange={(nextVariants) => change({ variants: nextVariants })} /></div>
      </details> : null}
    </section> : null}

    <section className={cardClass} aria-label="사진·보관 정보">
      <h2 className="text-base font-bold">사진·보관 정보</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="min-w-0"><p className="mb-2 text-xs font-semibold">대표 표지</p>{item.cover_image_url ? <img src={item.cover_image_url} alt="등록할 대표 표지" className="h-36 w-full rounded-lg border border-slate-200 object-contain" /> : <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">표지 없음</div>}</div>
        {(item.inspection_image_urls || []).map((url, index) => <div key={`${url}-${index}`} className="min-w-0"><p className="mb-2 text-xs font-semibold">대표 내지 {index + 1}</p><img src={url} alt={`내지 사진 ${index + 1}`} className="h-36 w-full rounded-lg border border-slate-200 object-contain" /><button type="button" aria-label={`내지 사진 ${index + 1} 삭제`} disabled={disabled} className="mt-2 w-full text-xs text-rose-700 underline disabled:opacity-40" onClick={() => change({ inspection_image_urls: item.inspection_image_urls.filter((_, photoIndex) => photoIndex !== index) })}>삭제 후 다시 촬영</button></div>)}
      </div>
      <p className="text-xs text-slate-500">내지 {(item.inspection_image_urls || []).length}/{MAX_DETAIL_PHOTOS}장 · 대표 사진은 이 교재의 모든 옵션에 공통 적용됩니다.</p>
      {!discarded ? <>
        {!item.product_id && item.cover_image_url && onConvertCover ? <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={disabled} className={secondary} onClick={onConvertCover}>표지를 AI 상품 사진으로 가공</button>
          {item.scan_image_url && item.scan_image_url !== item.cover_image_url ? <button type="button" disabled={disabled} className="text-sm underline disabled:opacity-40" onClick={() => change({ cover_image_url: item.scan_image_url })}>촬영 원본 사용</button> : null}
        </div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="보관 위치"><input aria-label="보관 위치" className={inputClass} value={item.location || ''} disabled={disabled} onChange={(event) => change({ location: event.target.value })} placeholder="예: A-2" /></Field>
          <Field label={isBatch ? '시작 일련번호 (비우면 자동 배정)' : '일련번호 (비우면 자동 배정)'}><input type="number" min="1" aria-label={isBatch ? '시작 일련번호 (비우면 자동 배정)' : '일련번호 (비우면 자동 배정)'} className={inputClass} value={item.serial_number ?? ''} disabled={disabled} onChange={(event) => change({ serial_number: event.target.value })} /></Field>
        </div>
        {isBatch && item.serial_number && Number(item.serial_number) > 0 ? <p className="text-xs text-slate-600">옵션 순서대로 일련번호 {item.serial_number}~{Number(item.serial_number) + bookCount - 1}</p> : null}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={disabled} checked={Boolean(item.is_public)} onChange={(event) => change({ is_public: event.target.checked })} />등록 후 스토어 공개</label>
      </> : null}
    </section>
  </fieldset>;
}
