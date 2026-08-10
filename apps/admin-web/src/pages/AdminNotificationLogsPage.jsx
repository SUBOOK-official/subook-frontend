import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

import { resendNotificationFromLog } from "../lib/adminNotification";
import { InlineLoading } from "../components/Loading";

// 알림톡/SMS 발송 로그 뷰어 (감사 P1)
// 솔라피 실발송이 라이브인데 notification_logs를 볼 화면이 없어
// "알림 못 받았다" CS를 근거 없이 처리하던 구멍을 메운다.
// 접근: notification_logs_admin_all RLS로 직접 조회 (template_variables까지
// 필요해서 list_admin_notification_logs RPC 대신 테이블 직접 — 재발송에 사용).

const PAGE_SIZE = 50;

const TYPE_LABELS = {
  pickup_accepted: "수거접수",
  arrived: "입고 완료",
  inspection_done: "검수 완료",
  sold: "판매 완료",
  settlement_done: "정산 완료",
  order_confirmed: "주문 확인",
  shipping_started: "배송 시작",
  delivery_done: "배송 완료",
};

const STATUS_META = {
  sent: { label: "발송됨", chip: "bg-emerald-100 text-emerald-800" },
  failed: { label: "실패", chip: "bg-rose-100 text-rose-700" },
  fallback_sms: { label: "SMS 대체", chip: "bg-amber-100 text-amber-800" },
  pending: { label: "대기", chip: "bg-slate-100 text-slate-600" },
};

const STATUS_FILTERS = [
  { value: "", label: "전체" },
  { value: "failed", label: "실패" },
  { value: "fallback_sms", label: "SMS 대체" },
  { value: "sent", label: "발송됨" },
  { value: "pending", label: "대기" },
];

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AdminNotificationLogsPage() {
  // AdminShell의 '알림 발송 실패' 칩이 실패 필터를 걸어 진입 (?status=failed)
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [resendTarget, setResendTarget] = useState(null);
  const [isResending, setIsResending] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const requestIdRef = useRef(0);

  // 발송 본문은 여러 줄이라 truncate로는 CS 확인이 안 됨 — 행 단위로 전체 내용 토글.
  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    let query = supabase
      .from("notification_logs")
      .select(
        "id,recipient_user_id,recipient_phone,recipient_name,notification_type,ref_type,ref_id,template_code,template_variables,message_body,status,vendor_message_id,error_message,sent_at,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (typeFilter) {
      query = query.eq("notification_type", typeFilter);
    }
    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }
    if (toDate) {
      const exclusiveEnd = new Date(`${toDate}T00:00:00`);
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
      query = query.lt("created_at", exclusiveEnd.toISOString());
    }

    const { data, count, error } = await query;

    if (requestId !== requestIdRef.current) return;
    setIsLoading(false);

    if (error) {
      showToast(error.message || "알림 로그를 불러오지 못했습니다.", "error");
      setRows([]);
      setTotalCount(0);
      return;
    }

    setRows(Array.isArray(data) ? data : []);
    setTotalCount(count ?? 0);
  }, [currentPage, statusFilter, typeFilter, fromDate, toDate, showToast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleResendConfirmed = async () => {
    if (!resendTarget) return;
    setIsResending(true);
    const result = await resendNotificationFromLog(resendTarget);
    setIsResending(false);
    setResendTarget(null);

    if (result?.success === false) {
      showToast(result?.error || "재발송에 실패했습니다.", "error");
      return;
    }

    showToast("재발송을 요청했습니다. 새 발송 건이 로그에 추가됩니다.", "success");
    await loadLogs();
  };

  const failedCount = rows.filter((row) => row.status === "failed").length;

  return (
    <AdminShell
      activeModule="notification-logs"
      description="알림톡/SMS 발송 이력 — '알림 못 받았다' 문의를 근거로 처리하고 실패 건을 재발송합니다"
      summaryCards={[]}
      title="알림 발송 로그"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">Supabase 환경 변수가 설정되지 않아 로그를 불러올 수 없습니다.</p>
      ) : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="label">상태</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {STATUS_FILTERS.map((option) => (
                <button
                  aria-pressed={statusFilter === option.value}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === option.value
                      ? "bg-slate-950 text-white"
                      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                  key={option.value || "all"}
                  onClick={() => {
                    setCurrentPage(1);
                    setStatusFilter(option.value);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">유형</span>
            <select
              className="input-base !mt-1 !block !w-44 !py-2 text-sm"
              onChange={(event) => {
                setCurrentPage(1);
                setTypeFilter(event.target.value);
              }}
              value={typeFilter}
            >
              <option value="">전체</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">시작일</span>
            <input
              className="input-base !mt-1 !py-2 text-sm"
              onChange={(event) => {
                setCurrentPage(1);
                setFromDate(event.target.value);
              }}
              type="date"
              value={fromDate}
            />
          </label>
          <label className="block">
            <span className="label">종료일</span>
            <input
              className="input-base !mt-1 !py-2 text-sm"
              onChange={(event) => {
                setCurrentPage(1);
                setToDate(event.target.value);
              }}
              type="date"
              value={toDate}
            />
          </label>
          <button
            className="btn-secondary !w-auto !px-4 !py-2.5 text-sm"
            disabled={isLoading}
            onClick={() => void loadLogs()}
            type="button"
          >
            새로고침
          </button>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          총 {totalCount.toLocaleString("ko-KR")}건
          {failedCount > 0 ? (
            <span className="ml-2 font-bold text-rose-600">이 페이지 실패 {failedCount}건</span>
          ) : null}
        </p>
      </section>

      <section className="card p-0">
        {isLoading ? (
          <p className="py-10 text-center text-sm font-semibold text-slate-400"><InlineLoading /></p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-slate-400">
            조건에 맞는 발송 이력이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">시각</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">유형</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">수신자</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">내용</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const statusMeta = STATUS_META[row.status] ?? {
                    label: row.status,
                    chip: "bg-slate-100 text-slate-600",
                  };
                  const isFailed = row.status === "failed";
                  const isExpanded = expandedIds.has(row.id);
                  return (
                    <tr className={isFailed ? "bg-rose-50/60" : "hover:bg-slate-50"} key={row.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        {TYPE_LABELS[row.notification_type] ?? row.notification_type}
                        {row.ref_id ? (
                          <span className="ml-1 text-xs font-medium text-slate-400">
                            #{row.ref_id}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {row.recipient_name || "-"}
                        <span className="ml-1 font-mono text-xs text-slate-400">
                          {row.recipient_phone}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${statusMeta.chip}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-4 py-3 text-xs text-slate-600">
                        <p
                          className={isExpanded ? "whitespace-pre-line break-words" : "truncate"}
                          title={isExpanded ? undefined : row.message_body}
                        >
                          {row.message_body}
                        </p>
                        {isFailed && row.error_message ? (
                          <p
                            className={`mt-0.5 font-semibold text-rose-600 ${
                              isExpanded ? "whitespace-pre-line break-words" : "truncate"
                            }`}
                            title={isExpanded ? undefined : row.error_message}
                          >
                            {row.error_message}
                          </p>
                        ) : null}
                        <button
                          aria-expanded={isExpanded}
                          className="mt-1 text-[11px] font-bold text-slate-400 underline underline-offset-2 hover:text-slate-700"
                          onClick={() => toggleExpanded(row.id)}
                          type="button"
                        >
                          {isExpanded ? "접기" : "전체 보기"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          className="btn-secondary !inline-flex !w-auto !px-3 !py-1.5 text-xs"
                          disabled={isResending}
                          onClick={() => setResendTarget(row)}
                          type="button"
                        >
                          재발송
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
        />
      </section>

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-bold shadow-lg ${
            toast.tone === "error" ? "bg-rose-600 text-white" : "bg-slate-950 text-white"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      ) : null}

      <DestructiveConfirmModal
        busy={isResending}
        cancelLabel="취소"
        confirmLabel="재발송"
        description={
          resendTarget
            ? `${TYPE_LABELS[resendTarget.notification_type] ?? resendTarget.notification_type} 알림을 ` +
              `${resendTarget.recipient_phone}로 다시 발송합니다.\n\n` +
              "・실제 알림톡/SMS가 즉시 발송됩니다.\n" +
              "・저장된 당시 내용(변수) 그대로 재발송되니 최신 상태와 다를 수 있으면 발송하지 마세요."
            : ""
        }
        onCancel={() => (isResending ? null : setResendTarget(null))}
        onConfirm={handleResendConfirmed}
        open={Boolean(resendTarget)}
        title="알림 재발송 — 실발송 확인"
      />
    </AdminShell>
  );
}

export default AdminNotificationLogsPage;
