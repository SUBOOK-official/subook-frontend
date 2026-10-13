import { useEffect, useState } from 'react';
import { reshipmentProductOptions } from '@shared-domain/orderReshipments';
import { searchOrderReshipmentProducts } from '@shared-supabase/adminOrderReshipments';

export default function ReshipmentBookPicker({ source, value, onChange, disabled, search = searchOrderReshipmentProducts }) {
  const [query, setQuery] = useState(source?.title ?? '');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (disabled) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await search(query);
        if (active) setProducts(rows);
      } catch (err) {
        if (active) { setProducts([]); setError(err.message); }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, search, retry, disabled]);

  return <div className="space-y-3">
    {!disabled && <>
      <label className="block text-xs font-semibold text-slate-700">보낼 교재 검색
        <input type="search" className="input-base mt-1 w-full font-normal" value={query}
          placeholder="교재명·강사명으로 검색" onChange={(event) => {
            setQuery(event.target.value); setProducts([]); setLoading(true); setError('');
          }} />
      </label>
      <div className="max-h-64 overflow-y-auto space-y-2" aria-live="polite" aria-busy={loading}>
        {loading && <p className="py-2 text-xs text-slate-500">교재 검색 중...</p>}
        {error && <div role="alert" className="text-xs text-red-600">{error}
          <button type="button" className="ml-2 underline" onClick={() => setRetry((current) => current + 1)}>다시 검색</button>
        </div>}
        {!loading && !error && !products.length && <p className="py-2 text-xs text-slate-500">
          {query.trim() ? '검색 결과가 없습니다. 교재명 일부로 다시 검색해 주세요.' : '다시 보낼 교재명을 입력해 주세요.'}
        </p>}
        {!loading && products.map((product) => <div key={product.id} className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-800">{product.title}</p>
          <p className="mt-1 text-xs text-slate-500">보낼 옵션을 선택해 주세요.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reshipmentProductOptions(product).map((option) => {
              const checked = value.replacementProductId === option.replacementProductId
                && value.replacementOption === option.replacementOption;
              return <button type="button" key={option.label} aria-pressed={checked}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${checked
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
                onClick={() => onChange({ title: option.title, replacementProductId: option.replacementProductId,
                  replacementOption: option.replacementOption })}>
                <span className="block font-semibold">{checked ? '✓ ' : ''}{option.label}</span>
                <span className="mt-0.5 block text-slate-500">재고 {option.stock}권</span>
              </button>;
            })}
          </div>
        </div>)}
      </div>
    </>}
    {value.title ? <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
      <p className="font-semibold">선택한 재발송 교재</p>
      <p className="mt-1 break-words">{value.title}</p>
    </div> : <p className="text-xs text-slate-500">위 목록에서 실제 보낼 교재의 옵션을 선택해 주세요.</p>}
  </div>;
}
