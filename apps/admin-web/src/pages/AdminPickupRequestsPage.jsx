import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { notifyPickupAccepted } from "../lib/adminNotification";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate } from "@shared-domain/format";
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

function canRegisterCjPickup(pickupRequest) {
  return (
    !pickupRequest.tracking_number &&
    !["cancelled", "completed", "inspecting", "inspected"].includes(pickupRequest.status)
  );
}

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

  const selectedEligibleIds = useMemo(
    () => selectedIds.filter((id) => eligiblePickupIds.includes(id)),
    [eligiblePickupIds, selectedIds],
  );

  const allEligibleSelected =
    eligiblePickupIds.length > 0 &&
    eligiblePickupIds.every((id) => selectedEligibleIds.includes(id));

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
    setSelectedIds((currentIds) => currentIds.filter((id) => eligiblePickupIds.includes(id)));
  }, [eligiblePickupIds]);

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
    if (!canRegisterCjPickup(pickupRequest)) {
      return;
    }

    setSelectedIds((currentIds) =>
      currentIds.includes(pickupRequest.id)
        ? currentIds.filter((id) => id !== pickupRequest.id)
        : [...currentIds, pickupRequest.id],
    );
  };

  const handleToggleAllEligible = () => {
    setSelectedIds(allEligibleSelected ? [] : eligiblePickupIds);
  };

  const handleRegisterPickups = async (targetIds) => {
    const ids = targetIds.filter((id) => eligiblePickupIds.includes(id));
    if (ids.length === 0) {
      setError("CJ 접수 가능한 수거 요청을 선택해 주세요.");
      setNotice("");
      return;
    }

    const confirmed = window.confirm(`선택한 ${ids.length}건을 CJ대한통운에 수거 접수할까요?`);
    if (!confirmed) {
      return;
    }

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
      if (failedResults.length > 0) {
        setError(
          failedResults
            .slice(0, 3)
            .map((result) => `${result.requestNumber || result.pickupRequestId}: ${result.error}`)
            .join("\n"),
        );
      }

      setSelectedIds([]);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "CJ 수거 접수에 실패했습니다.");
    } finally {
      setRegisteringIds([]);
    }
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
              운송장이 없는 요청만 선택할 수 있습니다. 접수 성공 시 판매자에게 수거 접수 알림톡을 보냅니다.
            </p>
          </div>
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
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    checked={allEligibleSelected}
                    disabled={eligiblePickupIds.length === 0 || registeringIds.length > 0}
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
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? pickupRequests.map((pickupRequest) => {
                    const isEligible = canRegisterCjPickup(pickupRequest);
                    const isSelected = selectedEligibleIds.includes(pickupRequest.id);
                    const isRegistering = registeringIds.includes(pickupRequest.id);
                    const trackingUrl = buildCjTrackingUrl(pickupRequest.tracking_number);

                    return (
                      <tr className="align-top transition hover:bg-slate-50" key={pickupRequest.id}>
                        <td className="px-4 py-4">
                          <input
                            checked={isSelected}
                            disabled={!isEligible || isRegistering || registeringIds.length > 0}
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
                            {pickupRequest.pickup_recipient_name}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {pickupRequest.pickup_recipient_phone}
                          </p>
                          <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                            {formatAddress(pickupRequest)}
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
    </AdminShell>
  );
}

export default AdminPickupRequestsPage;
