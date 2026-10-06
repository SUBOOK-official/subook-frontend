import { InlineLoading } from "./Loading";

export default function AdminQueryState({ loading, error, empty, onRetry, children }) {
  if (loading) return <div className="card py-12 text-center text-sm text-slate-500" role="status"><InlineLoading /></div>;
  if (error) return <div role="alert" className="notice-error">{error} <button type="button" onClick={onRetry} className="ml-3 font-semibold underline">다시 조회</button></div>;
  if (empty) return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">조건에 맞는 항목이 없습니다.</div>;
  return children;
}
