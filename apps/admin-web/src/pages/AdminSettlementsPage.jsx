import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { notifySettlementDone } from "../lib/adminNotification";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

const PAGE_SIZE = 200;

const STATUS_OPTIONS = [
  { value: "pending", label: "정산 대기" },
  { value: "approved", label: "승인 완료" },
  { value: "completed", label: "정산 완료" },
];

const STATUS_FILTERS = [{ value: "all", label: "전체" }, ...STATUS_OPTIONS];

const STATUS_BADGE_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
};

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function normalizeSettlementResponse(data) {
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary ?? {},
    totalCount: Number(data?.total_count ?? 0),
  };
}

function formatFeePercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 1)}%`;
}

function maskAccountNumber(accountNumber, accountLast4) {
  const digits = String(accountNumber ?? "").replace(/[^0-9]/g, "");
  const last4 = accountLast4 || digits.slice(-4);

  if (!last4) {
    return "계좌 미등록";
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${last4}`;
}

function buildExportRows(rows) {
  return rows.map((row) => ({
    상태: getStatusLabel(row.status),
    예정일: row.scheduled_date ?? "",
    완료일: row.completed_at ?? "",
    판매자: row.seller_name ?? "",
    연락처: row.seller_phone ?? "",
    주문번호: row.order_number ?? "",
    교재명: row.book_title ?? "",
    옵션: row.book_option ?? "",
    판매가: row.sale_amount ?? 0,
    수수료율: formatFeePercent(row.fee_percent),
    수수료: row.fee_amount ?? 0,
    정산금액: row.net_amount ?? 0,
    은행: row.bank_name ?? "",
    계좌번호: row.account_number ?? "",
    예금주: row.account_holder ?? "",
  }));
}

function AdminSettlementsPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [toast, setToast] = useState(null);
  const requestIdRef = useRef(0);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );

  const selectedPendingIds = useMemo(
    () => selectedRows.filter((row) => row.status === "pending").map((row) => row.id),
    [selectedRows],
  );

  const selectedApprovedIds = useMemo(
    () => selectedRows.filter((row) => row.status === "approved").map((row) => row.id),
    [selectedRows],
  );

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  const summaryCards = [
    {
      label: "정산 대기",
      value: `${summary.pending_count ?? 0}건`,
      hint: formatCurrency(summary.pending_amount ?? 0),
    },
    {
      label: "승인 완료",
      value: `${summary.approved_count ?? 0}건`,
      hint: formatCurrency(summary.approved_amount ?? 0),
    },
    {
      label: "정산 완료",
      value: `${summary.completed_count ?? 0}건`,
      hint: formatCurrency(summary.completed_amount ?? 0),
    },
    {
      label: "오늘 승인 필요",
      value: `${summary.due_pending_count ?? 0}건`,
      hint: formatCurrency(summary.due_pending_amount ?? 0),
    },
  ];

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadSettlements = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setSummary({});
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = {
      p_limit: PAGE_SIZE,
      p_offset: 0,
    };

    if (statusFilter !== "all") {
      params.p_statuses = [statusFilter];
    }
    if (search.trim()) {
      params.p_search = search.trim();
    }
    if (fromDate) {
      params.p_from_date = fromDate;
    }
    if (toDate) {
      params.p_to_date = toDate;
    }

    const { data, error } = await supabase.rpc("list_admin_settlements", params);

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (error) {
      showToast(error.message || "정산 목록을 불러오지 못했습니다.", "error");
      setRows([]);
      setSummary({});
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const normalizedData = normalizeSettlementResponse(data);
    setRows(normalizedData.rows);
    setSummary(normalizedData.summary);
    setTotalCount(normalizedData.totalCount);
    setSelectedIds((currentIds) =>
      currentIds.filter((id) => normalizedData.rows.some((row) => row.id === id)),
    );
    setIsLoading(false);
  }, [fromDate, search, showToast, statusFilter, toDate]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSettlements();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [loadSettlements]);

  const toggleRowSelection = (id) => {
    setSelectedIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  };

  const toggleVisibleSelection = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(rows.map((row) => row.id));
  };

  const approveSettlements = async (ids) => {
    if (!ids.length || !supabase) {
      return;
    }

    setBusyAction("approve");
    const { data, error } = await supabase.rpc("admin_approve_settlements", {
      p_settlement_ids: ids,
    });
    setBusyAction("");

    if (error) {
      showToast(error.message || "정산 승인에 실패했습니다.", "error");
      return;
    }

    showToast(`${data?.updated_count ?? 0}건을 승인했습니다.`, "success");
    await loadSettlements();
  };

  const completeSettlements = async (ids) => {
    if (!ids.length || !supabase) {
      return;
    }

    setBusyAction("complete");
    const { data, error } = await supabase.rpc("admin_complete_settlements", {
      p_settlement_ids: ids,
    });

    if (error) {
      setBusyAction("");
      showToast(error.message || "정산 완료 처리에 실패했습니다.", "error");
      return;
    }

    const completedRows = Array.isArray(data?.settlements) ? data.settlements : [];
    await Promise.allSettled(
      completedRows
        .filter((row) => row.seller_phone)
        .map((row) =>
          notifySettlementDone({
            sellerPhone: row.seller_phone,
            sellerName: row.seller_name,
            sellerUserId: row.seller_user_id,
            amount: row.net_amount,
            bankName: row.bank_name || "계좌",
            accountLast4: row.account_last4,
            settlementId: row.id,
          }),
        ),
    );

    setBusyAction("");

    const skippedMessage =
      Number(data?.skipped_missing_account_count ?? 0) > 0
        ? ` 계좌 정보가 없는 ${data.skipped_missing_account_count}건은 제외했습니다.`
        : "";
    showToast(`${data?.updated_count ?? 0}건을 정산 완료 처리했습니다.${skippedMessage}`, "success");
    await loadSettlements();
  };

  const exportCurrentRows = async () => {
    if (!rows.length) {
      showToast("내보낼 정산 데이터가 없습니다.", "error");
      return;
    }

    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(buildExportRows(rows));

    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 22 },
      { wch: 12 },
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, "settlements");
    xlsx.writeFile(workbook, `subook-settlements-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AdminShell
      activeModule="settlements"
      actions={
        <button
          className="btn-secondary !w-auto !px-3 !py-2 text-xs"
          onClick={exportCurrentRows}
          type="button"
        >
          XLSX 내보내기
        </button>
      }
      description="구매확정 후 자동 생성된 정산 예정건을 승인하고 지급 완료까지 처리합니다."
      summaryCards={summaryCards}
      title="정산 관리"
    >
      <section className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                statusFilter === option.value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
              key={option.value}
              onClick={() => {
                setStatusFilter(option.value);
                setSelectedIds([]);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <input
            className="input-base !w-auto min-w-[220px] flex-1"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="판매자, 주문번호, 교재명 검색"
            type="search"
            value={search}
          />
          <input
            className="input-base !w-auto"
            onChange={(event) => setFromDate(event.target.value)}
            type="date"
            value={fromDate}
          />
          <span className="pb-3 text-sm font-semibold text-slate-400">~</span>
          <input
            className="input-base !w-auto"
            onChange={(event) => setToDate(event.target.value)}
            type="date"
            value={toDate}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-500">
            총 {totalCount}건 중 {rows.length}건 표시 · 선택 {selectedIds.length}건
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary !w-auto !px-4 !py-2 text-sm"
              disabled={!selectedPendingIds.length || busyAction !== ""}
              onClick={() => approveSettlements(selectedPendingIds)}
              type="button"
            >
              {busyAction === "approve" ? "승인 중..." : `선택 승인 (${selectedPendingIds.length})`}
            </button>
            <button
              className="btn-primary !w-auto !px-4 !py-2 text-sm"
              disabled={!selectedApprovedIds.length || busyAction !== ""}
              onClick={() => completeSettlements(selectedApprovedIds)}
              type="button"
            >
              {busyAction === "complete" ? "처리 중..." : `선택 정산 완료 (${selectedApprovedIds.length})`}
            </button>
          </div>
        </div>
      </section>

      <section className="card p-0">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-400">정산 목록을 불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-400">정산 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">
                    <input
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                      type="checkbox"
                    />
                  </th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">판매자</th>
                  <th className="px-4 py-3">주문/교재</th>
                  <th className="px-4 py-3 text-right">판매가</th>
                  <th className="px-4 py-3 text-right">수수료</th>
                  <th className="px-4 py-3 text-right">정산금액</th>
                  <th className="px-4 py-3">예정일</th>
                  <th className="px-4 py-3">계좌</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-50 align-top hover:bg-slate-50" key={row.id}>
                    <td className="px-4 py-3">
                      <input
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${STATUS_BADGE_STYLE[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {getStatusLabel(row.status)}
                      </span>
                      {row.status === "completed" && row.completed_at ? (
                        <p className="mt-1 text-xs text-slate-400">{formatDate(row.completed_at)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-400">{row.seller_phone || row.seller_email || "연락처 없음"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-slate-500">{row.order_number}</p>
                      <p className="mt-1 max-w-[280px] font-semibold text-slate-900">
                        {row.book_title}
                        {row.book_option ? <span className="text-slate-400"> · {row.book_option}</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Book #{row.book_id}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(row.sale_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{formatCurrency(row.fee_amount)}</p>
                      <p className="text-xs text-slate-400">{formatFeePercent(row.fee_percent)}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-base font-black text-slate-950">
                      {formatCurrency(row.net_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-600">
                      {formatDate(row.scheduled_date)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{row.bank_name || "계좌 미등록"}</p>
                      <p className="mt-1 font-mono text-xs text-slate-400">
                        {maskAccountNumber(row.account_number, row.account_last4)}
                      </p>
                      {row.account_holder ? (
                        <p className="mt-1 text-xs text-slate-400">{row.account_holder}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "pending" ? (
                        <button
                          className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                          disabled={busyAction !== ""}
                          onClick={() => approveSettlements([row.id])}
                          type="button"
                        >
                          승인
                        </button>
                      ) : null}
                      {row.status === "approved" ? (
                        <button
                          className="btn-primary !w-auto !px-3 !py-1.5 text-xs"
                          disabled={busyAction !== ""}
                          onClick={() => completeSettlements([row.id])}
                          type="button"
                        >
                          완료
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </AdminShell>
  );
}

export default AdminSettlementsPage;
