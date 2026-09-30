import { useEffect, useRef, useState } from "react";
import { metaAdsRequest } from "@shared-supabase/adminMetaAdsClient";
import {
  metaKinds,
  metaActionLabels,
  metaFieldLabels,
  reviewValue,
} from "@shared-domain/metaAds";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";

export default function MetaMutationReview({ plans, onClose, onComplete }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [ack, setAck] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    dialogRef.current?.querySelector("button")?.focus();
  }, []);
  useEffect(() => {
    if (!busy && results.length)
      dialogRef.current?.querySelector("button")?.focus();
  }, [busy, results.length]);
  useBodyScrollLock(true);
  const execute = async () => {
    if (busy || results.length || !ack) return;
    setBusy(true);
    const next = [];
    for (const plan of plans) {
      try {
        const data = await metaAdsRequest(
          {},
          { action: "execute", id: plan.id, confirmed: true },
        );
        next.push({ id: plan.id, name: plan.review.name, ok: true, data });
      } catch (error) {
        next.push({
          id: plan.id,
          name: plan.review.name,
          ok: false,
          message: error.message,
        });
      }
      setResults([...next]);
      if (!next.at(-1).ok) break;
    }
    setBusy(false);
    onComplete(next);
  };
  const spend = plans.some(
    (plan) => plan.review.startsSpend || plan.review.changesLive,
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3"
      role="presentation"
    >
      <section
        ref={dialogRef}
        aria-modal="true"
        role="dialog"
        aria-labelledby="meta-review-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="meta-review-title" className="text-lg font-bold">
            Meta에 반영할 내용 확인
          </h2>
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={onClose}
            disabled={busy}
          >
            닫기
          </button>
        </div>
        <p className="my-3 text-sm text-slate-600">
          {spend
            ? "게재를 켜거나 운영 중인 광고를 수정합니다. 예산·기간·대상을 확인해 주세요."
            : "아래 내용을 확인하면 Meta 계정에 반영합니다. 새 광고와 복사본은 꺼진 상태로 만들어집니다."}
        </p>
        <div className="space-y-4">
          {plans.map((plan) => (
            <article
              className="rounded-xl border border-slate-200 p-4"
              key={plan.id}
            >
              <h3 className="font-semibold">{plan.review.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {metaKinds[plan.review.kind]} ·{" "}
                {metaActionLabels[plan.review.action]}
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                {Object.entries(plan.review.after).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid gap-1 sm:grid-cols-[140px_1fr]"
                  >
                    <dt className="font-semibold text-slate-600">
                      {metaFieldLabels[key] || key}
                    </dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words">
                      {plan.review.before && key in plan.review.before && (
                        <span className="mb-1 block text-xs text-slate-500">
                          이전: {reviewValue(key, plan.review.before[key])}
                        </span>
                      )}
                      {reviewValue(key, value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
        {results.length > 0 ? (
          <div role="status" className="mt-4 space-y-2">
            {results.map((result) => (
              <p
                key={result.id}
                className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
              >
                {result.name}: {result.ok ? "반영 완료" : result.message}
              </p>
            ))}
            {!busy && results.length < plans.length && (
              <p className="text-sm text-amber-800">
                오류가 발생해 나머지 작업은 실행하지 않았습니다. 목록을
                새로고침한 뒤 확인해 주세요.
              </p>
            )}
          </div>
        ) : (
          <label className="my-4 flex gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            {spend
              ? "위 변경으로 광고가 게재되고 비용이 발생할 수 있음을 확인했습니다."
              : "위 내용을 확인했으며 Meta 계정에 반영합니다."}
          </label>
        )}
        {!results.length && (
          <button
            type="button"
            disabled={!ack || busy}
            onClick={execute}
            className="mt-3 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "반영 중…" : `${plans.length}건 반영`}
          </button>
        )}
        {busy && (
          <p role="status" className="mt-3 text-sm text-slate-500">
            결과를 확인하고 있습니다. 화면을 닫거나 같은 작업을 다시 요청하지
            마세요.
          </p>
        )}
      </section>
    </div>
  );
}
