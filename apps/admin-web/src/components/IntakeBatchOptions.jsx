import { useState } from 'react';
import { bookConditionLabel } from '@shared-domain/status';
import { formatCurrency } from '@shared-domain/format';
import { createIntakeRange, intakeBookCount, mergeIntakeVariants, newIntakeVariant, optionKey, resolveIntakeVariant } from '../lib/intakeWorkbench';

const input = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold';
const grades = Object.entries(bookConditionLabel).filter(([grade]) => grade !== 'DISCARD');

export default function IntakeBatchOptions({ item, onChange, phase }) {
  const [range, setRange] = useState({ start: '1', end: '30', prefix: '', suffix: '회', quantity: '1' });
  const [error, setError] = useState('');
  const rows = item.variants || [];
  const update = (id, values) => onChange(rows.map((row) => row.id === id ? { ...row, ...values } : row));
  function add(added) {
    try { onChange(mergeIntakeVariants(rows, added)); setError(''); }
    catch (err) { setError(err.message); }
  }
  function addRange() {
    try { add(createIntakeRange(range.start, range.end, range.prefix, range.suffix, range.quantity)); }
    catch (err) { setError(err.message); }
  }
  const existing = (item.options || []).filter((option) => option.option && !rows.some((row) => optionKey(row.option) === optionKey(option.option)));
  return <div className="space-y-3" aria-label="여러 옵션 등록">
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{phase === 'inspection' ? '옵션별 상태 차이' : phase === 'price' ? '옵션별 판매가' : phase === 'review' ? '등록할 옵션 확인' : '회차·옵션 구성'}</h3><span className="shrink-0 text-sm font-bold text-blue-700">{rows.length}개 옵션 · {intakeBookCount(item)}권</span></div>
    {phase === 'options' ? <>
      <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm font-semibold">연속 회차 한 번에 추가</p>
        <div className="grid grid-cols-3 gap-2">
          {[['start','시작 회차'],['end','끝 회차'],['quantity','회차별 수량']].map(([key,label]) => <label key={key} className="text-xs font-semibold">{label}<input type="number" min="1" className={`${input} mt-1`} value={range[key]} onChange={(event) => setRange({ ...range, [key]: event.target.value })} /></label>)}
        </div>
        <div className="grid grid-cols-2 gap-2">{[['prefix','회차 앞 문구'],['suffix','회차 뒤 문구']].map(([key,label]) => <label key={key} className="text-xs font-semibold">{label}<input className={`${input} mt-1`} value={range[key]} onChange={(event) => setRange({ ...range, [key]: event.target.value })} placeholder={key === 'prefix' ? '예: 시즌1 ' : '예: 회'} /></label>)}</div>
        <button type="button" className={`${button} w-full`} onClick={addRange}>회차 범위 추가</button>
        <p className="text-xs text-slate-600">예: 1~30회 → 옵션 30개. 이미 추가한 옵션은 유지됩니다.</p>
      </div>
      {existing.length ? <div><p className="mb-2 text-xs font-semibold text-slate-600">기존 옵션에서 추가</p><div className="flex max-h-28 flex-wrap gap-2 overflow-auto">{existing.map((option, index) => <button type="button" className={button} key={index} onClick={() => add([newIntakeVariant(option.option)])}>+ {option.option}</button>)}</div></div> : null}
    </> : null}
    {phase === 'inspection' ? <p className="text-xs text-slate-500">기본은 위의 공통 상태입니다. 다른 회차만 펼쳐 수정하세요. 사진으로 따로 보여줘야 하는 손상은 별도로 촬영·등록하세요.</p> : null}
    {phase === 'price' ? <p className="text-xs text-slate-500">가격을 비워두면 공통 판매가를 사용합니다. 입력하는 가격은 권당 가격입니다.</p> : null}
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg" aria-label="옵션 목록">
      {rows.map((row, index) => {
        const resolved = resolveIntakeVariant(item, row);
        const label = row.option || `${index + 1}번째 옵션`;
        if (phase === 'inspection') return <details key={row.id} className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{label} · {row.quantity}권 · {bookConditionLabel[resolved.condition_grade] || '등급 미선택'}</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold">등급<select className={`${input} mt-1`} aria-label={`${label} 등급`} value={row.condition_grade} onChange={(event) => update(row.id, { condition_grade: event.target.value })}><option value="">공통 등급</option>{grades.map(([grade,text]) => <option key={grade} value={grade}>{text}</option>)}</select></label>
            <label className="text-xs font-semibold">필기 비율 (%)<input type="number" min="0" max="100" aria-label={`${label} 필기 비율`} className={`${input} mt-1`} value={row.writing_percentage} placeholder={`공통 ${item.writing_percentage || '0'}%`} onChange={(event) => update(row.id, { writing_percentage: event.target.value })} /></label>
            <label className="text-xs font-semibold">손상 여부<select className={`${input} mt-1`} aria-label={`${label} 손상 여부`} value={row.has_damage === null ? '' : String(row.has_damage)} onChange={(event) => update(row.id, { has_damage: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">공통 상태</option><option value="false">손상 없음</option><option value="true">손상 있음</option></select></label>
            <label className="text-xs font-semibold">개별 메모<input className={`${input} mt-1`} value={row.inspection_notes} aria-label={`${label} 메모`} onChange={(event) => update(row.id, { inspection_notes: event.target.value })} placeholder="비우면 공통 메모" /></label>
          </div>
        </details>;
        return <div key={row.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          {phase === 'options' ? <>
            <input aria-label={`옵션 ${index + 1} 이름`} className={`${input} flex-1`} value={row.option} onChange={(event) => update(row.id, { option: event.target.value })} placeholder="예: 1회" />
            <input type="number" min="1" max="100" aria-label={`옵션 ${index + 1} 수량`} className={`${input} !w-20`} value={row.quantity} onChange={(event) => update(row.id, { quantity: event.target.value })} />
            <button type="button" aria-label={`${label} 삭제`} className="shrink-0 px-1 text-sm text-rose-700" onClick={() => onChange(rows.filter((entry) => entry.id !== row.id))}>삭제</button>
          </> : <>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{label} · {row.quantity}권</p><p className="mt-1 text-xs text-slate-500">{bookConditionLabel[resolved.condition_grade]}{phase === 'review' ? ` · 필기 ${resolved.writing_percentage}% · ${resolved.has_damage ? '손상 있음' : '손상 없음'}` : ''}</p></div>
            {phase === 'price' ? <input type="number" min="1" aria-label={`${label} 개별 판매가`} className={`${input} !w-32`} value={row.price} placeholder={item.price ? `공통 ${item.price}원` : '공통 가격 미입력'} onChange={(event) => update(row.id, { price: event.target.value })} /> : <span className="shrink-0 text-sm font-bold">{formatCurrency(Number(resolved.price))} / 권</span>}
          </>}
        </div>;
      })}
    </div>
    {phase === 'options' ? <button type="button" onClick={() => add([newIntakeVariant()])} className={`${button} w-full`}>+ 옵션 직접 추가</button> : null}
  </div>;
}
