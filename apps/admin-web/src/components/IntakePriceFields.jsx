import { formatCurrency } from '@shared-domain/format';
import { intakeDiscountError } from '../lib/intakePricing';

const input = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm';
export default function IntakePriceFields({ item, onChange, batch = false }) {
  const type = item.discount_type || 'none';
  const error = intakeDiscountError(item);
  const priceLabel = batch ? '공통 판매가 (권당, 원)' : '판매가 (원)';
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2" aria-label="가격 입력 방식">{[['none', '판매가 직접 입력'], ['amount', '정액 할인 (원)'], ['rate', '정률 할인 (%)']].map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} onClick={() => onChange({ discount_type: value, discount_value: '' })} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${type === value ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-300'}`}>{label}</button>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">정가 (원, 확인되는 경우만)<input type="number" min="1" aria-label="정가 (원, 확인되는 경우만)" className={input} value={item.original_price ?? ''} onChange={(event) => onChange({ original_price: event.target.value })} placeholder="정가 미상·비매품은 비워두세요" /></label>
      {type === 'none' ? <label className="text-sm font-semibold">{priceLabel}<input type="number" min="1" aria-label={priceLabel} className={`${input} font-bold`} value={item.price ?? ''} onChange={(event) => onChange({ price: event.target.value })} placeholder="판매 기록 비교 또는 직접 입력" /></label>
        : <label className="text-sm font-semibold">{type === 'rate' ? '할인율 (%)' : '할인 금액 (원)'}<input type="number" min="0" max={type === 'rate' ? '99' : undefined} step="1" aria-label={type === 'rate' ? '할인율 (%)' : '할인 금액 (원)'} className={input} value={item.discount_value ?? ''} onChange={(event) => onChange({ discount_value: event.target.value })} placeholder={type === 'rate' ? '예: 40' : '예: 5000'} /></label>}
    </div>
    {type !== 'none' ? <div className="rounded-lg bg-blue-50 p-3"><p className="text-sm">{batch ? '공통 할인 후 판매가 (권당)' : '할인 후 판매가'} <output aria-label="할인 후 판매가" className="ml-2 text-lg font-bold text-blue-700">{error ? '—' : formatCurrency(Number(item.price))}</output></p>{error ? <p role="status" className="mt-1 text-xs text-amber-800">{error}</p> : <p className="mt-1 text-xs text-slate-500">원 단위 반올림 · 개별 판매가를 입력한 옵션은 유지됩니다.</p>}</div> : null}
  </div>;
}
