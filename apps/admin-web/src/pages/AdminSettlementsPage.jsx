import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import NotificationResultModal from "../components/NotificationResultModal";
import { groupSettlementNotificationTargets, notifySettlementDoneGroup } from "../lib/adminNotification";
import { exportRowsToXlsx } from "../lib/excelFile";
import { filterSettlementPayouts, groupSettlementPayouts, settlementDeduction } from "../lib/settlementPayouts";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { fetchAdminSettlementRows } from "@shared-supabase/adminSettlementClient";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { BusyText, InlineLoading, LoadingOverlay } from "../components/Loading";

const PAGE_SIZE = 25;
// 승인 폐지 전 approved도 아직 지급하지 않은 정산이다.
const PAYABLE_STATUSES = ["pending", "approved"];

function AdminSettlementsPage() {
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("payable");
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [detailKey, setDetailKey] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [toast, setToast] = useState(null);
  const [completeConfirm, setCompleteConfirm] = useState(null);
  const [transferReference, setTransferReference] = useState("");
  const [accountModal, setAccountModal] = useState(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [payoutExportConfirmOpen, setPayoutExportConfirmOpen] = useState(false);
  const [isPayoutExporting, setIsPayoutExporting] = useState(false);
  const [notificationResult, setNotificationResult] = useState(null);
  const [isRetryingNotifications, setIsRetryingNotifications] = useState(false);
  const requestIdRef = useRef(0);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, tone = "info") => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const loadSettlements = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError("");
    setSelectedKeys([]);
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setLoadError("정산 서비스에 연결할 수 없습니다.");
      setIsLoading(false);
      return;
    }
    try {
      const nextRows = await fetchAdminSettlementRows(
        supabase,
        statusFilter === "payable" ? PAYABLE_STATUSES : ["completed"],
        () => requestId === requestIdRef.current,
      );
      if (nextRows === null || requestId !== requestIdRef.current) return;
      setRows(nextRows);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setLoadError(error?.message || "정산 목록을 불러오지 못했습니다.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadSettlements();
    return () => { requestIdRef.current += 1; };
  }, [loadSettlements]);

  const groups = useMemo(() => groupSettlementPayouts(rows), [rows]);
  const filteredGroups = useMemo(() => filterSettlementPayouts(groups, search), [groups, search]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const page = Math.min(currentPage, pageCount);
  const visibleGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedGroups = filteredGroups.filter((group) => selectedKeys.includes(group.key) && group.hasAccount);
  const eligibleVisibleGroups = visibleGroups.filter((group) => group.hasAccount);
  const allVisibleSelected = eligibleVisibleGroups.length > 0 && eligibleVisibleGroups.every((group) => selectedKeys.includes(group.key));
  const selectedAmount = selectedGroups.reduce((sum, group) => sum + group.total_net_amount, 0);
  const totalAmount = groups.reduce((sum, group) => sum + group.total_net_amount, 0);
  const detail = groups.find((group) => group.key === detailKey);
  // 실제 이체가 필요한 계좌만 엑셀에 포함. 0원 건은 화면에서 완료 처리할 수 있다.
  const exportGroups = (selectedGroups.length ? selectedGroups : filteredGroups)
    .filter((group) => group.hasAccount && group.total_net_amount > 0);
  const exportTotal = exportGroups.reduce((sum, group) => sum + group.total_net_amount, 0);
  const isPayable = statusFilter === "payable";
  const actionsDisabled = isLoading || Boolean(busyAction) || isPayoutExporting || isSavingAccount;
  const summaryUnavailable = isLoading || Boolean(loadError);
  const summaryCards = [
    { label: isPayable ? "미지급 금액" : "지급 완료 금액", value: summaryUnavailable ? "—" : formatCurrency(totalAmount), hint: isPayable ? "아직 지급하지 않은 정산" : "지급 완료된 정산" },
    { label: isPayable ? "정산할 셀러" : "지급받은 셀러", value: summaryUnavailable ? "—" : `${new Set(groups.map((group) => group.sellerKey)).size}명`, hint: `입금계좌 ${groups.length}개` },
    { label: "대상 교재", value: summaryUnavailable ? "—" : `${rows.length}권`, hint: isPayable ? `계좌 확인 필요 ${groups.filter((group) => !group.hasAccount).length}건` : "셀러를 누르면 상세 내역 확인" },
  ];

  const changeTab = (key) => {
    if (actionsDisabled || key === statusFilter) return;
    requestIdRef.current += 1;
    setRows([]);
    setIsLoading(true);
    setStatusFilter(key);
    setSelectedKeys([]);
    setDetailKey(null);
    setSearch("");
    setCurrentPage(1);
  };

  const toggleGroup = (key) => setSelectedKeys((keys) => keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]);
  const toggleVisible = () => setSelectedKeys((keys) => allVisibleSelected
    ? keys.filter((key) => !eligibleVisibleGroups.some((group) => group.key === key))
    : [...new Set([...keys, ...eligibleVisibleGroups.map((group) => group.key)])]);

  const requestCompletion = (targets) => {
    if (actionsDisabled || !targets.length || targets.some((group) => !group.hasAccount)) return;
    setTransferReference("");
    setCompleteConfirm({
      ids: targets.flatMap((group) => group.settlement_ids),
      amount: targets.reduce((sum, group) => sum + group.total_net_amount, 0),
      groups: targets,
    });
  };

  // 대량이체 엑셀 — 평문 계좌 포함이므로 audit 성공이 선행돼야 다운로드
  const handlePayoutExportConfirmed = async (reason) => {
    if (!exportGroups.length || isLoading || busyAction) return;
    setIsPayoutExporting(true);
    try {
      const settlementIds = exportGroups
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
      const exportRows = exportGroups.map((row) => ({
        은행: row.bank_name ?? "",
        계좌번호: row.account_number ?? "",
        예금주: row.account_holder ?? "",
        지급액: row.total_net_amount ?? 0,
        건수: row.items.length ?? 0,
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


  // 승인 단계 폐지(2026-08-19): approveSettlements 제거 — 대기 건은 송금 후 바로 완료 처리
  const completeSettlements = async (ids, transferReference = null) => {
    if (!ids.length || !supabase || busyAction || isLoading) {
      return;
    }

    setBusyAction("complete");
    try {
      const { data, error } = await supabase.rpc("admin_complete_settlements", {
        p_settlement_ids: ids,
        p_transfer_reference:
          typeof transferReference === "string" && transferReference.trim()
            ? transferReference.trim()
            : null,
      });

      if (error) throw error;

      const completedRows = Array.isArray(data?.settlements) ? data.settlements : [];
      // 셀러(수신번호+계좌) 단위로 묶어 총 정산액 1건만 발송 — 건별 발송은 권수만큼 중복 수신
      const sellerGroups = groupSettlementNotificationTargets(completedRows);
      // 합계 0원 묶음(상품화 비용이 판매 순수익을 전부 차감)은 "0원 입금" 문자가 되므로 알림 생략.
      // 완료 처리 자체는 유지 — 책 settled 전환·박스비 차감 기록은 필요하고 송금액은 0이다.
      const notificationTargets = sellerGroups.filter((target) => target.netAmount > 0);
      const skippedZeroCount = sellerGroups.length - notificationTargets.length;
      const notificationOutcomes = await Promise.allSettled(
        notificationTargets.map((target) => notifySettlementDoneGroup(target)),
      );


      const failures = [];
      let successCount = 0;
      notificationOutcomes.forEach((outcome, index) => {
        const target = notificationTargets[index];
        if (outcome.status === "fulfilled" && outcome.value?.success !== false) {
          successCount += 1;
          return;
        }
        const error =
          outcome.status === "rejected"
            ? outcome.reason?.message ?? "알 수 없는 오류"
            : outcome.value?.error ?? "알 수 없는 오류";
        failures.push({
          id: target.representativeId,
          label: `${target.sellerName || "이름 미상"} (${target.sellerPhone}) — ${formatCurrency(target.netAmount)} · ${target.itemCount}건`,
          error,
          target,
        });
      });

      const skippedMessage =
        Number(data?.skipped_missing_account_count ?? 0) > 0
          ? ` 계좌 정보가 없는 ${data.skipped_missing_account_count}건은 제외했습니다.`
          : "";
      const zeroMessage =
        skippedZeroCount > 0 ? ` 0원 정산 ${skippedZeroCount}명은 알림톡을 생략했습니다.` : "";
      showToast(
        `${data?.updated_count ?? 0}건을 정산 완료 처리했습니다.${skippedMessage}${zeroMessage}`,
        "success",
      );

      if (failures.length > 0 || notificationTargets.length > 0 || skippedZeroCount > 0) {
        setNotificationResult({ successCount, failures, skippedZeroCount });
      }

      setCompleteConfirm(null);
      setDetailKey(null);
      await loadSettlements();
    } catch (error) {
      showToast(error?.message || "처리 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요.", "error");
      setCompleteConfirm(null);
      await loadSettlements();
    } finally {
      setBusyAction("");
    }
  };


  const retryFailedSettlementNotifications = async () => {
    if (!notificationResult?.failures?.length) return;

    setIsRetryingNotifications(true);
    const targets = notificationResult.failures;

    const outcomes = await Promise.allSettled(
      targets.map((failure) => notifySettlementDoneGroup(failure.target)),
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
      skippedZeroCount: notificationResult.skippedZeroCount ?? 0,
    });
  };


  const saveShipmentAccount = async () => {
    if (!accountModal || !supabase || isSavingAccount) return;
    if (![accountModal.bankName, accountModal.accountHolder].every((value) => value.trim())
      || !/^[\d\s-]+$/.test(accountModal.accountNumber.trim())) {
      showToast("은행, 계좌번호, 예금주를 모두 입력해 주세요.", "error");
      return;
    }
    setIsSavingAccount(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_shipment_settlement_account", {
        p_shipment_id: accountModal.shipmentId,
        p_bank_name: accountModal.bankName.trim(),
        p_account_number: accountModal.accountNumber.trim(),
        p_account_holder: accountModal.accountHolder.trim(),
      });
      if (error) throw error;
      setAccountModal(null);
      setDetailKey(null);
      showToast("정산계좌를 저장했습니다.", "success");
      await loadSettlements();
    } catch (error) {
      showToast(error?.message || "계좌를 저장하지 못했습니다.", "error");
    } finally {
      setIsSavingAccount(false);
    }
  };

  return (
    <AdminShell activeModule="settlements" title="정산"
      actions={
        <button className="btn-secondary !w-auto !px-3 !py-2 text-xs" type="button"
          disabled={actionsDisabled} onClick={() => { setDetailKey(null); void loadSettlements(); }}>새로고침</button>
      }
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {summaryCards.map((card, index) => <div className={`card !p-4 ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`} key={card.label}>
          <dt className="text-xs font-semibold text-slate-500">{card.label}</dt>
          <dd className="mt-1 text-2xl font-black tabular-nums text-slate-950">{card.value}</dd>
          <dd className="mt-1 text-xs text-slate-500">{isLoading ? "불러오는 중" : loadError ? "조회 실패" : card.hint}</dd>
        </div>)}
      </dl>
      <AdminPageTabs activeKey={statusFilter} onSelect={changeTab} tabs={[
        { key: "payable", label: "미지급" }, { key: "completed", label: "지급 완료" },
      ]} />

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 sm:max-w-md">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">셀러·교재 검색</span>
            <input className="input-base !w-full" type="search" value={search} disabled={actionsDisabled}
              placeholder="셀러명, 연락처, 교재명, 주문번호"
              onChange={(event) => { setSearch(event.target.value); setSelectedKeys([]); setCurrentPage(1); }} />
          </label>
          {isPayable ? (
            <button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button"
              disabled={actionsDisabled || !exportGroups.length} onClick={() => setPayoutExportConfirmOpen(true)}>
              {selectedGroups.length ? "선택 이체 목록 엑셀" : "이체 목록 엑셀"}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-600">
            {isLoading ? "불러오는 중" : loadError ? "목록을 다시 불러와 주세요." : `${filteredGroups.length}개 지급 내역`}
            {!isLoading && selectedGroups.length > 0 ? <span className="ml-3 font-bold text-slate-950">선택 {selectedGroups.length}개 · {formatCurrency(selectedAmount)}</span> : null}
          </p>
          {isPayable ? (
            <button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button"
              disabled={actionsDisabled || !selectedGroups.length} onClick={() => requestCompletion(selectedGroups)}>
              선택 지급 완료{selectedGroups.length ? ` (${selectedGroups.length})` : ""}
            </button>
          ) : null}
        </div>
      </section>

      <section className="card !p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500"><InlineLoading label="셀러별 정산금액을 불러오는 중..." /></div>
        ) : loadError ? (
          <div className="space-y-3 px-6 py-12 text-center" role="alert">
            <p className="text-sm font-semibold text-rose-700">{loadError}</p>
            <button className="btn-secondary !w-auto !px-4 !py-2 text-sm" onClick={loadSettlements} type="button">다시 불러오기</button>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-bold text-slate-800">{search ? "검색 결과가 없습니다." : isPayable ? "미지급 정산이 없습니다." : "지급 완료 내역이 없습니다."}</p>
            {search ? <button className="mt-3 text-sm font-semibold text-slate-600 underline" type="button" onClick={() => { setSearch(""); setCurrentPage(1); }}>검색 초기화</button> : null}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500">
              {isPayable ? <input type="checkbox" aria-label="현재 페이지 전체 선택" checked={allVisibleSelected}
                disabled={actionsDisabled || !eligibleVisibleGroups.length} onChange={toggleVisible} /> : null}
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_9rem]">
                <span>셀러</span><span className="hidden sm:block">입금계좌</span><span className="hidden text-right sm:block">교재</span><span className="text-right">{isPayable ? "정산할 금액" : "지급한 금액"}</span>
              </div>
              <span className="hidden w-12 sm:block" />
            </div>
            <ul className="divide-y divide-slate-100">
              {visibleGroups.map((group) => (
                <li className="flex items-center gap-4 px-5 hover:bg-slate-50" key={group.key}>
                  {isPayable ? <input type="checkbox" aria-label={`${group.seller_name} 지급 선택`}
                    checked={selectedKeys.includes(group.key)} disabled={actionsDisabled || !group.hasAccount} onChange={() => toggleGroup(group.key)} /> : null}
                  <button className="flex min-w-0 flex-1 items-center gap-4 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
                    type="button" disabled={actionsDisabled} onClick={() => setDetailKey(group.key)} aria-label={`${group.seller_name} 정산 상세`}>
                    <span className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_9rem]">
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-slate-900">{group.seller_name}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{group.seller_phone || group.seller_email || "연락처 없음"}</span>
                      </span>
                      <span className="col-span-2 row-start-2 text-xs text-slate-600 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        {group.hasAccount ? <><span className="block">{group.bank_name} <span className="font-mono">{group.account_number}</span></span><span className="mt-1 block text-slate-400">예금주 {group.account_holder}</span></> : <span className="font-bold text-amber-700">계좌 확인 필요</span>}
                      </span>
                      <span className="hidden text-right text-sm text-slate-600 sm:block">{group.items.length}권</span>
                      <span className="col-start-2 row-start-1 text-right sm:col-start-4">
                        <span className="block text-lg font-black tabular-nums text-slate-950">{formatCurrency(group.total_net_amount)}</span>
                        <span className="mt-1 block text-xs text-slate-400 sm:hidden">{group.items.length}권</span>
                        {!isPayable ? <span className="mt-1 block text-xs text-slate-500">최근 지급 {formatDate(group.completed_at)}</span> : null}
                      </span>
                    </span>
                    <span className="hidden w-12 shrink-0 text-right text-xs font-bold text-slate-500 sm:block">상세 →</span>
                  </button>
                </li>
              ))}
            </ul>
            <AdminPagination currentPage={page} isLoading={isLoading} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} totalCount={filteredGroups.length} />
          </>
        )}
      </section>

      <AdminDialog open={Boolean(detail) && !accountModal && !completeConfirm && !isLoading} onClose={() => setDetailKey(null)}
        title={`${detail?.seller_name ?? ""} 정산 상세`} size="2xl" busy={Boolean(busyAction)}
        footer={<div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-700">{detail?.items.length ?? 0}권 · <span className="text-lg text-slate-950">{formatCurrency(detail?.total_net_amount ?? 0)}</span></p>
          <div className="flex gap-2">
            <button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button" onClick={() => setDetailKey(null)}>닫기</button>
            {isPayable && detail ? <button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button" disabled={actionsDisabled || !detail.hasAccount} onClick={() => requestCompletion([detail])}>지급 완료 처리</button> : null}
          </div>
        </div>}
      >
        {detail ? <div className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-wrap justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div><p className="text-xs font-bold text-slate-500">입금계좌</p>
              <p className="mt-2 font-bold text-slate-900">{detail.bank_name || "은행 미등록"} <span className="font-mono">{detail.account_number || "계좌번호 미등록"}</span></p>
              <p className="mt-1 text-sm text-slate-600">예금주 {detail.account_holder || "미등록"}</p>
            </div>
            <div className="text-sm text-slate-600"><p>{detail.seller_phone || detail.seller_email || "연락처 없음"}</p>
              {!detail.hasAccount && isPayable ? <p className="mt-2 font-bold text-amber-700">계좌를 확인한 뒤 지급할 수 있습니다.</p> : null}
            </div>
          </div>
          {isPayable && detail.items.some((item) => !item.seller_user_id && item.shipment_id) ? (
            <div className="flex flex-wrap gap-2">
              {[...new Map(detail.items.filter((item) => !item.seller_user_id && item.shipment_id).map((item) => [item.shipment_id, item])).values()].map((item) => (
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600" key={item.shipment_id} type="button"
                  onClick={() => setAccountModal({ shipmentId: item.shipment_id, sellerName: detail.seller_name, bankName: item.bank_name ?? "", accountNumber: "", accountHolder: item.account_holder ?? detail.seller_name })}>
                  수거 #{item.shipment_id} 계좌 {item.bank_name ? "수정" : "등록"}
                </button>
              ))}
            </div>
          ) : null}
          {isPayable && !detail.hasAccount && detail.items.some((item) => item.seller_user_id) ? <p className="text-sm text-amber-700">회원 셀러에게 마이페이지에서 정산계좌를 등록하도록 안내해 주세요.</p> : null}
          <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
            {[["판매금액", detail.total_sale_amount], ["수수료", detail.total_fee_amount], ["상품화 비용 차감", detail.total_deduction], [isPayable ? "정산할 금액" : "지급한 금액", detail.total_net_amount]].map(([label, value]) => (
              <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-lg font-black tabular-nums text-slate-950">{formatCurrency(value)}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="mb-3 font-bold text-slate-900">정산 대상 교재 <span className="text-slate-500">{detail.items.length}권</span></h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  <tr><th className="px-3 py-3 text-left">교재 / 주문</th><th className="px-3 py-3 text-right">판매금액</th><th className="px-3 py-3 text-right">수수료</th><th className="px-3 py-3 text-right">상품화 비용</th><th className="px-3 py-3 text-right">정산금액</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.map((item) => <tr key={item.id} className="align-top">
                    <td className="max-w-[320px] px-3 py-4"><p className="font-semibold text-slate-900">{item.book_title || "교재명 없음"}</p>
                      <p className="mt-1 text-xs text-slate-500">{[item.book_option, item.condition_grade].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 font-mono text-xs text-slate-400">{item.order_number} · 교재 #{item.book_id}</p>
                      <p className="mt-1 text-xs text-slate-400">{isPayable ? `구매확정 ${formatDate(item.confirmed_at)} · 지급 예정 ${formatDate(item.scheduled_date)}` : `지급 완료 ${formatDate(item.completed_at)}`}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{formatCurrency(item.sale_amount)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{formatCurrency(item.fee_amount)}<p className="mt-1 text-xs text-slate-400">{Number(item.fee_percent)}%</p></td>
                    <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{formatCurrency(settlementDeduction(item))}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-bold tabular-nums text-slate-950">{formatCurrency(item.net_amount)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          {isPayable ? <p className="text-xs text-slate-500">{detail.total_net_amount === 0 ? "비용 차감으로 지급할 금액이 0원입니다. 완료 처리 시 알림톡은 발송되지 않습니다." : "입금계좌로 직접 송금한 뒤 지급 완료 처리해 주세요."}</p> : null}
        </div> : null}
      </AdminDialog>

      {toast ? <div role="alert" className={`fixed bottom-6 left-1/2 z-[210] max-w-[90vw] -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-bold shadow-lg ${toast.tone === "error" ? "bg-rose-600 text-white" : "bg-slate-950 text-white"}`}>{toast.message}</div> : null}

      <NotificationResultModal
        busy={isRetryingNotifications}
        failures={notificationResult?.failures ?? []}
        onClose={() => (isRetryingNotifications ? null : setNotificationResult(null))}
        onRetry={retryFailedSettlementNotifications}
        open={Boolean(notificationResult)}
        successCount={notificationResult?.successCount ?? 0}
        notes={
          Number(notificationResult?.skippedZeroCount ?? 0) > 0
            ? [
                `정산 합계 0원 ${notificationResult.skippedZeroCount}명은 알림톡을 생략했습니다. (상품화 비용이 판매 순수익을 전부 차감)`,
              ]
            : []
        }
        title="정산 완료 알림톡 발송 결과"
      />


      <AdminDialog busy={busyAction === "complete"} open={Boolean(completeConfirm)}
        title="지급 완료 확인" onClose={() => setCompleteConfirm(null)}
        footer={<div className="flex justify-end gap-2">
          <button className="btn-secondary !w-auto !px-4 !py-2 text-sm" type="button" disabled={Boolean(busyAction)} onClick={() => setCompleteConfirm(null)}>취소</button>
          <button className="btn-primary !w-auto !px-4 !py-2 text-sm" type="button" disabled={actionsDisabled || transferReference.trim().length < 2}
            onClick={() => completeSettlements(completeConfirm?.ids ?? [], transferReference)}>지급 완료 처리</button>
        </div>}
      >
        <div className="space-y-5 p-6">
          <div><p className="text-sm font-semibold text-slate-500">{completeConfirm?.groups.length ?? 0}개 계좌 · 교재 {completeConfirm?.ids.length ?? 0}권</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(completeConfirm?.amount ?? 0)}</p>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-4">
            {(completeConfirm?.groups ?? []).map((group) => <li className="py-3" key={group.key}>
              <div className="flex justify-between gap-3 text-sm font-bold text-slate-900"><span>{group.seller_name}</span><span>{formatCurrency(group.total_net_amount)}</span></div>
              <p className="mt-1 text-xs text-slate-500">{group.bank_name} {group.account_number} · {group.account_holder}</p>
            </li>)}
          </ul>
          <p className="text-sm text-slate-700">은행에서 송금을 마친 내역만 완료 처리해 주세요. 완료 시 셀러에게 알림톡이 발송됩니다. 0원 정산은 알림톡을 생략합니다.</p>
          <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">이체 메모</span>
            <input className="input-base !w-full" type="text" value={transferReference} disabled={Boolean(busyAction)}
              onChange={(event) => setTransferReference(event.target.value)} placeholder="예) 10/1 은행 이체 완료 · 이체번호" />
          </label>
        </div>
      </AdminDialog>

      <DestructiveConfirmModal busy={isPayoutExporting} open={payoutExportConfirmOpen}
        cancelLabel="취소" confirmLabel="이체 목록 다운로드" title="이체 목록 엑셀 다운로드"
        description={`실제 계좌번호가 포함된 ${exportGroups.length}개 계좌 · 총 ${formatCurrency(exportTotal)}의 이체 목록입니다.\n\n계좌 확인이 필요한 내역과 0원 정산은 제외됩니다.\n다운로드 사유가 기록됩니다. 송금 후 파일을 삭제해 주세요.`}
        onCancel={() => setPayoutExportConfirmOpen(false)} onConfirm={handlePayoutExportConfirmed}
        reasonMinLength={4} reasonPlaceholder="예) 10월 정산 이체" reasonRequired
      />

      {/* 비회원 셀러 정산계좌 입력 (2026-09-01) */}
      <AdminDialog
        busy={isSavingAccount}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary !w-auto !px-4 !py-2 text-sm"
              disabled={isSavingAccount}
              onClick={() => setAccountModal(null)}
              type="button"
            >
              취소
            </button>
            <button
              className="btn-primary !w-auto !px-4 !py-2 text-sm"
              disabled={isSavingAccount}
              onClick={saveShipmentAccount}
              type="button"
            >
              {isSavingAccount ? <BusyText>저장 중...</BusyText> : "저장"}
            </button>
          </div>
        }
        onClose={() => setAccountModal(null)}
        open={Boolean(accountModal)}
        size="md"
        title="비회원 셀러 정산계좌"
      >
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{accountModal?.sellerName}</strong> 님(수거 #
            {accountModal?.shipmentId})은 회원 계정에 연결되지 않은 셀러입니다. 송금할 계좌를
            직접 등록해 주세요. 이 수거 건의 미지급 정산에 함께 반영됩니다.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">은행</span>
            <input
              className="input-base !w-full"
              onChange={(event) =>
                setAccountModal((current) => ({ ...current, bankName: event.target.value }))
              }
              placeholder="예) 신한"
              type="text"
              value={accountModal?.bankName ?? ""}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">계좌번호</span>
            <input
              className="input-base !w-full"
              onChange={(event) =>
                setAccountModal((current) => ({ ...current, accountNumber: event.target.value }))
              }
              placeholder="숫자만 입력해도 됩니다"
              type="text"
              value={accountModal?.accountNumber ?? ""}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">예금주</span>
            <input
              className="input-base !w-full"
              onChange={(event) =>
                setAccountModal((current) => ({ ...current, accountHolder: event.target.value }))
              }
              placeholder="예) 홍길동"
              type="text"
              value={accountModal?.accountHolder ?? ""}
            />
          </label>
        </div>
      </AdminDialog>


      <LoadingOverlay open={isPayoutExporting || Boolean(busyAction)}
        message={isPayoutExporting ? "이체 목록 엑셀을 만들고 있습니다" : "정산을 처리하고 있습니다"} />
    </AdminShell>
  );
}

export default AdminSettlementsPage;
