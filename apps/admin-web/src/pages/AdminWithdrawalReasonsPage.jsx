import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import {
  WITHDRAWAL_REASON_CATEGORIES,
  getWithdrawalReasonLabel,
} from "@shared-domain/withdrawalReasons";

// 통계 화면은 최근 데이터가 중요 — 최신순으로 최대 1,000건만 집계 대상으로 가져온다.
// (탈퇴 빈도상 충분히 큰 상한. 초과 시 화면 하단에 기준을 명시한다.)
const FETCH_LIMIT = 1000;

const PERIOD_OPTIONS = [
  { key: "30", label: "최근 30일", days: 30 },
  { key: "90", label: "최근 90일", days: 90 },
  { key: "all", label: "전체", days: null },
];

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AdminWithdrawalReasonsPage() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [periodKey, setPeriodKey] = useState("all");

  const loadRows = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage("Supabase 환경 변수가 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    // RLS: 운영자만 select 가능 (member_withdrawal_reasons 정책)
    const { data, error } = await supabase
      .from("member_withdrawal_reasons")
      .select("id, reason_category, reason_label, reason_detail, created_at")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) {
      setErrorMessage(error.message || "탈퇴 사유를 불러오지 못했습니다.");
    } else {
      setRows(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const period = PERIOD_OPTIONS.find((option) => option.key === periodKey);
    if (!period?.days) {
      return rows;
    }
    const cutoff = Date.now() - period.days * 24 * 60 * 60 * 1000;
    return rows.filter((row) => new Date(row.created_at).getTime() >= cutoff);
  }, [rows, periodKey]);

  const categoryStats = useMemo(() => {
    const counts = new Map();
    filteredRows.forEach((row) => {
      const key = row.reason_category || "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    // 정식 선택지 8종은 0건이어도 순서대로 노출하고, 목록에 없는 키(과거 선택지 등)는 뒤에 붙인다.
    const knownKeys = new Set(WITHDRAWAL_REASON_CATEGORIES.map((option) => option.value));
    const knownStats = WITHDRAWAL_REASON_CATEGORIES.map((option) => ({
      key: option.value,
      label: option.label,
      count: counts.get(option.value) ?? 0,
    }));
    const unknownStats = [...counts.entries()]
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, count]) => ({
        key,
        // 저장 당시 문구 스냅샷이 있으면 그걸 보여준다 (선택지 개편 후에도 해석 가능)
        label: filteredRows.find((row) => row.reason_category === key)?.reason_label ?? key,
        count,
      }));

    const merged = [...knownStats, ...unknownStats].sort((a, b) => b.count - a.count);
    const total = filteredRows.length;
    const maxCount = merged.reduce((acc, stat) => Math.max(acc, stat.count), 0);
    return { items: merged, total, maxCount };
  }, [filteredRows]);

  const topCategory = categoryStats.items.find((stat) => stat.count > 0) ?? null;
  const detailRows = filteredRows.filter((row) => row.reason_detail);

  return (
    <AdminShell
      activeModule="withdrawal-reasons"
      description="회원탈퇴 설문 응답 통계 — 개인정보 파기 후에도 익명으로 보관되는 서비스 개선 데이터입니다"
      title="탈퇴 사유"
    >
      {errorMessage ? (
        <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-4 py-3">
          {errorMessage}
        </p>
      ) : null}

      {/* 기간 필터 */}
      <div className="mb-4 flex items-center gap-2">
        {PERIOD_OPTIONS.map((option) => (
          <button
            className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${
              periodKey === option.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
            key={option.key}
            onClick={() => setPeriodKey(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-sm font-semibold text-slate-500">
          불러오는 중...
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-slate-600">아직 수집된 탈퇴 사유가 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            회원이 탈퇴 설문에 응답하면 여기에 통계가 쌓입니다. (2026-07-13부터 수집)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">기간 내 응답</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{categoryStats.total}건</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">누적 전체</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{rows.length}건</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">최다 사유</p>
              <p className="mt-1 text-sm font-bold text-slate-800 leading-snug">
                {topCategory ? topCategory.label : "-"}
              </p>
            </div>
          </div>

          {/* 사유 분포 */}
          <div className="card p-5">
            <h3 className="text-sm font-black text-slate-950 mb-3">사유 분포</h3>
            {categoryStats.total === 0 ? (
              <p className="text-sm text-slate-500">선택한 기간에 응답이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.items.map((stat) => {
                  const percent =
                    categoryStats.total > 0
                      ? Math.round((stat.count / categoryStats.total) * 100)
                      : 0;
                  const barWidth =
                    categoryStats.maxCount > 0 ? (stat.count / categoryStats.maxCount) * 100 : 0;
                  return (
                    <div key={stat.key}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className={stat.count > 0 ? "text-slate-800" : "text-slate-400"}>
                          {stat.label}
                        </span>
                        <span className="shrink-0 font-bold text-slate-700">
                          {stat.count}건
                          <span className="ml-1 text-xs font-semibold text-slate-400">
                            {percent}%
                          </span>
                        </span>
                      </div>
                      <div aria-hidden="true" className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 직접 입력(상세) 목록 */}
          <div className="card p-5">
            <h3 className="text-sm font-black text-slate-950 mb-3">
              직접 입력 내용 <span className="text-slate-400 font-semibold">({detailRows.length}건)</span>
            </h3>
            {detailRows.length === 0 ? (
              <p className="text-sm text-slate-500">선택한 기간에 직접 입력한 내용이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {detailRows.map((row) => (
                  <div className="rounded-lg bg-slate-50 px-3 py-2" key={row.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-500">
                        {row.reason_label ?? getWithdrawalReasonLabel(row.reason_category) ?? row.reason_category}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{formatDateTime(row.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{row.reason_detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rows.length >= FETCH_LIMIT ? (
            <p className="text-xs text-slate-400">
              최근 {FETCH_LIMIT.toLocaleString()}건 기준 통계입니다. 전체 데이터는 Supabase에서 확인할 수 있습니다.
            </p>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}

export default AdminWithdrawalReasonsPage;
