import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminPageTabs from "../components/AdminPageTabs";
import AdminDialog from "../components/AdminDialog";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import NotificationResultModal from "../components/NotificationResultModal";
import { notifyPickupAccepted } from "../lib/adminNotification";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatDate } from "@shared-domain/format";
import { pickupRequestStatusLabel, shipmentStatusLabel } from "@shared-domain/status";
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

// 가입 후 경과일 — 접수 전 신뢰 신호(신규가입 뱃지)용. member_since 없으면 null.
function getMemberDays(memberSince) {
  if (!memberSince) return null;
  const since = new Date(memberSince).getTime();
  if (Number.isNaN(since)) return null;
  return Math.max(0, Math.floor((Date.now() - since) / 86400000));
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
  const boxWaybills = Array.isArray(request.box_waybills) ? request.box_waybills : [];

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
              {boxWaybills.length > 1 ? (
                boxWaybills.map((waybill) => (
                  <PickupDetailRow
                    key={waybill.box_seq}
                    label={`운송장 (박스 ${waybill.box_seq})`}
                    value={
                      // tracking_status = cj-tracking.js 추적 조회가 박스별로 병합한 최신 CJ 상태
                      [
                        waybill.tracking_number,
                        waybill.tracking_status,
                        waybill.cancelled_at ? "CJ 취소됨" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    }
                    mono
                  />
                ))
              ) : (
                <PickupDetailRow label="운송장" value={request.tracking_number} mono />
              )}
              <PickupDetailRow label="택배사" value={request.tracking_carrier || "CJ대한통운"} />
              <PickupDetailRow label="CJ 상태" value={request.cj_tracking_status} />
            </dl>
          </section>
        ) : null}
      </div>
    </AdminDialog>
  );
}

// 박스별 운송장 접수 현황. 멀티박스 도입(2026-08) 전 접수분은 box_waybills가 비어
// 있으므로 tracking_number 존재 시 1건 접수로 계산한다.
// CJ 취소된 박스(cancelled_at)는 접수분으로 치지 않는다 — 취소 후 재접수 대상.
function getBoxWaybillProgress(pickupRequest) {
  const waybills = Array.isArray(pickupRequest.box_waybills) ? pickupRequest.box_waybills : [];
  const registered =
    waybills.length > 0
      ? waybills.filter((waybill) => !waybill?.cancelled_at).length
      : pickupRequest.tracking_number
        ? 1
        : 0;
  const totalBoxes = Math.max(1, Number(pickupRequest.box_count) || 1);
  return { registered, totalBoxes, missing: Math.max(0, totalBoxes - registered) };
}

function canRegisterCjPickup(pickupRequest) {
  // 미접수 박스가 남아 있으면(부분 접수 포함) 재접수 대상 — 서버가 남은 박스만 접수한다.
  const { missing } = getBoxWaybillProgress(pickupRequest);
  return (
    (!pickupRequest.tracking_number || missing > 0) &&
    !["cancelled", "completed", "inspecting", "inspected"].includes(pickupRequest.status)
  );
}

// 취소 가능 조건 — admin_bulk_cancel_pickup_requests RPC가 실제로 처리하는 범위와 동일.
// (기존에는 선택 자체가 CJ 접수 가능 행으로 제한돼, 운송장이 발급된 pickup_scheduled 건을
//  화면에서 영영 취소할 수 없는 버그가 있었다 — 2026-07-06 수거 사이클 검토에서 수정)
function canCancelPickup(pickupRequest) {
  return ["pending", "pickup_scheduled"].includes(pickupRequest.status);
}

// 취소된 요청에 아직 살아있는(CJ 취소 안 된) CJ 예약 박스 수.
// CnclBook 연동 전에 DB만 취소된 건(조영훈 PU-2607-0002 등)의 CJ 예약 정리 버튼 노출 조건.
// 이 요청 번호로 접수된 박스만 센다 — 다른 요청 번호로 커버된 백필 박스는 그 요청 몫.
function getPendingCjCancelBoxes(pickupRequest) {
  const raw = Array.isArray(pickupRequest.box_waybills) ? pickupRequest.box_waybills : [];
  const entries =
    raw.length > 0
      ? raw
      : pickupRequest.tracking_number
        ? [
            {
              box_seq: 1,
              tracking_number: pickupRequest.tracking_number,
              cust_use_no: pickupRequest.request_number,
            },
          ]
        : [];

  return entries.filter((entry) => {
    if (!entry || entry.cancelled_at) return false;
    if (!String(entry.tracking_number || "").trim()) return false;
    const custUseNo = String(entry.cust_use_no || "").trim() || pickupRequest.request_number;
    return (
      custUseNo === pickupRequest.request_number ||
      custUseNo.startsWith(`${pickupRequest.request_number}-B`)
    );
  }).length;
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

// ─────────────────────────────────────────────────────────────────────────────
// [검수 작업] 탭 — shipments(검수 단위) 목록.
// 예전 사이드바 '검수' 메뉴(대시보드 변형 뷰)를 대체한다. 회원 수거신청은
// '수거 신청' 탭에서 [상품 등록]으로 전환하면 여기에 나타나고, 직접 입고
// 고객(비회원·식스샵)은 상품 등록 위저드에서 새로 만들 수 있다.
// ─────────────────────────────────────────────────────────────────────────────
const INSPECTION_PAGE_SIZE = 30;
const INSPECTION_STATUS_OPTIONS = [
  { value: "scheduled", label: shipmentStatusLabel.scheduled ?? "수거예정" },
  { value: "inspecting", label: shipmentStatusLabel.inspecting ?? "검수중" },
  { value: "inspected", label: shipmentStatusLabel.inspected ?? "검수완료" },
];

function InspectionWorkbenchSection() {
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // 기본 필터 = 아직 작업이 남은 건 (수거예정 + 검수중)
  const [statusFilters, setStatusFilters] = useState(["scheduled", "inspecting"]);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setLoadError("");

    (async () => {
      const { data, error } = await supabase.rpc("list_admin_shipments", {
        p_search: appliedSearch || null,
        p_statuses: statusFilters.length > 0 ? statusFilters : null,
        p_from_date: null,
        p_to_date: null,
        p_limit: INSPECTION_PAGE_SIZE,
        p_offset: (page - 1) * INSPECTION_PAGE_SIZE,
      });
      if (cancelled || seq !== requestSeqRef.current) return;
      if (error) {
        setLoadError(error.message || "검수 건 목록을 불러오지 못했습니다.");
        setRows([]);
        setTotalCount(0);
      } else {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setTotalCount(list[0]?.total_count ?? list.length);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedSearch, statusFilters, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / INSPECTION_PAGE_SIZE));

  const toggleStatus = (value) => {
    setPage(1);
    setStatusFilters((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  return (
    <>
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">검수 건 검색</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              셀러명 또는 연락처로 검색합니다. 회원 수거신청은 [수거 신청] 탭에서 '상품 등록'을
              누르면 검수 건으로 전환돼 여기에 나타나요.
            </p>
          </div>
        </div>

        <form
          className="grid gap-3 xl:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedSearch(searchInput.trim());
          }}
        >
          <label className="block">
            <span className="label">검색</span>
            <input
              className="input-base"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="셀러명, 연락처"
              type="search"
              value={searchInput}
            />
          </label>
          <div className="flex items-end">
            <button className="btn-primary !w-auto !px-5" type="submit">
              검색
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">상태</span>
          {INSPECTION_STATUS_OPTIONS.map((option) => {
            const isActive = statusFilters.includes(option.value);
            return (
              <button
                aria-pressed={isActive}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                }`}
                key={option.value}
                onClick={() => toggleStatus(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        {loadError ? <p className="notice-error">{loadError}</p> : null}
        {isLoading ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-400">불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-400">
            조건에 맞는 검수 건이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">#</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">셀러</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">수거일</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500">상태</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500">책</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((shipment) => (
                  <tr className="hover:bg-slate-50" key={shipment.id}>
                    <td className="px-4 py-3 font-bold text-slate-500">{shipment.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {shipment.seller_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{shipment.seller_phone}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(shipment.pickup_date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={shipment.status} type="shipment" />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                      {shipment.book_count ?? 0}권
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        className="btn-primary !inline-flex !w-auto !px-3 !py-2 text-xs"
                        to={`/admin/shipments/${shipment.id}`}
                      >
                        검수 열기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              이전
            </button>
            <span className="text-xs font-bold text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              className="btn-secondary !w-auto !px-3 !py-2 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              다음
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function AdminPickupRequestsPage() {
  const requestIdRef = useRef(0);

  // R1 IA 개편: [수거 신청] / [검수 작업] 탭 — URL ?tab= 으로 상태 유지 (북마크·새로고침 안전)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "inspection" ? "inspection" : "requests";
  const handleSelectTab = (tabKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tabKey === "inspection") {
      nextParams.set("tab", "inspection");
    } else {
      nextParams.delete("tab");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const [pickupRequests, setPickupRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // 회원 상세의 '수거·검수 보기' 크로스 링크가 검색을 걸어 진입할 수 있게 (?q=)
  const initialSearchParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(initialSearchParam);
  const [appliedSearch, setAppliedSearch] = useState(initialSearchParam);
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
  // 수거요청 → 검수(shipment) 전환 진행 중인 요청 id
  const [startingInspectionId, setStartingInspectionId] = useState(null);
  const navigate = useNavigate();

  // 수거요청에서 연결된 검수(shipment)를 멱등 생성하고 상품 등록 위저드로 이동.
  // 이 경로로 만들어야 shipments에 user_id·pickup_request_id가 채워져
  // 셀러 마이페이지에 교재별 검수 결과(등급·확정가·폐기사유)가 노출된다.
  const handleStartInspection = async (pickupRequest) => {
    if (!isSupabaseConfigured || startingInspectionId !== null) {
      return;
    }
    setError("");
    setStartingInspectionId(pickupRequest.id);
    const { data, error: rpcError } = await supabase.rpc("admin_start_inspection_from_pickup", {
      p_pickup_request_id: pickupRequest.id,
    });
    setStartingInspectionId(null);
    if (rpcError || !data?.shipment_id) {
      setError(rpcError?.message || "검수 전환에 실패했습니다. 최신 migration 적용 여부를 확인해 주세요.");
      return;
    }
    navigate(`/admin/register?shipmentId=${data.shipment_id}`);
  };
  // 알림톡/RPC 부분 실패를 전체 노출 — 이전엔 setError에 3건만 보여 4건 이후가 사라지는 P0 사고
  const [cjFailureModal, setCjFailureModal] = useState(null);
  const [notificationResult, setNotificationResult] = useState(null);
  // 수거 취소(CJ CnclBook) 실패 모달 — { successCount, failures, dbFallbackIds, reason }
  // dbFallbackIds가 있으면 "DB만 취소" 폴백 버튼 노출 (CJ측 예약 부재가 확인된 경우 전용)
  const [cancelFailureModal, setCancelFailureModal] = useState(null);

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

  // 수거 취소 실행 — 서버리스(action=cancel)가 CJ 접수분의 CnclBook까지 함께 처리한다.
  // CJ가 취소를 거부한 건은 DB도 그대로 두고 실패 모달로 사유를 노출한다.
  const performCancelPickups = async (targetIds, reason, { cleanup = false } = {}) => {
    setError("");
    setNotice("");
    setRegisteringIds(targetIds);

    try {
      const payload = await callAdminApi("/api/admin/cj-pickup", {
        method: "POST",
        body: JSON.stringify({
          action: "cancel",
          pickupRequestIds: targetIds,
          reason: reason || null,
        }),
      });

      const results = Array.isArray(payload.results) ? payload.results : [];
      const failedResults = results.filter((result) => !result.success);
      // 다른 요청 번호로 접수돼 여기서 취소 못 한 박스 안내(부분수거 복구 백필 케이스)
      const warningNotes = results
        .filter((result) => Array.isArray(result.skippedNotes) && result.skippedNotes.length > 0)
        .flatMap((result) =>
          result.skippedNotes.map((note) => `${result.requestNumber || result.pickupRequestId}: ${note}`),
        );

      const parts = [];
      if (payload.cancelledCount > 0) parts.push(`수거 요청 ${payload.cancelledCount}건 취소 완료`);
      if (payload.cleanedCount > 0) parts.push(`취소 요청의 CJ 예약 정리 ${payload.cleanedCount}건`);
      if (payload.cancelledBoxCount > 0) parts.push(`CJ 예약 ${payload.cancelledBoxCount}박스 취소`);
      if (failedResults.length > 0) parts.push(`${failedResults.length}건 실패`);

      const noticeLines = [parts.join(" · ") || "취소할 대상이 없습니다."];
      if (warningNotes.length > 0) {
        noticeLines.push(...warningNotes.map((note) => `⚠ ${note}`));
      }
      setNotice(noticeLines.join("\n"));

      if (failedResults.length > 0) {
        setCancelFailureModal({
          successCount: results.length - failedResults.length,
          failures: failedResults.map((result) => ({
            id: result.pickupRequestId,
            label: result.requestNumber || `#${result.pickupRequestId}`,
            error: result.error || "알 수 없는 오류",
          })),
          // 이미 취소된 요청의 CJ 정리(cleanup) 실패에는 DB 폴백이 무의미 — 활성 요청만 대상.
          dbFallbackIds: cleanup
            ? []
            : failedResults
                .filter(
                  (result) =>
                    result.requestStatus && ["pending", "pickup_scheduled"].includes(result.requestStatus),
                )
                .map((result) => result.pickupRequestId),
          reason: reason || null,
        });
      }

      setSelectedIds([]);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "수거 취소에 실패했습니다.");
    } finally {
      setRegisteringIds([]);
    }
  };

  // CJ 취소 실패 모달의 폴백 — CJ측 예약이 이미 없는 것으로 확인된 경우에만 DB 상태만 취소.
  // (기존 admin_bulk_cancel_pickup_requests RPC 그대로 — CJ 연동 이전의 원래 동작)
  const performDbOnlyCancel = async () => {
    const modal = cancelFailureModal;
    if (!modal || !Array.isArray(modal.dbFallbackIds) || modal.dbFallbackIds.length === 0) return;
    if (!isSupabaseConfigured || !supabase) return;

    setError("");
    setRegisteringIds(modal.dbFallbackIds);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_bulk_cancel_pickup_requests", {
        p_ids: modal.dbFallbackIds,
        p_reason: modal.reason || null,
      });
      if (rpcError) throw rpcError;
      setNotice(
        `DB 상태만 취소 ${data?.cancelled_count ?? 0}건 완료 — CJ측 예약은 취소되지 않았을 수 있으니 CJ에서 확인하세요.`,
      );
      setCancelFailureModal(null);
      await loadPickupRequests();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "DB 취소에 실패했습니다.");
    } finally {
      setRegisteringIds([]);
    }
  };

  // 일괄 수거 취소 — CJ 접수분은 CnclBook 취소까지 함께 (2026-08-08 개편)
  const handleBulkCancelPickups = (targetIds) => {
    if (!Array.isArray(targetIds) || targetIds.length === 0) return;
    if (!isSupabaseConfigured || !supabase) return;

    setDestructiveModal({
      title: `수거 일괄 취소 — ${targetIds.length}건`,
      description:
        `선택한 ${targetIds.length}건의 수거 요청을 일괄 취소합니다.\n\n` +
        `・CJ에 접수된 건(운송장 발급)은 CJ측 수거 예약도 함께 취소합니다.\n` +
        `・기사님이 이미 스캔했거나 운송장이 출력된 박스는 CJ가 취소를 거부합니다 —\n` +
        `  해당 건은 취소되지 않고 거부 사유가 표시됩니다.\n` +
        `・아직 수거 전(접수 대기·수거접수) 상태만 취소됩니다.\n\n` +
        `이 작업은 되돌릴 수 없습니다.`,
      confirmPhrase: "취소",
      reasonRequired: true,
      reasonMinLength: 3,
      reasonPlaceholder: "예) 셀러 변심 / 중복 요청 / 운영 판단",
      confirmLabel: `${targetIds.length}건 취소`,
      run: async (reason) => {
        await performCancelPickups(targetIds, reason);
      },
    });
  };

  // 취소된 요청에 남은 CJ 예약 정리 — CnclBook 연동 전 DB만 취소된 건의 자기수리 경로.
  const handleCancelledRowCjCleanup = (pickupRequest) => {
    const pendingBoxes = getPendingCjCancelBoxes(pickupRequest);
    if (pendingBoxes === 0) return;

    setDestructiveModal({
      title: `CJ 예약 취소 — ${pickupRequest.request_number}`,
      description:
        `이미 취소된 수거 요청이지만 CJ측 수거 예약 ${pendingBoxes}박스가 남아 있습니다.\n` +
        `CJ CnclBook으로 해당 예약을 취소합니다.\n\n` +
        `기사님이 이미 스캔했거나 운송장이 출력된 박스는 CJ가 취소를 거부하며,\n` +
        `거부 사유가 표시됩니다.`,
      confirmPhrase: "취소",
      reasonRequired: false,
      confirmLabel: `CJ 예약 ${pendingBoxes}박스 취소`,
      run: async () => {
        await performCancelPickups([pickupRequest.id], null, { cleanup: true });
      },
    });
  };

  const handleTrackingLookup = async (pickupRequest) => {
    // 멀티박스: 대표 운송장(box1)이 아직 없어도 box_waybills에 접수분이 있으면 조회 가능
    if (getBoxWaybillProgress(pickupRequest).registered === 0) {
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
      description="수거 신청 접수부터 검수·등록까지 — 셀러 물건이 판매로 가는 전 과정"
      summaryCards={activeTab === "requests" ? summaryCards : []}
      title="수거·검수"
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">
          Supabase 환경 변수가 설정되지 않아 수거 요청을 불러올 수 없습니다.
        </p>
      ) : null}

      {error ? <p className="notice-error whitespace-pre-line">{error}</p> : null}
      {notice ? <p className="notice-success whitespace-pre-line">{notice}</p> : null}

      <AdminPageTabs
        activeKey={activeTab}
        onSelect={handleSelectTab}
        tabs={[
          { key: "requests", label: "수거 신청", hint: "회원 신청 접수·CJ" },
          { key: "inspection", label: "검수 작업", hint: "입고된 책 등록·검수" },
        ]}
      />

      {activeTab === "inspection" ? <InspectionWorkbenchSection /> : null}

      {activeTab === "requests" ? (
      <>
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
                    const boxProgress = getBoxWaybillProgress(pickupRequest);

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
                            {pickupRequest.pickup_recipient_name}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {pickupRequest.pickup_recipient_phone}
                          </p>
                          <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                            {formatAddress(pickupRequest)}
                          </p>
                          {/* 접수 전 신뢰 신호 — 허위/시험 신청 선별용 (대기 상태에서만) */}
                          {pickupRequest.status === "pending" ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {pickupRequest.phone_verified ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                  번호 인증됨
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                  번호 미인증
                                </span>
                              )}
                              {(pickupRequest.prior_pickup_count ?? 0) > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                  수거 {pickupRequest.prior_pickup_count}회
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                  첫 수거
                                </span>
                              )}
                              {getMemberDays(pickupRequest.member_since) !== null &&
                              getMemberDays(pickupRequest.member_since) <= 7 ? (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                  가입 {getMemberDays(pickupRequest.member_since) === 0 ? "오늘" : `${getMemberDays(pickupRequest.member_since)}일차`}
                                </span>
                              ) : null}
                              {(pickupRequest.duplicate_pending_count ?? 0) > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                  중복 대기 {pickupRequest.duplicate_pending_count}건
                                </span>
                              ) : null}
                            </div>
                          ) : null}
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
                              {boxProgress.totalBoxes > 1 ? (
                                <p
                                  className={`mt-1 text-xs font-bold ${
                                    boxProgress.missing > 0 ? "text-amber-700" : "text-slate-500"
                                  }`}
                                >
                                  송장 {boxProgress.registered}/{boxProgress.totalBoxes}박스
                                  {/* 취소된 요청은 미접수가 당연하므로 재접수 유도 문구를 숨긴다 */}
                                  {boxProgress.missing > 0 && pickupRequest.status !== "cancelled"
                                    ? " · 미접수 있음"
                                    : ""}
                                </p>
                              ) : null}
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

                            {boxProgress.registered > 0 ? (
                              <button
                                className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                                disabled={trackingLookupId === pickupRequest.id}
                                onClick={() => void handleTrackingLookup(pickupRequest)}
                                type="button"
                              >
                                {trackingLookupId === pickupRequest.id ? "조회 중..." : "추적 조회"}
                              </button>
                            ) : null}

                            {/* 입고 이후 단계에서만 — 이 수거요청의 책을 등록 위저드로 (신청↔검수 브리지) */}
                            {["arrived", "inspecting", "inspected"].includes(pickupRequest.status) ? (
                              <button
                                className="!w-auto rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                                disabled={startingInspectionId !== null}
                                onClick={() => void handleStartInspection(pickupRequest)}
                                type="button"
                              >
                                {startingInspectionId === pickupRequest.id ? "전환 중..." : "상품 등록"}
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

                            {/* 취소됐지만 CJ 예약이 남은 건 — CnclBook 연동 전 DB만 취소된 잔존분 정리 */}
                            {pickupRequest.status === "cancelled" &&
                            getPendingCjCancelBoxes(pickupRequest) > 0 ? (
                              <button
                                className="!w-auto rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                                disabled={registeringIds.length > 0}
                                onClick={() => handleCancelledRowCjCleanup(pickupRequest)}
                                type="button"
                              >
                                {isRegistering ? "취소 중..." : "CJ 예약 취소"}
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
      </>
      ) : null}

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
              <strong>{statusChangeModal.pickupRequest.pickup_recipient_name}</strong>님의 수거
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
                  {trackingModal.tracking?.boxes?.length > 1
                    ? ` 외 ${trackingModal.tracking.boxes.length - 1}건 (박스별)`
                    : ""}
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

            {trackingModal.tracking?.boxes?.length > 1 ? (
              // 멀티박스: 박스별 섹션으로 상태·이력 표시 (2026-08-08 박스별 채번 개편)
              <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
                {trackingModal.tracking.boxes.map((box) => (
                  <section className="rounded-xl border border-slate-200" key={box.boxSeq}>
                    <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                      <p className="text-sm font-black text-slate-900">
                        박스 {box.boxSeq}
                        <span className="ml-2 text-xs font-bold text-slate-600">
                          {box.failed ? "조회 실패" : box.statusText || "상태 미확인"}
                        </span>
                        {box.statusCode ? (
                          <span className="ml-2 text-xs font-semibold text-slate-400">
                            코드 {box.statusCode}
                          </span>
                        ) : null}
                      </p>
                      <p className="font-mono text-xs font-semibold text-slate-500">
                        {box.waybillNo}
                      </p>
                    </header>
                    <div className="px-4 py-3">
                      {box.events?.length > 0 ? (
                        <div className="space-y-2">
                          {box.events.map((event, index) => (
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
                        <p className="text-xs font-semibold text-slate-400">
                          상세 이력이 없습니다.
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            ) : trackingModal.tracking?.events?.length > 0 ? (
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

      {/* 수거 취소(CJ CnclBook) 실패 — 거부 사유 원문 + (활성 요청 한정) DB만 취소 폴백 */}
      <NotificationResultModal
        busy={registeringIds.length > 0}
        failureHeading={
          cancelFailureModal?.dbFallbackIds?.length > 0
            ? "아래 건은 CJ 예약 취소가 거부되어 수거 요청이 취소되지 않았습니다. 기사 스캔·운송장 출력 후에는 CJ 취소가 불가하며 이미 수거가 진행 중일 수 있습니다. CJ측 예약이 이미 없는 것으로 확인된 경우에만 'DB만 취소'를 사용하세요."
            : "아래 건의 CJ 예약 취소가 실패했습니다. 거부 사유를 확인해 주세요."
        }
        failures={cancelFailureModal?.failures ?? []}
        onClose={() => setCancelFailureModal(null)}
        onRetry={
          cancelFailureModal?.dbFallbackIds?.length > 0 ? () => void performDbOnlyCancel() : null
        }
        open={Boolean(cancelFailureModal)}
        retryLabel="CJ 취소 없이 DB만 취소"
        successCount={cancelFailureModal?.successCount ?? 0}
        successMessage="선택한 수거 요청이 모두 취소되었습니다."
        title="수거 취소 결과"
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
