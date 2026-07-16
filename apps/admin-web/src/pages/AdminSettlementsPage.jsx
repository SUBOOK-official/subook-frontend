import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import NotificationResultModal from "../components/NotificationResultModal";
import StatusBadge from "@shared-domain/StatusBadge";
import { notifySettlementDone } from "../lib/adminNotification";
import { exportRowsToXlsx } from "../lib/excelFile";
import { formatCurrency, formatDate, maskEmail, maskName, maskPhone } from "@shared-domain/format";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "pending", label: "정산 대기" },
  { value: "approved", label: "승인 완료" },
  { value: "completed", label: "정산 완료" },
];

const STATUS_FILTERS = [{ value: "all", label: "전체" }, ...STATUS_OPTIONS];

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

  return `****-****-${last4}`;
}

// 목록 화면 PII 마스킹 — 전화 우선, 없으면 이메일, 둘 다 없으면 placeholder.
// (평문 계좌 다운로드는 별도 2단계 confirm+audit 경로 유지)
function maskedContact(phone, email) {
  if (phone) return maskPhone(phone);
  if (email) return maskEmail(email);
  return "연락처 없음";
}

function buildExportRows(rows, { plain = false } = {}) {
  return rows.map((row) => {
    const last4 = String(row.account_last4 ?? "").trim() || String(row.account_number ?? "").replace(/[^0-9]/g, "").slice(-4);
    const accountValue = plain
      ? row.account_number ?? ""
      : last4
        ? `****-${last4}`
        : "(계좌 미등록)";
    return {
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
      계좌번호: accountValue,
      예금주: row.account_holder ?? "",
    };
  });
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
  const [currentPage, setCurrentPage] = useState(1);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  // 평문 계좌번호 포함 여부 — 디폴트 OFF(마스킹). 운영자가 명시적으로 토글해야 풀린다.
  const [exportPlainAccount, setExportPlainAccount] = useState(false);
  const [exportPlainConfirmOpen, setExportPlainConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notificationResult, setNotificationResult] = useState(null);
  const [isRetryingNotifications, setIsRetryingNotifications] = useState(false);
  // P1: 셀러(계좌) 단위 지급 롤업 뷰 — 매월 1일 일괄 송금용
  const [viewMode, setViewMode] = useState("list"); // list | payout
  const [payoutRows, setPayoutRows] = useState([]);
  const [payoutTotals, setPayoutTotals] = useState({ groupCount: 0, grandTotal: 0 });
  const [payoutScope, setPayoutScope] = useState("approved"); // approved | with-pending
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [payoutExportConfirmOpen, setPayoutExportConfirmOpen] = useState(false);
  const [isPayoutExporting, setIsPayoutExporting] = useState(false);
  // 완료 처리 확인 모달 — 이체 참조/메모를 받아 settlements.transfer_reference에 기록
  const [completeConfirm, setCompleteConfirm] = useState(null); // { ids: number[] } | null
  // 구 사이트(식스샵)·수동 정산 요약 — 이 페이지의 settlements(회원 주문 자동 정산)와는
  // 별개 트랙이지만, "기존 정산 내역이 안 보인다"는 혼선을 막기 위해 요약+진입점을
  // 함께 노출한다. (2026-07-06 운영 피드백)
  const [manualSummary, setManualSummary] = useState(null);
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

  // 구 사이트(수동) 정산 요약 로드 — 목록은 필요 없어 p_limit 1로 summary만 받는다.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("admin_list_manual_settlements", {
        p_limit: 1,
        p_offset: 0,
      });
      if (!cancelled && !error && data?.summary) {
        setManualSummary(data.summary);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      p_offset: (currentPage - 1) * PAGE_SIZE,
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
  }, [currentPage, fromDate, search, showToast, statusFilter, toDate]);

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

  // P1: 셀러(계좌) 단위 지급 롤업 로드
  const loadPayouts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsPayoutLoading(true);
    const statuses = payoutScope === "with-pending" ? ["pending", "approved"] : ["approved"];
    const { data, error } = await supabase.rpc("admin_list_settlement_payouts", {
      p_statuses: statuses,
    });
    setIsPayoutLoading(false);

    if (error) {
      showToast(
        error.message || "지급 롤업을 불러오지 못했습니다. 최신 migration 적용 여부를 확인해 주세요.",
        "error",
      );
      setPayoutRows([]);
      setPayoutTotals({ groupCount: 0, grandTotal: 0 });
      return;
    }

    setPayoutRows(Array.isArray(data?.rows) ? data.rows : []);
    setPayoutTotals({
      groupCount: Number(data?.group_count ?? 0),
      grandTotal: Number(data?.grand_total ?? 0),
    });
  }, [payoutScope, showToast]);

  useEffect(() => {
    if (viewMode !== "payout") return;
    void loadPayouts();
  }, [viewMode, loadPayouts]);

  // 대량이체 엑셀 — 평문 계좌 포함이므로 audit 성공이 선행돼야 다운로드
  const handlePayoutExportConfirmed = async (reason) => {
    setIsPayoutExporting(true);
    try {
      const settlementIds = payoutRows
        .flatMap((row) => (Array.isArray(row.settlement_ids) ? row.settlement_ids : []))
        .map(Number)
        .filter((n) => Number.isFinite(n));

      const { data: { user } = {} } = await supabase.auth.getUser();
      const adminEmail = user?.email ?? "unknown";
      const adminTag = adminEmail.split("@")[0].replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 16) || "anon";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const fileName = `subook-payouts-${stamp}-${adminTag}-plain.xlsx`;

      const { error: auditError } = await supabase.rpc("admin_log_settlement_export", {
        p_settlement_ids: settlementIds,
        p_is_plain_text: true,
        p_file_name: fileName,
        p_client_tag: reason ? `payout reason:${reason.slice(0, 100)}` : "payout",
      });
      if (auditError) {
        showToast("audit 기록에 실패해 대량이체 엑셀 다운로드를 중단합니다.", "error");
        return;
      }

      const monthTag = new Date().toISOString().slice(0, 7);
      const exportRows = payoutRows.map((row) => ({
        은행: row.bank_name ?? "",
        계좌번호: row.account_number ?? "",
        예금주: row.account_holder ?? "",
        지급액: row.total_net_amount ?? 0,
        건수: row.settlement_count ?? 0,
        셀러: row.seller_name ?? "",
        메모: `수북 정산 ${monthTag}`,
      }));

      await exportRowsToXlsx({
        rows: exportRows,
        columns: [
          { key: "은행", header: "은행", width: 14 },
          { key: "계좌번호", header: "계좌번호", width: 22 },
          { key: "예금주", header: "예금주", width: 14 },
          { key: "지급액", header: "지급액", type: Number, width: 14 },
          { key: "건수", header: "건수", type: Number, width: 8 },
          { key: "셀러", header: "셀러", width: 14 },
          { key: "메모", header: "메모", width: 18 },
        ],
        fileName,
        sheetName: "payouts",
      });

      showToast(`${exportRows.length}개 계좌 대량이체 엑셀을 다운로드했습니다. 송금 후 파일을 삭제하세요.`, "success");
    } catch (exportError) {
      showToast(exportError?.message || "대량이체 엑셀 생성에 실패했습니다.", "error");
    } finally {
      setIsPayoutExporting(false);
      setPayoutExportConfirmOpen(false);
    }
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

  const completeSettlements = async (ids, transferReference = null) => {
    if (!ids.length || !supabase) {
      return;
    }

    setBusyAction("complete");
    const { data, error } = await supabase.rpc("admin_complete_settlements", {
      p_settlement_ids: ids,
      p_transfer_reference:
        typeof transferReference === "string" && transferReference.trim()
          ? transferReference.trim()
          : null,
    });

    if (error) {
      setBusyAction("");
      showToast(error.message || "정산 완료 처리에 실패했습니다.", "error");
      return;
    }

    const completedRows = Array.isArray(data?.settlements) ? data.settlements : [];
    const notificationTargets = completedRows.filter((row) => row.seller_phone);
    const notificationOutcomes = await Promise.allSettled(
      notificationTargets.map((row) =>
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

    const failures = [];
    let successCount = 0;
    notificationOutcomes.forEach((outcome, index) => {
      const row = notificationTargets[index];
      if (outcome.status === "fulfilled" && outcome.value?.success !== false) {
        successCount += 1;
        return;
      }
      const error =
        outcome.status === "rejected"
          ? outcome.reason?.message ?? "알 수 없는 오류"
          : outcome.value?.error ?? "알 수 없는 오류";
      failures.push({
        id: row.id,
        label: `${row.seller_name || "이름 미상"} (${row.seller_phone}) — ${formatCurrency(row.net_amount)}`,
        error,
        row,
      });
    });

    const skippedMessage =
      Number(data?.skipped_missing_account_count ?? 0) > 0
        ? ` 계좌 정보가 없는 ${data.skipped_missing_account_count}건은 제외했습니다.`
        : "";
    showToast(`${data?.updated_count ?? 0}건을 정산 완료 처리했습니다.${skippedMessage}`, "success");

    if (failures.length > 0 || notificationTargets.length > 0) {
      setNotificationResult({ successCount, failures });
    }

    await loadSettlements();
  };

  const retryFailedSettlementNotifications = async () => {
    if (!notificationResult?.failures?.length) return;

    setIsRetryingNotifications(true);
    const targets = notificationResult.failures;

    const outcomes = await Promise.allSettled(
      targets.map((failure) =>
        notifySettlementDone({
          sellerPhone: failure.row.seller_phone,
          sellerName: failure.row.seller_name,
          sellerUserId: failure.row.seller_user_id,
          amount: failure.row.net_amount,
          bankName: failure.row.bank_name || "계좌",
          accountLast4: failure.row.account_last4,
          settlementId: failure.row.id,
        }),
      ),
    );

    const remainingFailures = [];
    let extraSuccess = 0;
    outcomes.forEach((outcome, index) => {
      const failure = targets[index];
      if (outcome.status === "fulfilled" && outcome.value?.success !== false) {
        extraSuccess += 1;
        return;
      }
      const error =
        outcome.status === "rejected"
          ? outcome.reason?.message ?? "알 수 없는 오류"
          : outcome.value?.error ?? "알 수 없는 오류";
      remainingFailures.push({ ...failure, error });
    });

    setIsRetryingNotifications(false);
    setNotificationResult({
      successCount: (notificationResult.successCount ?? 0) + extraSuccess,
      failures: remainingFailures,
    });
  };

  const exportCurrentRows = () => {
    if (!rows.length) {
      showToast("내보낼 정산 데이터가 없습니다.", "error");
      return;
    }
    // 평문 옵션이 켜져 있으면 한 번 더 명시적 confirm을 요구한다.
    if (exportPlainAccount) {
      setExportPlainConfirmOpen(true);
      return;
    }
    setExportConfirmOpen(true);
  };

  const handleExportConfirmed = async (reason) => {
    setIsExporting(true);

    try {
      const isPlain = exportPlainAccount;
      const settlementIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));

      // 다운로더 식별자(이메일 prefix) — 파일명에 포함하여 추후 누가 받았는지 추적
      const { data: { user } = {} } = await supabase.auth.getUser();
      const adminEmail = user?.email ?? "unknown";
      const adminTag = adminEmail.split("@")[0].replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 16) || "anon";
      const nowIso = new Date().toISOString();
      const stamp = nowIso.replace(/[:.]/g, "-").slice(0, 19);
      const maskTag = isPlain ? "plain" : "masked";
      const fileName = `subook-settlements-${stamp}-${adminTag}-${maskTag}.xlsx`;

      // 평문 계좌 다운로드는 audit 성공이 보장돼야 함. RPC 실패 시 다운로드 차단.
      // 마스킹 다운로드는 audit 실패해도 진행하되 console.warn으로 알림.
      if (isPlain) {
        const { error: auditError } = await supabase.rpc("admin_log_settlement_export", {
          p_settlement_ids: settlementIds,
          p_is_plain_text: true,
          p_file_name: fileName,
          p_client_tag: reason ? `reason:${reason.slice(0, 100)}` : null,
        });
        if (auditError) {
          showToast(
            "audit 기록에 실패해 평문 계좌 다운로드를 중단합니다. 시스템 담당자에게 알려주세요.",
            "error",
          );
          setIsExporting(false);
          setExportConfirmOpen(false);
          return;
        }
      }

      const exportRows = buildExportRows(rows, { plain: isPlain });
      const columnWidths = [12, 12, 20, 14, 16, 18, 32, 14, 12, 10, 12, 12, 12, 22, 12];
      const columns = Object.keys(exportRows[0]).map((key, index) => ({
        key,
        header: key,
        width: columnWidths[index],
      }));

      await exportRowsToXlsx({
        rows: exportRows,
        columns,
        fileName,
        sheetName: "settlements",
      });

      // 마스킹 다운로드도 audit 기록은 시도 (실패해도 다운로드는 진행됨)
      if (!isPlain) {
        try {
          await supabase.rpc("admin_log_settlement_export", {
            p_settlement_ids: settlementIds,
            p_is_plain_text: false,
            p_file_name: fileName,
            p_client_tag: reason ? `reason:${reason.slice(0, 100)}` : null,
          });
        } catch (auditErr) {
          console.warn("audit 기록 실패 (다운로드는 정상)", auditErr);
        }
      }

      showToast(
        `정산 엑셀 ${rows.length}건을 다운로드했습니다.${isPlain ? " (평문 계좌 포함 — audit 영구 기록됨)" : ""}`,
        "success",
      );
    } catch (error) {
      showToast(error?.message || "엑셀 다운로드에 실패했습니다.", "error");
    } finally {
      setIsExporting(false);
      setExportConfirmOpen(false);
    }
  };

  return (
    <AdminShell
      activeModule="settlements"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700"
            title="체크하면 XLSX 내보내기에 계좌번호가 마스킹 없이(실계좌) 포함됩니다. 2단계 확인과 audit 기록을 거칩니다."
          >
            <input
              checked={exportPlainAccount}
              onChange={(event) => setExportPlainAccount(event.target.checked)}
              type="checkbox"
            />
            엑셀에 실계좌 포함
          </label>
          <button
            className="btn-secondary !w-auto !px-3 !py-2 text-xs"
            onClick={exportCurrentRows}
            type="button"
          >
            XLSX 내보내기
          </button>
        </div>
      }
      description="구매확정 후 자동 생성된 정산 예정건을 승인하고 지급 완료까지 처리합니다."
      summaryCards={summaryCards}
      title="정산"
    >
      {/* R1 IA 개편: 자동/수동 정산을 사이드바 메뉴 2개 대신 한 메뉴의 탭으로 */}
      <AdminPageTabs
        activeKey="auto"
        tabs={[
          { key: "auto", label: "자동 정산", hint: "회원 주문" },
          { key: "manual", label: "수동 정산", hint: "식스샵 구매분", to: "/admin/manual-settlements" },
        ]}
      />

      {/* P1: 건별 목록 ↔ 셀러별 지급 롤업 (매월 1일 송금 단위) */}
      <AdminPageTabs
        activeKey={viewMode}
        onSelect={(key) => setViewMode(key)}
        tabs={[
          { key: "list", label: "건별 목록", hint: "교재/주문 단위" },
          { key: "payout", label: "셀러별 지급", hint: "계좌 단위 송금" },
        ]}
      />

      {viewMode === "payout" ? (
        <>
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">셀러별 지급 롤업</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  같은 계좌로 나갈 정산을 묶어서 보여줍니다 — 송금 1회 = 1행.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { value: "approved", label: "승인 완료만" },
                  { value: "with-pending", label: "대기 포함" },
                ].map((option) => (
                  <button
                    aria-pressed={payoutScope === option.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      payoutScope === option.value
                        ? "bg-slate-950 text-white"
                        : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                    key={option.value}
                    onClick={() => setPayoutScope(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  className="btn-primary !w-auto !px-4 !py-2 text-xs"
                  disabled={isPayoutExporting || payoutRows.length === 0}
                  onClick={() => setPayoutExportConfirmOpen(true)}
                  type="button"
                >
                  {isPayoutExporting ? "생성 중..." : "대량이체 엑셀 (평문 계좌)"}
                </button>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-700">
              {payoutTotals.groupCount.toLocaleString("ko-KR")}개 계좌 · 총 지급{" "}
              {formatCurrency(payoutTotals.grandTotal)}
            </p>
          </section>

          <section className="card p-0">
            {isPayoutLoading ? (
              <p className="py-10 text-center text-sm font-semibold text-slate-400">불러오는 중...</p>
            ) : payoutRows.length === 0 ? (
              <p className="py-10 text-center text-sm font-semibold text-slate-400">
                지급 대상이 없습니다. (범위: {payoutScope === "approved" ? "승인 완료" : "대기 포함"})
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500">예금주</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500">은행</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500">계좌</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500">셀러</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500">건수</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500">지급액</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500">처리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payoutRows.map((row) => (
                      <tr className="hover:bg-slate-50" key={`${row.seller_user_id}-${row.account_number}`}>
                        <td className="px-4 py-3 font-bold text-slate-900">{row.account_holder}</td>
                        <td className="px-4 py-3 text-slate-700">{row.bank_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {maskAccountNumber(row.account_number)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{maskName(row.seller_name)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {row.settlement_count}건
                          {row.pending_count > 0 ? (
                            <span className="ml-1 text-xs font-semibold text-amber-600">
                              (대기 {row.pending_count})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-950">
                          {formatCurrency(row.total_net_amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.approved_count > 0 ? (
                            <button
                              className="btn-primary !inline-flex !w-auto !px-3 !py-2 text-xs"
                              disabled={busyAction !== ""}
                              onClick={() =>
                                setCompleteConfirm({
                                  ids: (row.settlement_ids ?? []).map(Number),
                                })
                              }
                              type="button"
                            >
                              완료 처리 ({row.approved_count})
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">승인 대기</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* 구 사이트(식스샵)·수동 정산 연동 요약 — 회원 주문 자동 정산과 별개 트랙 (2026-07-06 피드백) */}
      {manualSummary ? (
        <section className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              구 사이트(식스샵)·수동 정산 내역
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              미지급{" "}
              <strong className="text-rose-600">
                {manualSummary.unpaid_count ?? 0}건 · {formatCurrency(manualSummary.unpaid_amount ?? 0)}
              </strong>
              <span className="mx-1.5 text-slate-300">|</span>
              지급완료 {manualSummary.paid_count ?? 0}건 · {formatCurrency(manualSummary.paid_amount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              플랫폼 이전(식스샵) 판매분 정산은 수동 정산 메뉴에서 지급 처리·추적합니다.
              아래 목록은 회원 주문의 자동 정산 전용입니다.
            </p>
          </div>
          <Link className="btn-secondary !w-auto !px-4 !py-2 text-sm" to="/admin/manual-settlements">
            수동 정산 관리 →
          </Link>
        </section>
      ) : null}

      {viewMode === "list" ? (
      <>
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
                setCurrentPage(1);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* 필터 영역 — 운영툴이라 label·preset 명시 (AdminOrdersPage와 동일 패턴) */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px]">
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">검색어</span>
            <input
              className="input-base !w-full"
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="판매자, 주문번호, 교재명"
              type="search"
              value={search}
            />
          </label>
          <label>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">시작일</span>
            <input
              className="input-base !w-auto"
              onChange={(event) => {
                setFromDate(event.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={fromDate}
            />
          </label>
          <span className="pb-3 text-sm font-semibold text-slate-400">~</span>
          <label>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">종료일</span>
            <input
              className="input-base !w-auto"
              onChange={(event) => {
                setToDate(event.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={toDate}
            />
          </label>
          {/* 빠른 기간 preset */}
          <div className="flex flex-wrap gap-1 pb-1">
            {[
              { label: "오늘", days: 0 },
              { label: "7일", days: 7 },
              { label: "30일", days: 30 },
              { label: "전체", days: null },
            ].map((preset) => (
              <button
                className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:border-slate-400"
                key={preset.label}
                onClick={() => {
                  if (preset.days === null) {
                    setFromDate("");
                    setToDate("");
                  } else {
                    const today = new Date();
                    const from = new Date(today.getTime() - preset.days * 86400000);
                    setFromDate(from.toISOString().slice(0, 10));
                    setToDate(today.toISOString().slice(0, 10));
                  }
                  setCurrentPage(1);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
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
              onClick={() => setCompleteConfirm({ ids: selectedApprovedIds })}
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
          <div className="p-8 text-center text-sm font-semibold text-slate-400">
            정산 데이터가 없습니다.
            <p className="mt-2 text-xs font-normal text-slate-400">
              회원 주문 정산은 구매자의 구매확정(배송완료 후 7일 자동 확정) 시 자동 생성되고,
              지급 예정일은 매월 1일로 잡힙니다.
            </p>
            <p className="mt-1 text-xs font-normal text-slate-400">
              플랫폼 이전(식스샵) 판매분 정산 내역은 상단의 &lsquo;수동 정산 관리&rsquo;에서 확인하세요.
            </p>
          </div>
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
                      <StatusBadge status={row.status} type="settlement" />
                      {row.status === "completed" && row.completed_at ? (
                        <p className="mt-1 text-xs text-slate-400">{formatDate(row.completed_at)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.seller_name}</p>
                      <p className="mt-1 text-xs text-slate-400">{maskedContact(row.seller_phone, row.seller_email)}</p>
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
                        <p className="mt-1 text-xs text-slate-400">{maskName(row.account_holder)}</p>
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
                          onClick={() => setCompleteConfirm({ ids: [row.id] })}
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
        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
        />
      </section>
      </>
      ) : null}

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

      <NotificationResultModal
        busy={isRetryingNotifications}
        failures={notificationResult?.failures ?? []}
        onClose={() => (isRetryingNotifications ? null : setNotificationResult(null))}
        onRetry={retryFailedSettlementNotifications}
        open={Boolean(notificationResult)}
        successCount={notificationResult?.successCount ?? 0}
        title="정산 완료 알림톡 발송 결과"
      />

      <DestructiveConfirmModal
        busy={isExporting}
        cancelLabel="취소"
        confirmLabel="다운로드"
        confirmPhrase="정산엑셀"
        description={
          `정산 엑셀(${exportPlainAccount ? "평문 계좌 포함" : "계좌 마스킹"}) 다운로드입니다.\n\n` +
          "・판매자 연락처가 포함됩니다.\n" +
          "・외부 메신저, 이메일, 클라우드에 업로드하거나 공유하지 마세요.\n" +
          "・송금이 끝나면 즉시 PC에서 파일을 삭제해 주세요.\n\n" +
          `현재 ${rows.length}건이 포함됩니다. 다운로드 사유를 남겨주세요.`
        }
        onCancel={() => (isExporting ? null : setExportConfirmOpen(false))}
        onConfirm={handleExportConfirmed}
        open={exportConfirmOpen}
        reasonMinLength={4}
        reasonPlaceholder="예: 2026-05-19 정기 송금"
        reasonRequired
        title="정산 엑셀 다운로드 — 민감정보 포함"
      />

      <DestructiveConfirmModal
        busy={isExporting}
        cancelLabel="취소"
        confirmLabel="평문 다운로드"
        confirmPhrase="평문계좌"
        description={
          "평문 계좌번호가 포함된 정산 엑셀을 다운로드합니다.\n\n" +
          "・평문 계좌번호는 유출 시 직접적인 금융 사고로 이어질 수 있습니다.\n" +
          "・다운로드 사실은 audit log에 남고, 파일명에 다운로더 이메일이 박힙니다.\n" +
          "・송금 외 용도로 보관/전송 시 보안 책임이 운영자에게 있습니다.\n\n" +
          "정말 평문 계좌번호 포함으로 다운로드하시겠습니까?"
        }
        onCancel={() => (isExporting ? null : setExportPlainConfirmOpen(false))}
        onConfirm={(reason) => {
          // 평문 모달이 이미 강화된 사유(6자+)와 확인 문구를 받았으므로
          // 일반 확인 모달을 한 번 더 띄우지 않고 사유를 그대로 audit에 전달한다.
          // (기존엔 여기서 사유를 버리고 두 번째 모달을 띄워 사유가 분실됐음)
          setExportPlainConfirmOpen(false);
          return handleExportConfirmed(reason);
        }}
        open={exportPlainConfirmOpen}
        reasonMinLength={6}
        reasonPlaceholder="예) 정기 송금 외 비상황 — 보안 책임 확인"
        reasonRequired
        title="평문 계좌번호 다운로드 — 최종 확인"
      />

      {/* P1: 정산 완료 확인 — 이체 참조/메모를 받아 settlements.transfer_reference에 기록 */}
      <DestructiveConfirmModal
        busy={busyAction === "complete"}
        cancelLabel="취소"
        confirmLabel="정산 완료 처리"
        description={
          `${completeConfirm?.ids?.length ?? 0}건을 '정산 완료'로 처리합니다.\n\n` +
          "・실제 은행 송금을 마친 뒤에 처리해 주세요.\n" +
          "・완료 시 셀러에게 정산 완료 알림톡이 발송됩니다.\n" +
          "・이체 참조/메모는 '입금 안 됐다' 문의 대사 근거로 기록됩니다."
        }
        onCancel={() => (busyAction === "complete" ? null : setCompleteConfirm(null))}
        onConfirm={async (reason) => {
          const ids = completeConfirm?.ids ?? [];
          setCompleteConfirm(null);
          await completeSettlements(ids, reason);
          if (viewMode === "payout") {
            await loadPayouts();
          }
        }}
        open={Boolean(completeConfirm)}
        reasonMinLength={2}
        reasonPlaceholder="예) 07/16 카카오뱅크 일괄이체"
        reasonRequired
        title="정산 완료 — 이체 증빙 입력"
      />

      {/* P1: 대량이체 엑셀 — 평문 계좌 포함이라 사유 필수 + audit 게이트 */}
      <DestructiveConfirmModal
        busy={isPayoutExporting}
        cancelLabel="취소"
        confirmLabel="대량이체 엑셀 다운로드"
        confirmPhrase="대량이체"
        description={
          "은행 대량이체 등록용 엑셀(평문 계좌번호 포함)을 다운로드합니다.\n\n" +
          "・평문 계좌번호는 유출 시 직접적인 금융 사고로 이어질 수 있습니다.\n" +
          "・다운로드 사실은 audit log에 남고, 파일명에 다운로더 이메일이 박힙니다.\n" +
          "・송금 등록이 끝나면 즉시 PC에서 파일을 삭제해 주세요.\n\n" +
          `현재 ${payoutRows.length}개 계좌 · 총 ${formatCurrency(payoutTotals.grandTotal)}이 포함됩니다.`
        }
        onCancel={() => (isPayoutExporting ? null : setPayoutExportConfirmOpen(false))}
        onConfirm={handlePayoutExportConfirmed}
        open={payoutExportConfirmOpen}
        reasonMinLength={4}
        reasonPlaceholder="예) 2026-08-01 정기 송금"
        reasonRequired
        title="대량이체 엑셀 — 평문 계좌 포함"
      />
    </AdminShell>
  );
}

export default AdminSettlementsPage;
