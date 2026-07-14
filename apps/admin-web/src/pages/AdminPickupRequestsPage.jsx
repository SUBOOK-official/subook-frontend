import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import NotificationResultModal from "../components/NotificationResultModal";
import { notifyPickupAccepted } from "../lib/adminNotification";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate, maskAddress, maskName, maskPhone } from "@shared-domain/format";
import { pickupRequestStatusLabel } from "@shared-domain/status";
import StatusBadge from "@shared-domain/StatusBadge";

const PAGE_SIZE = 30;

const PICKUP_STATUS_OPTIONS = [
  { value: "pending", label: pickupRequestStatusLabel.pending },
  { value: "pickup_scheduled", label: pickupRequestStatusLabel.pickup_scheduled },
  { value: "picking_up", label: pickupRequestStatusLabel.picking_up },
  { value: "arrived", label: pickupRequestStatusLabel.arrived },
  { value: "inspecting", label: pickupRequestStatusLabel.inspecting },
  { value: "inspected", label: pickupRequestStatusLabel.inspected },
  { value: "completed", label: pickupRequestStatusLabel.completed },
  { value: "cancelled", label: pickupRequestStatusLabel.cancelled },
];

function buildPageItems(currentPage, totalPages) {
  const items = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const isBoundary = page === 1 || page === totalPages;
    const isNearCurrent = Math.abs(page - currentPage) <= 1;

    if (isBoundary || isNearCurrent) {
      items.push(page);
      continue;
    }

    if (items[items.length - 1] !== "...") {
      items.push("...");
    }
  }

  return items;
}

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

function formatAddress(pickupRequest) {
  return [
    pickupRequest.pickup_postal_code ? `[${pickupRequest.pickup_postal_code}]` : "",
    pickupRequest.pickup_address_line1,
    pickupRequest.pickup_address_line2,
  ]
    .filter(Boolean)
    .join(" ");
}

function getPickupItemSummary(pickupRequest) {
  const items = Array.isArray(pickupRequest.items) ? pickupRequest.items : [];
  if (items.length === 0) {
    return `${pickupRequest.item_count ?? 0}권`;
  }

  const firstTitle = items[0]?.title || "교재";
  const extraCount = Math.max(0, items.length - 1);
  return extraCount > 0 ? `${firstTitle} 외 ${extraCount}권` : firstTitle;
}

function PickupDetailRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="min-w-[96px] shrink-0 text-xs font-semibold text-slate-400">{label}</dt>
      <dd className={`text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value === null || value === undefined || value === "" ? (
          <span className="text-slate-300">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// 수거요청 상세 모달 — 목록엔 안 보이는 운영 필드(현관비번·희망일·메모·이메일·박스수·품목)를
// 본다. 상세 화면이라 PII(이름·전화·주소)는 평문으로 노출(운영자가 명시적으로 연 행).
function PickupDetailModal({ request, onClose }) {
  if (!request) return null;
  const items = Array.isArray(request.items) ? request.items : [];
  const fullAddress = formatAddress(request);

  return (
    <AdminDialog
      open={Boolean(request)}
      onClose={onClose}
      size="xl"
      title={`수거 요청 상세 · ${request.request_number ?? ""}`}
    >
      <div className="space-y-6 px-6 py-5">
        <section>
          <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">수령인 · 수거지</h3>
          <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <PickupDetailRow label="이름" value={request.pickup_recipient_name} />
            <PickupDetailRow label="연락처" value={request.pickup_recipient_phone} mono />
            <PickupDetailRow label="이메일" value={request.pickup_email} />
            <PickupDetailRow label="주소" value={fullAddress} />
            <PickupDetailRow
              label="현관 비밀번호"
              value={request.pickup_entrance_password}
              mono
            />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">수거 정보</h3>
          <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <PickupDetailRow
              label="희망 수거일"
              value={request.desired_pickup_date ? formatDate(request.desired_pickup_date) : null}
            />
            <PickupDetailRow
              label="예상 권수"
              value={request.expected_book_count != null ? `${request.expected_book_count}권` : null}
            />
            <PickupDetailRow
              label="박스 수"
              value={request.box_count != null ? `${request.box_count}개` : null}
            />
            <PickupDetailRow label="요청일" value={formatDateTime(request.created_at)} />
            <PickupDetailRow label="메모" value={request.pickup_memo} />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">
            품목 {items.length > 0 ? `(${items.length})` : ""}
          </h3>
          {items.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {items.map((item, index) => (
                <li
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  key={item.id ?? `${item.title ?? "item"}-${index}`}
                >
                  <span className="font-semibold text-slate-800">{item.title || "교재"}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {[item.brand, item.subject].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-400">
              등록된 품목이 없습니다. (총 {request.item_count ?? 0}권)
            </p>
          )}
        </section>

        {request.tracking_number ? (
          <section>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">배송</h3>
            <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <PickupDetailRow label="운송장" value={request.tracking_number} mono />
              <PickupDetailRow label="택배사" value={request.tracking_carrier || "CJ대한통운"} />
              <PickupDetailRow label="CJ 상태" value={request.cj_tracking_status} />
            </dl>
          </section>
        ) : null}
      </div>
    </AdminDialog>
  );
}

function canRegisterCjPickup(pickupRequest) {
  return (
    !pickupRequest.tracking_number &&
    !["cancelled", "completed", "inspecting", "inspected"].includes(pickupRequest.status)
  );
}

// 취소 가능 조건 — admin_bulk_cancel_pickup_requests RPC가 실제로 처리하는 범위와 동일.
// (기존에는 선택 자체가 CJ 접수 가능 행으로 제한돼, 운송장이 발급된 pickup_scheduled 건을
//  화면에서 영영 취소할 수 없는 버그가 있었다 — 2026-07-06 수거 사이클 검토에서 수정)
function canCancelPickup(pickupRequest) {
  return ["pending", "pickup_scheduled"].includes(pickupRequest.status);
}

// 체크박스 선택 허용 = CJ 접수 대상 ∪ 취소 대상
function canSelectPickupRow(pickupRequest) {
  return canRegisterCjPickup(pickupRequest) || canCancelPickup(pickupRequest);
}

// 수동 상태 전환 대상 상태 (cancelled 제외 — 취소는 사유 입력이 있는 기존 흐름 전용)
const MANUAL_STATUS_OPTIONS = PICKUP_STATUS_OPTIONS.filter(
  (option) => option.value !== "cancelled",
);

function buildCjTrackingUrl(trackingNumber) {
  if (!trackingNumber) {
    return "";
  }

  return `https://www.cjlogistics.com/ko/tool/parcel/tracking#parcel/detail/${trackingNumber}`;
}

async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

async function callAdminApi(path, options = {}) {
  const accessToken = await getAdminAccessToken();
  if (!accessToken) {
    throw new Error("관리자 인증 토큰이 없습니다.");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "관리자 API 호출에 실패했습니다.");
  }

  return payload;
}

function AdminPickupRequestsPage() {
  const requestIdRef = useRef(0);

  const [pickupRequests, setPickupRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [registeringIds, setRegisteringIds] = useState([]);
  const [trackingLookupId, setTrackingLookupId] = useState(null);
  const [trackingModal, setTrackingModal] = useState(null);
  // 요청 상세 모달 — 목록엔 안 보이는 현관비번·희망일·메모·이메일·박스수·품목 전체를 본다.
  const [detailModal, setDetailModal] = useState(null);
  const [destructiveModal, setDestructiveModal] = useState(null);
  // 수동 상태 전환 확인 모달 { pickupRequest, nextStatus } — CJ 미연동 기간 운영용
  const [statusChangeModal, setStatusChangeModal] = useState(null);
  const [statusChangingId, setStatusChangingId] = useState(null);
  // 알림톡/RPC 부분 실패를 전체 노출 — 이전엔 setError에 3건만 보여 4건 이후가 사라지는 P0 사고
  const [cjFailureModal, setCjFailureModal] = useState(null);
  const [notificationResult, setNotificationResult] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const eligiblePickupIds = useMemo(
    () => pickupRequests.filter(canRegisterCjPickup).map((pickupRequest) => pickupRequest.id),
    [pickupRequests],
  );

  // 선택 가능 행 = CJ 접수 대상 ∪ 취소 대상 (운송장 발급된 pickup_scheduled도 취소를 위해 선택 가능)
  const selectablePickupIds = useMemo(
    () => pickupRequests.filter(canSelectPickupRow).map((pickupRequest) => pickupRequest.id),
    [pickupRequests],
  );

  const cancellablePickupIds = useMemo(
    () => pickupRequests.filter(canCancelPickup).map((pickupRequest) => pickupRequest.id),
    [pickupRequests],
  );

  const selectedEligibleIds = useMemo(
    () => selectedIds.filter((id) => eligiblePickupIds.includes(id)),
    [eligiblePickupIds, selectedIds],
  );

  const selectedCancellableIds = useMemo(
    () => selectedIds.filter((id) => cancellablePickupIds.includes(id)),
    [cancellablePickupIds, selectedIds],
  );

  const allSelectableSelected =
    selectablePickupIds.length > 0 &&
    selectablePickupIds.every((id) => selectedIds.includes(id));

  const statusSummary = useMemo(
    () =>
      pickupRequests.reduce((accumulator, pickupRequest) => {
        accumulator[pickupRequest.status] = (accumulator[pickupRequest.status] || 0) + 1;
        return accumulator;
      }, {}),
    [pickupRequests],
  );

  const summaryCards = [
    { label: "전체 수거 요청", value: `${totalCount}건` },
    { label: "CJ 접수 대기", value: `${eligiblePickupIds.length}건`, hint: "현재 페이지 기준" },
    {
      label: "수거 진행",
      value: `${(statusSummary.pickup_scheduled || 0) + (statusSummary.picking_up || 0)}건`,
      hint: "접수/수거중",
    },
    {
      label: "입고 이후",
      value: `${(statusSummary.arrived || 0) + (statusSummary.inspecting || 0) + (statusSummary.inspected || 0)}건`,
      hint: "현재 페이지 기준",
    },
  ];

  const loadPickupRequests = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("list_admin_pickup_requests", {
      p_search: appliedSearch || null,
      p_statuses: statusFilters.length > 0 ? statusFilters : null,
      p_from_date: appliedFromDate || null,
      p_to_date: appliedToDate || null,
      p_limit: PAGE_SIZE,
      p_offset: (currentPage - 1) * PAGE_SIZE,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (rpcError) {
      setError("수거 요청 목록을 불러오지 못했습니다. 최신 migration 적용 여부를 확인해 주세요.");
      setPickupRequests([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setPickupRequests(rows);
    setTotalCount(rows[0]?.total_count ?? 0);
    setIsLoading(false);
  }, [appliedFromDate, appliedSearch, appliedToDate, currentPage, statusFilters]);

  useEffect(() => {
    void loadPickupRequests();
  }, [loadPickupRequests]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    setSelectedIds((currentIds) => currentIds.filter((id) => selectablePickupIds.includes(id)));
  }, [selectablePickupIds]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const handleFilterReset = () => {
    setSearchInput("");
    setAppliedSearch("");
    setStatusFilters([]);
    setFromDate("");
    setToDate("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const handleStatusToggle = (status) => {
    setStatusFilters((currentStatuses) =>
      currentStatuses.includes(status)
        ? currentStatuses.filter((item) => item !== status)
        : [...currentStatuses, status],
    );
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const handleToggleSelection = (pickupRequest) => {
    if (!canSelectPickupRow(pickupRequest)) {
      return;
    }

    setSelectedIds((currentIds) =>
      currentIds.includes(pickupRequest.id)
        ? currentIds.filter((id) => id !== pickupRequest.id)
        : [...currentIds, pickupRequest.id],
    );
  };

  const handleToggleAllEligible = () => {
    setSelectedIds(allSelectableSelected ? [] : selectablePickupIds);
  };

  // 수동 상태 전환 (CJ 미연동 기간 운영용) — admin_update_pickup_status RPC.
  // 알림톡은 발송하지 않는다 (셀러 안내는 운영자 재량).
  const performManualStatusChange = async () => {
    if (!statusChangeModal) return;
    const { pickupRequest, nextStatus } = statusChangeModal;

    setError("");
    setNotice("");
    setStatusChangingId(pickupRequest.id);
    try {
      const { error: rpcError } = await supabase.rpc("admin_update_pickup_status", {
        p_id: pickupRequest.id,
        p_status: nextStatus,
      });
      if (rpcError) throw rpcError;
      setNotice(
        `${pickupRequest.request_number} 상태를 '${pickupRequestStatusLabel[nextStatus] ?? nextStatus}'(으)로 변경했습니다. (알림톡 미발송)`,
      );
      setStatusChangeModal(null);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "상태 변경에 실패했습니다.");
    } finally {
      setStatusChangingId(null);
    }
  };

  const handleRegisterPickups = (targetIds) => {
    const ids = targetIds.filter((id) => eligiblePickupIds.includes(id));
    if (ids.length === 0) {
      setError("CJ 접수 가능한 수거 요청을 선택해 주세요.");
      setNotice("");
      return;
    }

    setDestructiveModal({
      title: `CJ 수거 접수 — ${ids.length}건`,
      description:
        `선택한 ${ids.length}건을 CJ대한통운에 수거 접수합니다.\n\n` +
        `・접수 즉시 CJ 시스템으로 전송되며, 외부 시스템 취소·반환 절차가 필요합니다.\n` +
        `・잘못 접수하면 셀러에게 알림톡이 발송되어 혼란이 발생할 수 있습니다.`,
      confirmPhrase: "접수",
      reasonRequired: false,
      confirmLabel: `${ids.length}건 접수`,
      run: async () => {
        await performRegisterPickups(ids);
      },
    });
  };

  const performRegisterPickups = async (ids) => {
    setError("");
    setNotice("");
    setRegisteringIds(ids);

    try {
      const payload = await callAdminApi("/api/admin/cj-pickup", {
        method: "POST",
        body: JSON.stringify({ pickupRequestIds: ids }),
      });

      const results = Array.isArray(payload.results) ? payload.results : [];
      const registeredResults = results.filter((result) => result.status === "registered");
      const failedResults = results.filter((result) => !result.success);
      let notificationFailCount = 0;

      for (const result of registeredResults) {
        if (!result.pickupRequest) {
          continue;
        }

        try {
          const notificationResult = await notifyPickupAccepted({
            pickupRequest: result.pickupRequest,
          });

          if (!notificationResult?.success) {
            notificationFailCount += 1;
          }
        } catch {
          notificationFailCount += 1;
        }
      }

      const parts = [];
      if (registeredResults.length > 0) {
        parts.push(`${registeredResults.length}건 접수 완료`);
      }
      if (payload.successCount > registeredResults.length) {
        parts.push(`${payload.successCount - registeredResults.length}건 기존 운송장 유지`);
      }
      if (failedResults.length > 0) {
        parts.push(`${failedResults.length}건 실패`);
      }
      if (notificationFailCount > 0) {
        parts.push(`알림톡 ${notificationFailCount}건 확인 필요`);
      }

      setNotice(parts.join(" · ") || "CJ 수거 접수를 완료했습니다.");

      // CJ 접수 부분 실패 — 전체 실패 건을 모달로 노출.
      // 이전엔 3건까지만 setError로 노출돼 나머지 실패가 사라졌음.
      if (failedResults.length > 0) {
        setCjFailureModal({
          total: payload.successCount + failedResults.length,
          failures: failedResults.map((r) => ({
            id: r.pickupRequestId,
            // NotificationResultModal은 label을 렌더한다 — 미지정 시 요청번호가 안 보였음
            label: r.requestNumber || `#${r.pickupRequestId}`,
            error: r.error || "알 수 없는 오류",
          })),
        });
      }

      // 알림톡 결과는 N건 합계 모달로 (성공/실패 분리)
      if (notificationFailCount > 0) {
        setNotificationResult({
          successCount: Math.max(0, registeredResults.length - notificationFailCount),
          failures: Array.from({ length: notificationFailCount }, (_, i) => ({
            id: `notif-${i}`,
            label: `수거접수 알림 #${i + 1}`,
            error: "알림톡 발송 실패 (수신 거부·번호 오류 등)",
          })),
        });
      }

      setSelectedIds([]);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "CJ 수거 접수에 실패했습니다.");
    } finally {
      setRegisteringIds([]);
    }
  };

  // 일괄 수거 취소 (admin_bulk_cancel_pickup_requests RPC)
  const handleBulkCancelPickups = (targetIds) => {
    if (!Array.isArray(targetIds) || targetIds.length === 0) return;
    if (!isSupabaseConfigured || !supabase) return;

    setDestructiveModal({
      title: `수거 일괄 취소 — ${targetIds.length}건`,
      description:
        `선택한 ${targetIds.length}건의 수거 요청을 일괄 취소합니다.\n\n` +
        `(아직 수거 전 — 접수 대기·수거접수 상태만 취소됩니다.\n` +
        `이미 수거가 시작/완료된 건은 취소되지 않아요.)\n\n` +
        `이미 CJ에 접수된 건(운송장 발급)은 CJ 측 예약이 자동 취소되지 않습니다.\n` +
        `CJ 연동 운영 시에는 CJ 시스템에서 별도 취소가 필요합니다.\n\n` +
        `이 작업은 되돌릴 수 없습니다.`,
      confirmPhrase: "취소",
      reasonRequired: true,
      reasonMinLength: 3,
      reasonPlaceholder: "예) 셀러 변심 / 중복 요청 / 운영 판단",
      confirmLabel: `${targetIds.length}건 취소`,
      run: async (reason) => {
        setError(null);
        setRegisteringIds(targetIds);
        try {
          const { data, error: rpcError } = await supabase.rpc(
            "admin_bulk_cancel_pickup_requests",
            { p_ids: targetIds, p_reason: reason || null },
          );
          if (rpcError) throw rpcError;
          const cancelledCount = data?.cancelled_count ?? 0;
          if (cancelledCount < targetIds.length) {
            setNotice(
              `선택 ${targetIds.length}건 중 ${cancelledCount}건 취소 완료. ` +
                `나머지는 이미 수거가 진행/완료되어 취소되지 않았습니다.`,
            );
          } else {
            setNotice(`수거 요청 ${cancelledCount}건 취소 완료.`);
          }
          await loadPickupRequests();
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "일괄 취소에 실패했습니다.");
        } finally {
          setRegisteringIds([]);
        }
      },
    });
  };

  const handleTrackingLookup = async (pickupRequest) => {
    if (!pickupRequest.tracking_number) {
      setError("조회할 운송장 번호가 없습니다.");
      setNotice("");
      return;
    }

    setError("");
    setNotice("");
    setTrackingLookupId(pickupRequest.id);

    try {
      const query = new URLSearchParams({ pickupRequestId: String(pickupRequest.id) });
      const payload = await callAdminApi(`/api/admin/cj-tracking?${query.toString()}`, {
        method: "GET",
      });
      setTrackingModal(payload);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "배송 추적 조회에 실패했습니다.");
    } finally {
      setTrackingLookupId(null);
    }
  };

  return (
    <AdminShell
      activeModule="pickups"
      description="판매자 수거 요청, CJ 수거 접수, 운송장 추적"
      summaryCards={summaryCards}
      title="수거 관리"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">
          Supabase 환경 변수가 설정되지 않아 수거 요청을 불러올 수 없습니다.
        </p>
      ) : null}

      {error ? <p className="notice-error whitespace-pre-line">{error}</p> : null}
      {notice ? <p className="notice-success">{notice}</p> : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">수거 요청 필터</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              요청번호, 판매자명, 연락처, 운송장으로 검색합니다.
            </p>
          </div>
          <button
            className="btn-secondary !w-auto !px-4 !py-2.5 text-sm"
            disabled={isLoading}
            onClick={() => void loadPickupRequests()}
            type="button"
          >
            새로고침
          </button>
        </div>

        <form className="grid gap-3 xl:grid-cols-[1fr_180px_180px_auto]" onSubmit={handleSearchSubmit}>
          <label className="block">
            <span className="label">검색</span>
            <input
              className="input-base !mt-0 !py-2.5 text-sm"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="예: PU-2604 / 홍길동 / 0101234 / 운송장"
              type="search"
              value={searchInput}
            />
          </label>

          <label className="block">
            <span className="label">요청 시작일</span>
            <input
              className="input-base !mt-0 !py-2.5 text-sm"
              onChange={(event) => setFromDate(event.target.value)}
              type="date"
              value={fromDate}
            />
          </label>

          <label className="block">
            <span className="label">요청 종료일</span>
            <input
              className="input-base !mt-0 !py-2.5 text-sm"
              onChange={(event) => setToDate(event.target.value)}
              type="date"
              value={toDate}
            />
          </label>

          <div className="flex items-end gap-2">
            <button className="btn-primary !w-auto !px-4 !py-2.5 text-sm" type="submit">
              적용
            </button>
            <button
              className="btn-secondary !w-auto !px-4 !py-2.5 text-sm"
              onClick={handleFilterReset}
              type="button"
            >
              초기화
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {PICKUP_STATUS_OPTIONS.map((option) => {
            const isActive = statusFilters.includes(option.value);

            return (
              <button
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                key={option.value}
                onClick={() => handleStatusToggle(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">CJ 수거 접수</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              CJ 접수는 운송장이 없는 요청만, 취소는 수거 시작 전(대기·수거접수) 요청만 대상입니다.
              접수 성공 시 판매자에게 수거 접수 알림톡을 보냅니다.
              CJ 연동 전에는 각 행의 &lsquo;상태변경&rsquo;으로 검수중 등 다음 단계로 직접 전환할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary !w-auto !px-4 !py-2.5 text-sm"
              disabled={selectedEligibleIds.length === 0 || registeringIds.length > 0}
              onClick={() => void handleRegisterPickups(selectedEligibleIds)}
              type="button"
            >
              {registeringIds.length > 0
                ? "CJ 접수 중..."
                : `선택 ${selectedEligibleIds.length}건 CJ 접수`}
            </button>
            <button
              className="!w-auto !px-4 !py-2.5 text-sm rounded-lg border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={selectedCancellableIds.length === 0 || registeringIds.length > 0}
              onClick={() => void handleBulkCancelPickups(selectedCancellableIds)}
              type="button"
            >
              선택 {selectedCancellableIds.length}건 취소
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    checked={allSelectableSelected}
                    disabled={selectablePickupIds.length === 0 || registeringIds.length > 0}
                    onChange={handleToggleAllEligible}
                    type="checkbox"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  요청
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  판매자
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  교재
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  상태
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  운송장
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  CJ 상태
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm font-semibold text-slate-500" colSpan={8}>
                    불러오는 중...
                  </td>
                </tr>
              ) : null}

              {!isLoading && pickupRequests.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm font-semibold text-slate-500" colSpan={8}>
                    수거 요청이 없습니다.
                    <p className="mt-1 text-xs font-normal text-slate-400">
                      권한 문제가 의심되면 시스템 관리자에게 문의해 주세요.
                    </p>
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? pickupRequests.map((pickupRequest) => {
                    const isEligible = canRegisterCjPickup(pickupRequest);
                    const isSelectable = canSelectPickupRow(pickupRequest);
                    const isSelected = selectedIds.includes(pickupRequest.id);
                    const isRegistering = registeringIds.includes(pickupRequest.id);
                    const trackingUrl = buildCjTrackingUrl(pickupRequest.tracking_number);

                    return (
                      <tr className="align-top transition hover:bg-slate-50" key={pickupRequest.id}>
                        <td className="px-4 py-4">
                          <input
                            checked={isSelected}
                            disabled={!isSelectable || isRegistering || registeringIds.length > 0}
                            onChange={() => handleToggleSelection(pickupRequest)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-mono text-xs font-black text-slate-900">
                            {pickupRequest.request_number}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatDate(pickupRequest.created_at)}
                          </p>
                        </td>
                        <td className="min-w-[260px] px-4 py-4">
                          <p className="font-bold text-slate-900">
                            {maskName(pickupRequest.pickup_recipient_name)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {maskPhone(pickupRequest.pickup_recipient_phone)}
                          </p>
                          <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                            {maskAddress(formatAddress(pickupRequest))}
                          </p>
                        </td>
                        <td className="min-w-[220px] px-4 py-4">
                          <p className="font-semibold text-slate-700">
                            {getPickupItemSummary(pickupRequest)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            총 {pickupRequest.item_count ?? 0}권
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={pickupRequest.status} type="pickupRequest" />
                        </td>
                        <td className="min-w-[160px] px-4 py-4">
                          {pickupRequest.tracking_number ? (
                            <div>
                              <p className="font-mono text-xs font-black text-slate-900">
                                {pickupRequest.tracking_number}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {pickupRequest.tracking_carrier || "CJ대한통운"}
                              </p>
                              {trackingUrl ? (
                                <a
                                  className="mt-1 inline-flex text-xs font-bold text-brand hover:underline"
                                  href={trackingUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  CJ 페이지
                                </a>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">미발급</span>
                          )}
                        </td>
                        <td className="min-w-[190px] px-4 py-4">
                          <p className="text-xs font-bold text-slate-700">
                            {pickupRequest.cj_tracking_status || "조회 전"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {pickupRequest.cj_tracking_last_checked_at
                              ? formatDateTime(pickupRequest.cj_tracking_last_checked_at)
                              : "최근 조회 없음"}
                          </p>
                        </td>
                        <td className="min-w-[190px] px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                              onClick={() => setDetailModal(pickupRequest)}
                              type="button"
                            >
                              상세
                            </button>
                            {isEligible ? (
                              <button
                                className="btn-primary !w-auto !px-3 !py-2 text-xs"
                                disabled={isRegistering || registeringIds.length > 0}
                                onClick={() => void handleRegisterPickups([pickupRequest.id])}
                                type="button"
                              >
                                {isRegistering ? "접수 중..." : "CJ 수거 접수"}
                              </button>
                            ) : null}

                            {pickupRequest.tracking_number ? (
                              <button
                                className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                                disabled={trackingLookupId === pickupRequest.id}
                                onClick={() => void handleTrackingLookup(pickupRequest)}
                                type="button"
                              >
                                {trackingLookupId === pickupRequest.id ? "조회 중..." : "추적 조회"}
                              </button>
                            ) : null}

                            {/* 수동 상태 전환 — CJ 미연동 기간에도 검수중 등으로 진행 가능 (취소 상태 제외) */}
                            {pickupRequest.status !== "cancelled" ? (
                              <select
                                aria-label={`${pickupRequest.request_number} 상태변경`}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                disabled={statusChangingId === pickupRequest.id || registeringIds.length > 0}
                                onChange={(event) => {
                                  const nextStatus = event.target.value;
                                  if (nextStatus && nextStatus !== pickupRequest.status) {
                                    setStatusChangeModal({ pickupRequest, nextStatus });
                                  }
                                }}
                                value={pickupRequest.status}
                              >
                                {MANUAL_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.value === pickupRequest.status
                                      ? `${option.label} (현재)`
                                      : option.label}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <nav className="flex items-center justify-center gap-1 pt-2">
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={currentPage === 1 || isLoading}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              이전
            </button>

            {pageItems.map((item, index) =>
              item === "..." ? (
                <span className="px-1 text-sm font-bold text-slate-400" key={`ellipsis-${index}`}>
                  ...
                </span>
              ) : (
                <button
                  className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold ${
                    item === currentPage
                      ? "bg-brand text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  }`}
                  disabled={isLoading}
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}

            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={currentPage === totalPages || isLoading}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              다음
            </button>
          </nav>
        ) : null}
      </section>

      <PickupDetailModal request={detailModal} onClose={() => setDetailModal(null)} />

      {/* 수동 상태 전환 확인 모달 — 입력 없이 확인만 (CJ 미연동 기간 운영용) */}
      <AdminDialog
        busy={statusChangeModal ? statusChangingId === statusChangeModal.pickupRequest.id : false}
        onClose={() => setStatusChangeModal(null)}
        open={Boolean(statusChangeModal)}
        size="md"
        title={statusChangeModal ? `상태변경 — ${statusChangeModal.pickupRequest.request_number}` : ""}
      >
        {statusChangeModal ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700">
              <strong>{maskName(statusChangeModal.pickupRequest.pickup_recipient_name)}</strong>님의 수거
              요청 상태를{" "}
              <strong>
                {pickupRequestStatusLabel[statusChangeModal.pickupRequest.status] ??
                  statusChangeModal.pickupRequest.status}
              </strong>
              {" → "}
              <strong className="text-blue-700">
                {pickupRequestStatusLabel[statusChangeModal.nextStatus] ?? statusChangeModal.nextStatus}
              </strong>
              (으)로 변경합니다.
            </p>
            <ul className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>판매자 마이페이지의 진행 단계 표시가 즉시 바뀝니다.</li>
              <li>알림톡은 발송되지 않습니다 — 필요하면 판매자에게 별도로 안내하세요.</li>
              <li>CJ 접수 없이 진행하는 수동 운영용 기능입니다. (잘못 바꿨다면 같은 방법으로 되돌릴 수 있어요)</li>
            </ul>
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1"
                onClick={() => setStatusChangeModal(null)}
                type="button"
              >
                취소
              </button>
              <button
                className="btn-primary flex-1"
                disabled={statusChangingId === statusChangeModal.pickupRequest.id}
                onClick={() => void performManualStatusChange()}
                type="button"
              >
                {statusChangingId === statusChangeModal.pickupRequest.id
                  ? "변경 중..."
                  : "상태 변경"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      {trackingModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setTrackingModal(null)}
        >
          <section
            className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">배송 추적</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  운송장 {trackingModal.tracking?.waybillNo}
                </p>
              </div>
              <button
                className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                onClick={() => setTrackingModal(null)}
                type="button"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">
                {trackingModal.tracking?.statusText || "상태 미확인"}
              </p>
              {trackingModal.tracking?.statusCode ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  코드 {trackingModal.tracking.statusCode}
                </p>
              ) : null}
            </div>

            {trackingModal.tracking?.events?.length > 0 ? (
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {trackingModal.tracking.events.map((event, index) => (
                  <div
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    key={`${event.occurredAt || "event"}-${index}`}
                  >
                    <p className="font-bold text-slate-900">
                      {event.statusText || event.statusCode || "처리 상태"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {[event.location, formatDateTime(event.occurredAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold text-slate-500">
                CJ 응답에 상세 이력이 없습니다.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {/* CJ 부분 실패 — 전체 실패 건을 모달로 노출 */}
      <NotificationResultModal
        failureHeading="아래 수거 요청의 CJ 접수가 실패했습니다. (CJ 연동 전에는 각 행의 '상태변경'으로 수동 진행하세요)"
        failures={cjFailureModal?.failures ?? []}
        onClose={() => setCjFailureModal(null)}
        onRetry={null}
        open={Boolean(cjFailureModal)}
        successCount={cjFailureModal ? (cjFailureModal.total - cjFailureModal.failures.length) : 0}
        successMessage="선택한 수거 요청이 모두 정상 접수되었습니다."
        title="CJ 수거 접수 결과"
      />

      {/* 알림톡 발송 결과 (수거접수) */}
      <NotificationResultModal
        failures={notificationResult?.failures ?? []}
        onClose={() => setNotificationResult(null)}
        open={Boolean(notificationResult)}
        successCount={notificationResult?.successCount ?? 0}
        title="알림톡 발송 결과 (수거접수)"
      />

      <DestructiveConfirmModal
        busy={registeringIds.length > 0}
        cancelLabel="취소"
        confirmLabel={destructiveModal?.confirmLabel}
        confirmPhrase={destructiveModal?.confirmPhrase}
        description={destructiveModal?.description ?? ""}
        onCancel={() => setDestructiveModal(null)}
        onConfirm={async (reason) => {
          const current = destructiveModal;
          if (!current) return;
          setDestructiveModal(null);
          await current.run(reason);
        }}
        open={!!destructiveModal}
        reasonMinLength={destructiveModal?.reasonMinLength}
        reasonPlaceholder={destructiveModal?.reasonPlaceholder}
        reasonRequired={destructiveModal?.reasonRequired}
        title={destructiveModal?.title ?? ""}
      />
    </AdminShell>
  );
}

export default AdminPickupRequestsPage;
