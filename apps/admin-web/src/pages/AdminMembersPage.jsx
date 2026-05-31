import { useCallback, useEffect, useRef, useState } from "react";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { formatCurrency, formatDate, maskEmail, maskPhone } from "@shared-domain/format";
import { pickupRequestStatusLabel, shipmentStatusLabel } from "@shared-domain/status";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

const PAGE_SIZE = 50;

const ORDER_STATUS_LABEL = {
  pending: "입금대기",
  paid: "결제완료",
  shipping: "배송중",
  delivered: "배송완료",
  confirmed: "구매확정",
  cancelled: "주문취소",
  refunded: "환불",
};

const SETTLEMENT_STATUS_LABEL = {
  pending: "정산 대기",
  approved: "승인 완료",
  completed: "정산 완료",
};

const STATUS_BADGE_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-blue-100 text-blue-800",
  shipping: "bg-indigo-100 text-indigo-800",
  delivered: "bg-emerald-100 text-emerald-800",
  confirmed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-700",
  refunded: "bg-rose-100 text-rose-700",
  pickup_scheduled: "bg-blue-100 text-blue-800",
  picking_up: "bg-blue-100 text-blue-800",
  arrived: "bg-indigo-100 text-indigo-800",
  inspecting: "bg-amber-100 text-amber-800",
  inspected: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  approved: "bg-blue-100 text-blue-800",
  scheduled: "bg-slate-100 text-slate-600",
};

function normalizeMemberResponse(data) {
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary ?? {},
    totalCount: Number(data?.total_count ?? 0),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABEL[status] ?? status ?? "-";
}

function getSettlementStatusLabel(status) {
  return SETTLEMENT_STATUS_LABEL[status] ?? status ?? "-";
}

function getPickupStatusLabel(pickup) {
  if (pickup?.source === "shipment") {
    return shipmentStatusLabel[pickup.status] ?? pickup.status ?? "-";
  }

  return pickupRequestStatusLabel[pickup?.status] ?? pickup?.status ?? "-";
}

function getStatusBadgeClass(status) {
  return STATUS_BADGE_STYLE[status] ?? "bg-slate-100 text-slate-600";
}

function formatCount(value, suffix = "건") {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}${suffix}`;
}

function maskAccount(last4) {
  return last4 ? `****${last4}` : "계좌 미등록";
}

function EmptyBlock({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-400">
      {children}
    </div>
  );
}

function DetailSection({ title, children, right = null }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function AdminMembersPage() {
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberDetail, setMemberDetail] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [destructiveModal, setDestructiveModal] = useState(null);
  const [destructiveBusy, setDestructiveBusy] = useState(false);
  // 회원 차단 시 통지 토글 (디폴트 OFF — 사용자에게는 차단 사실을 알리지 않음)
  const [notifyOnBlock, setNotifyOnBlock] = useState(false);
  const [blockHistory, setBlockHistory] = useState([]); // member_block_history (차단/해제 영구 audit)
  const requestIdRef = useRef(0);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadMembers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setMembers([]);
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

    if (search.trim()) {
      params.p_search = search.trim();
    }

    const { data, error } = await supabase.rpc("list_admin_members", params);

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (error) {
      showToast(error.message || "회원 목록을 불러오지 못했습니다.", "error");
      setMembers([]);
      setSummary({});
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const normalizedData = normalizeMemberResponse(data);

    // 회원 차단 상태 별도 fetch — list_admin_members 본체 변경 없이 합침
    const userIds = normalizedData.rows.map((r) => r.user_id).filter(Boolean);
    let blockMap = new Map();
    if (userIds.length > 0) {
      const { data: blockRows } = await supabase
        .from("member_profiles")
        .select("user_id, is_blocked, blocked_at, block_reason")
        .in("user_id", userIds);
      if (Array.isArray(blockRows)) {
        blockMap = new Map(blockRows.map((b) => [b.user_id, b]));
      }
    }
    const enrichedRows = normalizedData.rows.map((row) => {
      const block = blockMap.get(row.user_id);
      return {
        ...row,
        is_blocked: Boolean(block?.is_blocked),
        blocked_at: block?.blocked_at ?? null,
        block_reason: block?.block_reason ?? null,
      };
    });

    setMembers(enrichedRows);
    setSummary(normalizedData.summary);
    setTotalCount(normalizedData.totalCount);
    setIsLoading(false);
  }, [currentPage, search, showToast]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadMembers();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [loadMembers]);

  const openMemberDetail = async (member) => {
    if (!supabase) {
      return;
    }

    setSelectedMember(member);
    setMemberDetail(null);
    setBlockHistory([]);
    setIsDetailLoading(true);

    const { data, error } = await supabase.rpc("get_admin_member_detail", {
      p_user_id: member.user_id,
    });

    if (error) {
      showToast(error.message || "회원 상세를 불러오지 못했습니다.", "error");
      setIsDetailLoading(false);
      return;
    }

    // list 에서 가져온 차단 정보(member.is_blocked 등)를 detail.member 에 merge
    const enrichedDetail = data
      ? {
          ...data,
          member: {
            ...(data.member ?? {}),
            is_blocked: Boolean(member?.is_blocked),
            blocked_at: member?.blocked_at ?? null,
            block_reason: member?.block_reason ?? null,
          },
        }
      : null;
    setMemberDetail(enrichedDetail);
    setIsDetailLoading(false);

    // 차단/해제 영구 이력 (member_block_history) — 처리자/사유/통지설정/시각
    const { data: historyData } = await supabase.rpc("admin_get_member_block_history", {
      p_user_id: member.user_id,
    });
    setBlockHistory(Array.isArray(historyData) ? historyData : []);
  };

  const closeMemberDetail = () => {
    setSelectedMember(null);
    setMemberDetail(null);
    setBlockHistory([]);
    setIsDetailLoading(false);
  };

  const handleBlockMember = (member) => {
    if (!member?.user_id) return;
    const label = member.display_name || member.email || `user#${member.user_id}`;
    setDestructiveModal({
      title: `회원 차단 — ${label}`,
      description:
        `이 회원의 로그인과 신규 활동을 즉시 차단합니다.\n\n` +
        `· 사유는 회원에게는 표시되지 않으며 내부 기록용입니다.\n` +
        `· 차단 후에는 "차단 해제" 버튼으로 복구할 수 있습니다.\n` +
        `· 회원 통지 발송 여부는 모달 닫기 전 좌측 토글로 설정하세요.\n` +
        `  (현재 설정: 통지 ${notifyOnBlock ? "ON" : "OFF"})`,
      confirmPhrase: "차단",
      reasonRequired: true,
      reasonMinLength: 5,
      reasonPlaceholder: "예) 약관 위반 / 결제 분쟁 / 부정 사용 의심",
      confirmLabel: "차단 실행",
      run: async (reason) => {
        setDestructiveBusy(true);
        // 서버가 member_block_history에 영구 audit(처리자/사유/통지설정/시각)를 기록한다.
        const { error } = await supabase.rpc("admin_block_member", {
          p_user_id: member.user_id,
          p_reason: reason || null,
          p_notify_user: notifyOnBlock,
        });
        setDestructiveBusy(false);
        if (error) {
          showToast(error.message || "회원 차단에 실패했습니다.", "error");
          return;
        }
        showToast("회원을 차단했습니다.", "success");
        await loadMembers();
        if (selectedMember?.user_id === member.user_id) {
          await openMemberDetail({ ...member, is_blocked: true });
        }
      },
    });
  };

  const handleUnblockMember = (member) => {
    if (!member?.user_id) return;
    const displayName = member.display_name || member.email;
    setDestructiveModal({
      title: "회원 차단 해제",
      description:
        `'${displayName}' 회원의 차단을 해제합니다.\n\n` +
        `· 해제 즉시 해당 회원이 다시 로그인·구매·판매 활동을 할 수 있습니다.\n` +
        `· 차단 시 기록한 사유는 그대로 남아 있습니다.`,
      confirmPhrase: null,
      reasonRequired: false,
      confirmLabel: "차단 해제",
      run: async () => {
        const { error } = await supabase.rpc("admin_unblock_member", { p_user_id: member.user_id });
        if (error) {
          showToast(error.message || "차단 해제에 실패했습니다.", "error");
          return;
        }
        showToast("차단을 해제했습니다.", "success");
        await loadMembers();
        if (selectedMember?.user_id === member.user_id) {
          await openMemberDetail({ ...member, is_blocked: false });
        }
      },
    });
  };

  const summaryCards = [
    {
      label: "전체 회원",
      value: formatCount(summary.member_count),
      hint: `검색 결과 ${formatCount(totalCount)}`,
    },
    {
      label: "최근 30일 가입",
      value: formatCount(summary.new_member_count_30d),
    },
    {
      label: "누적 구매액",
      value: formatCurrency(summary.purchase_amount ?? 0),
      hint: formatCount(summary.order_count, "건 주문"),
    },
    {
      label: "누적 판매액",
      value: formatCurrency(summary.sale_amount ?? 0),
      hint: formatCount(summary.pickup_count, "건 수거"),
    },
  ];

  const detailMember = memberDetail?.member ?? selectedMember;
  const shippingAddresses = asArray(memberDetail?.shipping_addresses);
  const settlementAccounts = asArray(memberDetail?.settlement_accounts);
  const pickups = asArray(memberDetail?.pickups);
  const orders = asArray(memberDetail?.orders);
  const settlements = asArray(memberDetail?.settlements);

  return (
    <AdminShell
      activeModule="members"
      description="회원 프로필과 수거, 주문, 정산 이력을 한 화면에서 확인합니다."
      summaryCards={summaryCards}
      title="회원 관리"
    >
      <section className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="text-xs font-bold text-slate-500">회원 검색</span>
            <input
              className="input-base"
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="이름, 이메일, 연락처로 검색"
              type="search"
              value={search}
            />
          </label>
          <button
            className="btn-secondary !w-auto !px-4 !py-3 text-sm"
            onClick={() => {
              setSearch("");
              setCurrentPage(1);
            }}
            type="button"
          >
            초기화
          </button>
        </div>

        <p className="text-sm font-semibold text-slate-500">
          총 {totalCount.toLocaleString("ko-KR")}명 중 {members.length.toLocaleString("ko-KR")}명 표시
        </p>
      </section>

      <section className="card p-0">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-400">회원 목록을 불러오는 중...</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-400">조건에 맞는 회원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">회원</th>
                  <th className="px-4 py-3">이메일</th>
                  <th className="px-4 py-3">연락처</th>
                  <th className="px-4 py-3">가입일</th>
                  <th className="px-4 py-3 text-right">구매액</th>
                  <th className="px-4 py-3 text-right">판매액</th>
                  <th className="px-4 py-3">활동</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    className="cursor-pointer border-b border-slate-50 align-top transition hover:bg-slate-50"
                    key={member.user_id}
                    onClick={() => openMemberDetail(member)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void openMemberDetail(member);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-900">{member.display_name || member.name || "이름 없음"}</p>
                      {member.nickname && member.nickname !== member.name ? (
                        <p className="mt-1 text-xs text-slate-400">{member.name}</p>
                      ) : null}
                    </td>
                    {/* 목록 화면 PII는 항상 마스킹. 풀스트링은 상세 모달에서만 노출. */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700" title="상세 모달에서 원문 확인">
                        {maskEmail(member.email)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {member.email_verified_at ? "이메일 인증" : "이메일 미인증"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600" title="상세 모달에서 원문 확인">
                      {maskPhone(member.phone)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(member.joined_at)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {formatCurrency(member.purchase_amount)}
                      <p className="mt-1 text-xs font-semibold text-slate-400">{formatCount(member.order_count)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {formatCurrency(member.sale_amount)}
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        정산 {formatCurrency(member.net_settlement_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">수거 {formatCount(member.pickup_count)}</p>
                      <p className="mt-1 text-xs text-slate-400">교재 {formatCount(member.pickup_item_count, "권")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openMemberDetail(member);
                        }}
                        type="button"
                      >
                        상세
                      </button>
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

      <AdminDialog
        bodyClassName="p-6"
        busy={destructiveBusy}
        onClose={closeMemberDetail}
        open={Boolean(selectedMember)}
        size="2xl"
      >
        {selectedMember ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Member Detail</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  {detailMember?.display_name || detailMember?.name || "회원 상세"}
                  {detailMember?.is_blocked ? (
                    <span className="ml-2 inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
                      차단됨
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {detailMember?.email || "-"} · {detailMember?.phone || "연락처 없음"}
                </p>
                {detailMember?.is_blocked && detailMember?.block_reason ? (
                  <p className="mt-1 text-xs text-red-600">사유: {detailMember.block_reason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!detailMember?.is_blocked ? (
                  <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                    <input
                      checked={notifyOnBlock}
                      onChange={(event) => setNotifyOnBlock(event.target.checked)}
                      type="checkbox"
                    />
                    회원에게 통지
                  </label>
                ) : null}
                {detailMember?.is_blocked ? (
                  <button
                    className="!w-auto rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => handleUnblockMember(detailMember)}
                    type="button"
                  >
                    차단 해제
                  </button>
                ) : (
                  <button
                    className="!w-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                    onClick={() => handleBlockMember(detailMember)}
                    type="button"
                  >
                    회원 차단
                  </button>
                )}
                <button className="btn-secondary !w-auto !px-4 !py-2 text-sm" onClick={closeMemberDetail} type="button">
                  닫기
                </button>
              </div>
            </div>

            {/* 차단/해제 영구 이력 (member_block_history) — 처리자·사유·시각 audit */}
            {blockHistory.length > 0 ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                <p className="font-bold text-slate-900">차단/해제 이력</p>
                <ul className="mt-2 space-y-2">
                  {blockHistory.map((entry) => (
                    <li className="border-l-2 border-slate-300 pl-3" key={entry.id}>
                      <p className="font-semibold">
                        <span className={entry.action === "block" ? "text-rose-700" : "text-emerald-700"}>
                          {entry.action === "block" ? "차단" : "차단 해제"}
                        </span>
                        {" · "}
                        {formatDate(entry.created_at)}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        처리자: {entry.admin_email || "-"}
                        {entry.action === "block" && entry.notify_user ? " · 통지설정 ON" : ""}
                      </p>
                      {entry.reason ? <p className="mt-0.5">사유: {entry.reason}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : detailMember?.is_blocked ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                <p className="font-bold">차단 정보</p>
                <p className="mt-1">차단 시각: {formatDate(detailMember?.blocked_at) || "(기록 없음)"}</p>
                <p>차단 사유: {detailMember?.block_reason || "(기록 없음)"}</p>
              </div>
            ) : null}

            {isDetailLoading ? (
              <div className="p-10 text-center text-sm font-semibold text-slate-400">회원 상세를 불러오는 중...</div>
            ) : memberDetail ? (
              <div className="space-y-6 pt-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">가입일</p>
                    <p className="mt-1 font-black text-slate-950">{formatDate(detailMember?.joined_at)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">누적 구매</p>
                    <p className="mt-1 font-black text-slate-950">{formatCurrency(detailMember?.purchase_amount)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">누적 판매</p>
                    <p className="mt-1 font-black text-slate-950">{formatCurrency(detailMember?.sale_amount)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">정산 예정/완료</p>
                    <p className="mt-1 font-black text-slate-950">{formatCurrency(detailMember?.net_settlement_amount)}</p>
                  </div>
                </div>

                <DetailSection title="프로필">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4 text-sm">
                      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
                        <dt className="font-bold text-slate-400">이름</dt>
                        <dd className="font-semibold text-slate-900">{detailMember?.name || "-"}</dd>
                        <dt className="font-bold text-slate-400">닉네임</dt>
                        <dd className="font-semibold text-slate-900">{detailMember?.nickname || "-"}</dd>
                        <dt className="font-bold text-slate-400">이메일</dt>
                        <dd className="break-all font-semibold text-slate-900">{detailMember?.email || "-"}</dd>
                        <dt className="font-bold text-slate-400">연락처</dt>
                        <dd className="font-semibold text-slate-900">{detailMember?.phone || "-"}</dd>
                        <dt className="font-bold text-slate-400">마케팅</dt>
                        <dd className="font-semibold text-slate-900">
                          {detailMember?.marketing_opt_in ? "동의" : "미동의"}
                        </dd>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4 text-sm">
                      <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2">
                        <dt className="font-bold text-slate-400">배송지</dt>
                        <dd className="font-semibold text-slate-900">{formatCount(detailMember?.shipping_address_count)}</dd>
                        <dt className="font-bold text-slate-400">정산계좌</dt>
                        <dd className="font-semibold text-slate-900">{formatCount(detailMember?.settlement_account_count)}</dd>
                        <dt className="font-bold text-slate-400">수거 이력</dt>
                        <dd className="font-semibold text-slate-900">{formatCount(detailMember?.pickup_count)}</dd>
                        <dt className="font-bold text-slate-400">주문 이력</dt>
                        <dd className="font-semibold text-slate-900">{formatCount(detailMember?.order_count)}</dd>
                        <dt className="font-bold text-slate-400">마지막 로그인</dt>
                        <dd className="font-semibold text-slate-900">{formatDate(detailMember?.last_sign_in_at)}</dd>
                      </dl>
                    </div>
                  </div>
                </DetailSection>

                <div className="grid gap-5 lg:grid-cols-2">
                  <DetailSection title="배송지">
                    {shippingAddresses.length === 0 ? (
                      <EmptyBlock>등록된 배송지가 없습니다.</EmptyBlock>
                    ) : (
                      <div className="space-y-2">
                        {shippingAddresses.map((address) => (
                          <div className="rounded-xl border border-slate-200 p-4 text-sm" key={address.id}>
                            <p className="font-black text-slate-900">
                              {address.label}
                              {address.is_default ? <span className="ml-2 rounded bg-slate-900 px-2 py-0.5 text-xs text-white">기본</span> : null}
                            </p>
                            <p className="mt-1 font-semibold text-slate-600">
                              {address.recipient_name} · {address.recipient_phone}
                            </p>
                            <p className="mt-1 text-slate-500">
                              [{address.postal_code}] {address.address_line1} {address.address_line2 || ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>

                  <DetailSection title="정산 계좌">
                    {settlementAccounts.length === 0 ? (
                      <EmptyBlock>등록된 정산 계좌가 없습니다.</EmptyBlock>
                    ) : (
                      <div className="space-y-2">
                        {settlementAccounts.map((account) => (
                          <div className="rounded-xl border border-slate-200 p-4 text-sm" key={account.id}>
                            <p className="font-black text-slate-900">
                              {account.bank_name}
                              {account.is_default ? <span className="ml-2 rounded bg-slate-900 px-2 py-0.5 text-xs text-white">기본</span> : null}
                            </p>
                            <p className="mt-1 font-semibold text-slate-600">
                              {account.account_holder} · {maskAccount(account.account_last4)}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {account.is_verified ? "검증 완료" : "검증 전"} · {formatDate(account.created_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>
                </div>

                <DetailSection title="수거 이력" right={<span className="text-xs font-bold text-slate-400">{formatCount(pickups.length)}</span>}>
                  {pickups.length === 0 ? (
                    <EmptyBlock>수거 이력이 없습니다.</EmptyBlock>
                  ) : (
                    <div className="space-y-2">
                      {pickups.map((pickup) => (
                        <div className="rounded-xl border border-slate-200 p-4" key={`${pickup.source}-${pickup.id}`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-black text-slate-500">{pickup.reference_number}</p>
                              <p className="mt-1 font-black text-slate-950">
                                {pickup.source === "shipment" ? "기존 수거" : "수거 요청"} · 교재 {formatCount(pickup.item_count, "권")}
                              </p>
                            </div>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${getStatusBadgeClass(pickup.status)}`}>
                              {getPickupStatusLabel(pickup)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-semibold text-slate-400">
                            생성일 {formatDate(pickup.created_at)}
                            {pickup.tracking_number ? ` · ${pickup.tracking_carrier || "택배"} ${pickup.tracking_number}` : ""}
                          </p>
                          {asArray(pickup.items).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {asArray(pickup.items).slice(0, 4).map((item) => (
                                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600" key={item.id}>
                                  {item.title}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="주문 이력" right={<span className="text-xs font-bold text-slate-400">{formatCount(orders.length)}</span>}>
                  {orders.length === 0 ? (
                    <EmptyBlock>주문 이력이 없습니다.</EmptyBlock>
                  ) : (
                    <div className="space-y-2">
                      {orders.map((order) => (
                        <div className="rounded-xl border border-slate-200 p-4" key={order.id}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-black text-slate-500">{order.order_number}</p>
                              <p className="mt-1 font-black text-slate-950">{formatCurrency(order.total_amount)}</p>
                            </div>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${getStatusBadgeClass(order.status)}`}>
                              {getOrderStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-semibold text-slate-400">
                            주문일 {formatDate(order.created_at)} · 상품 {formatCount(order.item_count)}
                          </p>
                          {asArray(order.items).length > 0 ? (
                            <div className="mt-3 space-y-1">
                              {asArray(order.items).slice(0, 3).map((item) => (
                                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={item.id}>
                                  <span className="min-w-0 truncate font-semibold text-slate-700">
                                    {item.title}
                                    {item.condition_grade ? <span className="text-slate-400"> · {item.condition_grade}</span> : null}
                                  </span>
                                  <span className="shrink-0 font-bold text-slate-900">{formatCurrency(item.total_price)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="정산 이력" right={<span className="text-xs font-bold text-slate-400">{formatCount(settlements.length)}</span>}>
                  {settlements.length === 0 ? (
                    <EmptyBlock>정산 이력이 없습니다.</EmptyBlock>
                  ) : (
                    <div className="space-y-2">
                      {settlements.map((settlement) => (
                        <div className="rounded-xl border border-slate-200 p-4" key={settlement.id}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-black text-slate-500">{settlement.order_number}</p>
                              <p className="mt-1 font-black text-slate-950">
                                {settlement.book_title}
                                {settlement.book_option ? <span className="text-slate-400"> · {settlement.book_option}</span> : null}
                              </p>
                            </div>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${getStatusBadgeClass(settlement.status)}`}>
                              {getSettlementStatusLabel(settlement.status)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                            <p className="rounded-lg bg-slate-50 px-3 py-2">
                              <span className="block text-xs font-bold text-slate-400">판매가</span>
                              <span className="font-black text-slate-900">{formatCurrency(settlement.sale_amount)}</span>
                            </p>
                            <p className="rounded-lg bg-slate-50 px-3 py-2">
                              <span className="block text-xs font-bold text-slate-400">수수료</span>
                              <span className="font-black text-slate-900">{formatCurrency(settlement.fee_amount)}</span>
                            </p>
                            <p className="rounded-lg bg-slate-50 px-3 py-2">
                              <span className="block text-xs font-bold text-slate-400">정산금액</span>
                              <span className="font-black text-slate-900">{formatCurrency(settlement.net_amount)}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>
              </div>
            ) : null}
          </>
        ) : null}
      </AdminDialog>

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
        busy={destructiveBusy}
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

export default AdminMembersPage;
