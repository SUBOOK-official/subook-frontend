import { BOOK_TYPE_OPTIONS } from "@shared-domain/bookTypes";
import { getBookTypeDecision } from "../lib/registerBookType";

export default function RegisterBookTypeField({ row, hint, onChange, onRetry }) {
  const decision = getBookTypeDecision(row, hint);
  const change = (field, value) => onChange(row.uid, field, value);
  return (
    <div className={`mt-3 rounded-lg border p-3 ${decision.valid ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`book-type-${row.uid}`} className="text-xs font-bold text-slate-700">교재 유형</label>
        <select id={`book-type-${row.uid}`} value={decision.value} onChange={(e) => change("bookType", e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">유형 선택</option>
          {BOOK_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <span className="text-xs text-slate-600">
          {decision.pending ? "유형 확인 중…" : decision.valid ? (decision.manual ? "직접 확인 완료" : "자동 제안") : "직접 확인 필요"}
        </span>
        {decision.suggested && row.bookType && row.bookType !== decision.suggested ? (
          <button type="button" onClick={() => change("bookType", "")} className="text-xs underline">제안한 {decision.suggested} 사용</button>
        ) : null}
      </div>
      {!decision.pending ? <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {decision.error ? "유형 제안을 불러오지 못했습니다. 다시 조회하거나 표지·목차를 확인해 직접 선택해 주세요." : decision.data?.reason}
        {decision.data?.source_url ? <a href={decision.data.source_url} target="_blank" rel="noreferrer" className="ml-2 underline">공식 설명</a> : null}
        {decision.error ? <button type="button" onClick={onRetry} className="ml-2 underline">다시 조회</button> : null}
      </p> : null}
      {!decision.pending && decision.manual ? (
        <div className="mt-2 space-y-2">
          <input aria-label="유형 확인 근거" value={row.bookTypeReviewNote || ""} maxLength={500}
            onChange={(e) => change("bookTypeReviewNote", e.target.value)}
            placeholder="확인 근거 (예: 목차가 평가원 기출 문항으로 구성됨)"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs" />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={decision.confirmed} onChange={(e) => change("bookTypeConfirmed", e.target.checked)}
              disabled={!decision.value || decision.note.length < 4} />
            해당 판본의 공식 설명 또는 표지·목차를 확인했습니다
          </label>
        </div>
      ) : null}
    </div>
  );
}
