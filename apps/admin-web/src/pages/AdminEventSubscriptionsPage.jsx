import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import { useAdminListState } from "../lib/useAdminListState";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { InlineLoading } from "../components/Loading";

// 이벤트 출시 알림 신청 현황 (전일학원 콜라보)
// event_subscriptions를 어드민 SELECT 정책(event_subscriptions_admin_read)으로 직접 조회.
// 발송 방식은 미정이라 발송 상태 UI는 두지 않는다 — 명단 확인·CSV 추출이 목적.


const PAGE_SIZE = 50;
// 이벤트 단위 명단이라 전량 로드 (초과 시 하단에 잘림 안내 — 조용한 상한 금지)
const LOAD_LIMIT = 2000;

function formatPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value ?? "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// KST 일자 키 (추이 집계용)
function toKstDateKey(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function AdminEventSubscriptionsPage() {
  const [rows, setRows] = useState([]);
  const requestSequence = useRef(0);
  const [totalCount, setTotalCount] = useState(0);
  const [list, updateList] = useAdminListState({ event: "jeonil-2026-09", page: 1 });
  const [events, setEvents] = useState([]);
  const currentPage = list.page;
  const setCurrentPage = (page) => updateList({ page });
  useEffect(() => { let active = true; supabase?.rpc("admin_subscription_events").then(({ data, error }) => { if (!active) return; if (error) setErrorMessage(error.message); else setEvents(data || []); }); return () => { active = false; }; }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadSubscriptions = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    setRows([]);
    setTotalCount(0);

    const { data, count, error } = await supabase
      .from("event_subscriptions")
      .select("id,phone,user_id,created_at", { count: "exact" })
      .eq("event_key", list.event)
      .order("created_at", { ascending: false })
      .range(0, LOAD_LIMIT - 1);

    if (sequence !== requestSequence.current) return;
    setIsLoading(false);
    if (error) {
      setErrorMessage(error.message || "신청 명단을 불러오지 못했습니다.");
      setRows([]);
      setTotalCount(0);
      return;
    }
    setRows(Array.isArray(data) ? data : []);
    setTotalCount(count ?? 0);
  }, [list.event]);

  useEffect(() => {
    void loadSubscriptions();
    return () => { requestSequence.current += 1; };
  }, [loadSubscriptions]);

  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
  );

  const summary = useMemo(() => {
    const todayKey = toKstDateKey(new Date().toISOString());
    return {
      total: totalCount,
      today: rows.filter((row) => toKstDateKey(row.created_at) === todayKey).length,
      members: rows.filter((row) => row.user_id).length,
    };
  }, [rows, totalCount]);

  // 일자별 추이 (KST, 최근 날짜가 아래)
  const dailyTrend = useMemo(() => {
    const byDate = new Map();
    rows.forEach((row) => {
      const key = toKstDateKey(row.created_at);
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    });
    const entries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    const max = entries.reduce((acc, [, value]) => Math.max(acc, value), 0);
    return { entries, max };
  }, [rows]);

  const handleCsvDownload = () => {
    const header = "전화번호,신청시각(KST),회원여부";
    const lines = rows.map((row) => {
      const at = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(row.created_at));
      return [formatPhone(row.phone), at, row.user_id ? "회원" : "비회원"].join(",");
    });
    // BOM — 엑셀 한글 인코딩
    const blob = new Blob([`\uFEFF${header}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${list.event}_알림신청_${toKstDateKey(new Date().toISOString())}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell
      activeModule="event-subscriptions"
      description="행사별 신청 명단과 신청 추이를 확인하고 CSV로 추출합니다"
      summaryCards={[]}
      title="이벤트 알림 신청"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">Supabase 환경 변수가 설정되지 않아 명단을 불러올 수 없습니다.</p>
      ) : null}
      {errorMessage ? <p className="notice-error">{errorMessage}</p> : null}

      <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1"><span className="label">행사</span><select className="input-base" value={list.event} onChange={(e) => updateList({ event: e.target.value })}>{[...new Set([list.event, ...events.map((e) => e.event_key)])].map((key) => <option key={key} value={key}>{key}{events.find((e) => e.event_key === key) ? ` · ${events.find((e) => e.event_key === key).total_count}명` : ""}</option>)}</select></label><button className="btn-secondary !w-auto" onClick={loadSubscriptions} disabled={isLoading}>새로고침</button></div>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "총 신청", value: summary.total },
          { label: "오늘 신청 (조회한 명단)", value: summary.today },
          { label: "회원 신청 (조회한 명단)", value: summary.members },
        ].map((card) => (
          <div className="card" key={card.label}>
            <p className="text-xs font-semibold text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{isLoading ? "—" : `${card.value.toLocaleString()}명`}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-slate-900">일자별 신청 추이</h2>
        {dailyTrend.entries.length === 0 ? (
          <p className="text-sm text-slate-500">아직 신청이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {dailyTrend.entries.map(([date, value]) => (
              <li className="flex items-center gap-3 text-sm" key={date}>
                <span className="w-24 shrink-0 text-slate-600">{date.slice(5)}</span>
                <div className="h-4 flex-1 rounded bg-slate-100">
                  <div
                    className="h-4 rounded bg-slate-900"
                    style={{ width: `${Math.max(4, Math.round((value / dailyTrend.max) * 100))}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-semibold text-slate-900">{value}명</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-end">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            disabled={isLoading || rows.length === 0}
            onClick={handleCsvDownload}
            type="button"
          >
            조회 명단 CSV ({rows.length}건)
          </button>
        </div>

        {isLoading ? (
          <InlineLoading label="신청 명단을 불러오는 중..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">신청 시각</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">전화번호</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">회원 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                      아직 신청이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-slate-700">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{formatPhone(row.phone)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.user_id ? "회원" : "비회원"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalCount > rows.length ? (
          <p className="text-xs text-slate-500">
            전체 {totalCount.toLocaleString()}건 중 최근 {rows.length.toLocaleString()}건을 표시하며 CSV도 이 범위만 포함합니다.
          </p>
        ) : null}

        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
          totalCount={rows.length}
        />
      </section>
    </AdminShell>
  );
}

export default AdminEventSubscriptionsPage;
