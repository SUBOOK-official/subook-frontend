import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import StatusBadge from "@shared-domain/StatusBadge";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";
import { CloseIcon } from "../components/icons";
import { BusyText, InlineLoading } from "../components/Loading";
import { BRAND_OPTIONS } from "../lib/productCategories";

const ISSUANCE_TYPE_LABEL = {
  admin_assigned: "어드민 발급",
  code: "코드 입력",
  download: "다운로드",
};

// 기한 설정 유형 (구 식스샵 패리티):
//  unlimited = 시작일로부터 무기한 / range = 시작일과 종료일 / relative = 지급일 기준 N일
const initialForm = {
  id: null,
  title: "",
  description: "",
  discount_type: "fixed",
  discount_value: "",
  max_discount_amount: "",
  min_order_amount: "0",
  validity_mode: "unlimited",
  valid_from: "",
  valid_until: "",
  valid_days: "",
  usage_limit_per_user: "",
  total_quantity: "",
  budget_cap_amount: "",
  issuance_type: "admin_assigned",
  code: "",
  issue_on_signup: false,
  is_active: true,
  scope_brand: "",
};

// 폼 → API payload (빈 문자열은 null로 전달)
// 기한 필드 3종(valid_from/valid_until/valid_days)은 유형 전환 시 이전 값이 남지 않도록
// 항상 키를 포함해 보낸다 (update RPC는 키가 있어야 null로 지운다).
function buildPayload(form) {
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    discount_type: form.discount_type,
    discount_value:
      form.discount_type === "free_shipping" ? 0 : Number(form.discount_value || 0),
    max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
    min_order_amount: Number(form.min_order_amount || 0),
    valid_from: form.valid_from || null,
    valid_until: form.validity_mode === "range" ? form.valid_until || null : null,
    valid_days:
      form.validity_mode === "relative" && form.valid_days ? Number(form.valid_days) : null,
    usage_limit_per_user: form.usage_limit_per_user
      ? Number(form.usage_limit_per_user)
      : null,
    total_quantity: form.total_quantity ? Number(form.total_quantity) : null,
    budget_cap_amount: form.budget_cap_amount ? Number(form.budget_cap_amount) : null,
    issuance_type: form.issuance_type,
    code: form.issuance_type === "code" ? form.code.trim() || null : null,
    issue_on_signup: Boolean(form.issue_on_signup),
    is_active: Boolean(form.is_active),
    // 항상 키를 포함 — update RPC는 키가 있어야 null로 지운다 (스코프 해제)
    scope_brand: form.scope_brand || null,
  };
  return payload;
}

function rowToForm(row) {
  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    discount_type: row.discount_type || "fixed",
    discount_value: row.discount_value != null ? String(row.discount_value) : "",
    max_discount_amount: row.max_discount_amount != null ? String(row.max_discount_amount) : "",
    min_order_amount: row.min_order_amount != null ? String(row.min_order_amount) : "0",
    validity_mode: row.valid_days != null ? "relative" : row.valid_until ? "range" : "unlimited",
    valid_from: row.valid_from ? row.valid_from.slice(0, 16) : "",
    valid_until: row.valid_until ? row.valid_until.slice(0, 16) : "",
    valid_days: row.valid_days != null ? String(row.valid_days) : "",
    usage_limit_per_user: row.usage_limit_per_user != null ? String(row.usage_limit_per_user) : "",
    total_quantity: row.total_quantity != null ? String(row.total_quantity) : "",
    budget_cap_amount: row.budget_cap_amount != null ? String(row.budget_cap_amount) : "",
    issuance_type: row.issuance_type || "admin_assigned",
    code: row.code || "",
    issue_on_signup: Boolean(row.issue_on_signup),
    is_active: Boolean(row.is_active),
    scope_brand: row.scope_brand || "",
  };
}

function describeDiscount(coupon) {
  if (coupon.discount_type === "free_shipping") return "무료배송";
  if (coupon.discount_type === "percentage") {
    const cap = coupon.max_discount_amount
      ? ` (최대 ${formatCurrency(coupon.max_discount_amount)})`
      : "";
    return `${coupon.discount_value}%${cap}`;
  }
  return formatCurrency(coupon.discount_value);
}

function describeValidity(coupon) {
  if (coupon.valid_days != null) {
    const prefix = coupon.valid_from
      ? `${coupon.valid_from.replace("T", " ").slice(0, 16)}부터 · `
      : "";
    return `${prefix}지급일부터 ${coupon.valid_days}일`;
  }
  if (!coupon.valid_from && !coupon.valid_until) return "무기한";
  const fmt = (v) => (v ? v.replace("T", " ").slice(0, 16) : "");
  const from = fmt(coupon.valid_from) || "즉시";
  const until = fmt(coupon.valid_until) || "무기한";
  return `${from} ~ ${until}`;
}

function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [destructiveModal, setDestructiveModal] = useState(null);
  const COUPONS_PAGE_SIZE = 50;
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // 발급 모달 상태
  const [issueTarget, setIssueTarget] = useState(null);
  const [issueSearch, setIssueSearch] = useState("");
  const [issueMembers, setIssueMembers] = useState([]);
  const [isIssueLoading, setIsIssueLoading] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  // 발급 이력 모달 상태
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyStats, setHistoryStats] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const requestIdRef = useRef(0);
  const issueRequestIdRef = useRef(0);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadCoupons = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = {
      p_only_active: onlyActive,
      p_limit: COUPONS_PAGE_SIZE,
      p_offset: (currentPage - 1) * COUPONS_PAGE_SIZE,
    };
    if (search.trim()) params.p_search = search.trim();

    const { data, error } = await supabase.rpc("admin_list_coupons", params);
    if (currentRequestId !== requestIdRef.current) return;

    if (error) {
      showToast(error.message || "쿠폰 목록을 불러오지 못했습니다.", "error");
      setCoupons([]);
      setTotalCount(0);
    } else if (Array.isArray(data)) {
      setCoupons(data);
      // 페이지가 가득 차면 정확한 총량을 알 수 없음 — 0이면 다음 페이지로 못 가므로
      // "최소 한 페이지 더 있음"으로 표현한다.
      setTotalCount(
        data.length < COUPONS_PAGE_SIZE
          ? (currentPage - 1) * COUPONS_PAGE_SIZE + data.length
          : currentPage * COUPONS_PAGE_SIZE + 1,
      );
    } else if (data && typeof data === "object") {
      setCoupons(Array.isArray(data.items) ? data.items : []);
      setTotalCount(Number(data.total_count) || 0);
    } else {
      setCoupons([]);
      setTotalCount(0);
    }
    setIsLoading(false);
  }, [search, onlyActive, showToast, currentPage]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadCoupons();
    }, 200);
    return () => window.clearTimeout(timerId);
  }, [loadCoupons]);

  const openCreate = () => {
    setForm(initialForm);
    setIsFormOpen(true);
  };

  const openEdit = (coupon) => {
    setForm(rowToForm(coupon));
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setForm(initialForm);
  };

  const handleField = (key) => (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast("쿠폰 이름을 입력하세요.", "error");
      return;
    }
    if (form.issuance_type === "code" && !form.code.trim()) {
      showToast("코드 입력형 쿠폰은 코드를 입력해야 합니다.", "error");
      return;
    }
    if (form.discount_type === "percentage") {
      const v = Number(form.discount_value);
      if (!(v >= 1 && v <= 100)) {
        showToast("정률 할인은 1–100 사이의 값이어야 합니다.", "error");
        return;
      }
      // 정률 + max_discount_amount 빈칸은 회사 손실 폭주 위험 — 저장 차단
      if (!form.max_discount_amount || Number(form.max_discount_amount) <= 0) {
        showToast("정률 쿠폰은 '할인 상한'이 반드시 필요합니다. (객단가에 비례한 손실 무제한 방지)", "error");
        return;
      }
    }

    setIsSaving(true);
    const payload = buildPayload(form);
    const isUpdate = Boolean(form.id);
    const { error } = await supabase.rpc(
      isUpdate ? "admin_update_coupon" : "admin_create_coupon",
      isUpdate ? { p_coupon_id: form.id, p_payload: payload } : { p_payload: payload },
    );
    setIsSaving(false);

    if (error) {
      showToast(error.message || "저장에 실패했습니다.", "error");
      return;
    }

    showToast(isUpdate ? "쿠폰이 수정되었습니다." : "쿠폰이 생성되었습니다.", "success");
    closeForm();
    await loadCoupons();
  };

  // ── 발급 모달 ─────────────────────────────────────────────
  const openIssue = (coupon) => {
    setIssueTarget(coupon);
    setIssueSearch("");
    setIssueMembers([]);
  };
  const closeIssue = () => {
    setIssueTarget(null);
    setIssueSearch("");
    setIssueMembers([]);
  };

  const loadIssueMembers = useCallback(async (term) => {
    const currentRequestId = ++issueRequestIdRef.current;
    setIsIssueLoading(true);
    const params = { p_limit: 30 };
    if (term && term.trim()) params.p_search = term.trim();
    const { data, error } = await supabase.rpc("list_admin_members", params);
    if (currentRequestId !== issueRequestIdRef.current) return;
    if (error) {
      showToast(error.message || "회원 목록을 불러오지 못했습니다.", "error");
      setIssueMembers([]);
    } else {
      setIssueMembers(Array.isArray(data?.rows) ? data.rows : []);
    }
    setIsIssueLoading(false);
  }, [showToast]);

  useEffect(() => {
    if (!issueTarget) return;
    const timerId = window.setTimeout(() => {
      void loadIssueMembers(issueSearch);
    }, 250);
    return () => window.clearTimeout(timerId);
  }, [issueTarget, issueSearch, loadIssueMembers]);

  const handleIssueToUser = async (member) => {
    if (!issueTarget) return;
    setIsIssuing(true);
    const { error } = await supabase.rpc("admin_issue_coupon_to_user", {
      p_coupon_id: issueTarget.id,
      p_user_id: member.user_id,
    });
    setIsIssuing(false);
    if (error) {
      showToast(error.message || "발급에 실패했습니다.", "error");
      return;
    }
    showToast(`${member.display_name || member.email}님에게 발급되었습니다.`, "success");
    await loadCoupons();
  };

  const handleIssueToAll = async () => {
    if (!issueTarget) return;

    // 사전 잠재 손실 시뮬레이션 — 회원 수 × 1인당 최대 할인을 미리 보여줘
    // "혹시" 클릭으로 회사가 망하는 케이스 방지.
    const { data: estimate, error: estError } = await supabase.rpc(
      "admin_estimate_coupon_max_loss",
      { p_coupon_id: issueTarget.id },
    );

    const phrase = issueTarget.code || issueTarget.title || `coupon-${issueTarget.id}`;

    const lossLine = estimate && !estError
      ? `· 대상 회원 ${estimate.eligible_member_count?.toLocaleString("ko-KR") ?? "?"}명 × 1인당 최대 ${(estimate.per_user_max_amount ?? 0).toLocaleString("ko-KR")}원\n` +
        `· 잠재 최대 손실: 약 ${(estimate.total_max_loss ?? 0).toLocaleString("ko-KR")}원${estimate.budget_cap_amount ? ` (cap ${estimate.budget_cap_amount.toLocaleString("ko-KR")}원)` : " (cap 없음)"}\n` +
        (estimate.percentage_no_max_discount_warning ? `정률 쿠폰이지만 할인 상한이 비어 있습니다. 폼에서 상한을 먼저 설정하세요.\n` : "")
      : `· 잠재 손실 시뮬레이션 RPC 호출 실패 (배포 점검 필요)\n`;

    setDestructiveModal({
      title: `전체 회원에 쿠폰 발급 — ${issueTarget.title}`,
      description:
        `전체 활성 회원에게 "${issueTarget.title}" 쿠폰을 일괄 발급합니다.\n\n` +
        `[발급 영향 예측]\n` + lossLine + `\n` +
        `[주의]\n` +
        `· 발급된 쿠폰은 시스템에서 일괄 회수할 수 없습니다.\n` +
        `· 회원당 1매 발급되며, 이미 보유한 회원은 자동 skip됩니다.\n` +
        `· 회원 수에 따라 수십 초가 걸릴 수 있습니다.`,
      confirmPhrase: phrase,
      reasonRequired: true,
      reasonMinLength: 5,
      reasonPlaceholder: "발급 사유 (예: 신년 프로모션, 출석 이벤트 보상)",
      confirmLabel: "전체 발급",
      run: async () => {
        setIsIssuing(true);
        const { data, error } = await supabase.rpc("admin_issue_coupon_to_all", {
          p_coupon_id: issueTarget.id,
        });
        setIsIssuing(false);
        if (error) {
          showToast(error.message || "전체 발급에 실패했습니다.", "error");
          return;
        }
        const count = data?.inserted_count ?? 0;
        showToast(`${count}명에게 발급되었습니다.`, "success");
        await loadCoupons();
        closeIssue();
      },
    });
  };

  // ── 발급 이력 모달 ─────────────────────────────────────────
  const openHistory = async (coupon) => {
    setHistoryTarget(coupon);
    setHistoryStats(null);
    setHistoryRows([]);
    setIsHistoryLoading(true);
    const [statsRes, listRes] = await Promise.all([
      supabase.rpc("admin_get_coupon_stats", { p_coupon_id: coupon.id }),
      supabase.rpc("admin_list_member_coupons", { p_coupon_id: coupon.id, p_limit: 200 }),
    ]);
    if (!statsRes.error) setHistoryStats(statsRes.data);
    if (!listRes.error) setHistoryRows(Array.isArray(listRes.data) ? listRes.data : []);
    if (statsRes.error || listRes.error) {
      showToast(statsRes.error?.message || listRes.error?.message || "이력을 불러오지 못했습니다.", "error");
    }
    setIsHistoryLoading(false);
  };

  const closeHistory = () => {
    setHistoryTarget(null);
    setHistoryStats(null);
    setHistoryRows([]);
  };

  const handleToggleActive = async (coupon) => {
    setBusyId(coupon.id);
    const { error } = await supabase.rpc("admin_set_coupon_active", {
      p_coupon_id: coupon.id,
      p_is_active: !coupon.is_active,
    });
    setBusyId(null);

    if (error) {
      showToast(error.message || "상태 변경에 실패했습니다.", "error");
      return;
    }
    showToast(
      `쿠폰이 ${!coupon.is_active ? "활성" : "비활성"}되었습니다.`,
      "success",
    );
    await loadCoupons();
  };

  // 쿠폰 삭제 — 사용 이력이 있으면 서버가 거부(감사 보존), 미사용 발급분은 회수 후 삭제
  const handleDelete = (coupon) => {
    setDestructiveModal({
      title: "쿠폰 삭제",
      description:
        `'${coupon.title}' 쿠폰을 완전히 삭제합니다. 회원에게 발급됐지만 아직 사용되지 않은 ` +
        `쿠폰도 함께 회수(삭제)됩니다. 사용 이력이 있는 쿠폰은 삭제할 수 없어요 (비활성화를 이용하세요).`,
      confirmLabel: "삭제",
      run: async () => {
        setBusyId(coupon.id);
        const { data, error } = await supabase.rpc("admin_delete_coupon", {
          p_coupon_id: coupon.id,
        });
        setBusyId(null);
        if (error) {
          showToast(error.message || "삭제에 실패했습니다.", "error");
          return;
        }
        const reclaimed = Number(data?.reclaimed_count ?? 0);
        showToast(
          reclaimed > 0
            ? `쿠폰이 삭제되었습니다. (미사용 발급분 ${reclaimed}매 회수)`
            : "쿠폰이 삭제되었습니다.",
          "success",
        );
        await loadCoupons();
      },
    });
  };

  const filteredSummary = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter((c) => c.is_active).length;
    return { total, active, inactive: total - active };
  }, [coupons]);

  return (
    <AdminShell
      actions={
        <button
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
          onClick={openCreate}
          type="button"
        >
          + 새 쿠폰
        </button>
      }
      activeModule="coupons"
      description="쿠폰 템플릿을 정의합니다. 발급(특정 회원/전체)과 회원 보유 쿠폰함은 다음 단계에서 추가됩니다."
      title="쿠폰 관리"
    >
      <div className="space-y-6">

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <input
            type="search"
            placeholder="쿠폰 이름 또는 코드로 검색"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-64 rounded-md border border-slate-300 px-3 py-2"
          />
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => {
                setOnlyActive(e.target.checked);
                setCurrentPage(1);
              }}
            />
            활성만 보기
          </label>
          <span className="ml-auto text-xs text-slate-500">
            전체 {filteredSummary.total} · 활성 {filteredSummary.active} · 비활성 {filteredSummary.inactive}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400"><InlineLoading /></div>
          ) : coupons.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {search ? "검색 결과가 없습니다." : "등록된 쿠폰이 없습니다. 우측 상단에서 새로 만들어보세요."}
            </div>
          ) : (
            // 컬럼이 많아 셀이 눌리면 한글이 한 글자씩 쪼개지므로 min-w + 가로 스크롤로 처리
            <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr className="whitespace-nowrap">
                  <th className="px-4 py-3 text-left">쿠폰 이름</th>
                  <th className="px-4 py-3 text-left">할인</th>
                  <th className="px-4 py-3 text-left">최소 주문</th>
                  <th className="px-4 py-3 text-left">유효기간</th>
                  <th className="px-4 py-3 text-left">발급</th>
                  <th className="px-4 py-3 text-left">발급 수</th>
                  <th className="px-4 py-3 text-left">상태</th>
                  <th className="px-4 py-3 text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{coupon.title}</div>
                      {coupon.description ? (
                        <div className="mt-1 text-xs text-slate-500 line-clamp-1">
                          {coupon.description}
                        </div>
                      ) : null}
                      {coupon.code ? (
                        <div className="mt-1 text-xs font-mono text-indigo-600">{coupon.code}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{describeDiscount(coupon)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {coupon.scope_brand ? (
                        <span className="mr-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          {coupon.scope_brand} 전용
                        </span>
                      ) : null}
                      {coupon.min_order_amount > 0 ? formatCurrency(coupon.min_order_amount) : "조건 없음"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{describeValidity(coupon)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {ISSUANCE_TYPE_LABEL[coupon.issuance_type] ?? coupon.issuance_type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {coupon.issued_count}
                      {coupon.total_quantity ? ` / ${coupon.total_quantity}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={coupon.is_active ? "active" : "inactive"} type="coupon" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!coupon.is_active}
                        className="mr-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                        onClick={() => openIssue(coupon)}
                        title={coupon.is_active ? undefined : "비활성 쿠폰은 발급할 수 없습니다"}
                      >
                        발급
                      </button>
                      <button
                        type="button"
                        className="mr-2 text-xs font-bold text-emerald-700 hover:text-emerald-900"
                        onClick={() => openHistory(coupon)}
                      >
                        이력
                      </button>
                      <button
                        type="button"
                        className="mr-2 text-xs font-bold text-slate-700 hover:text-slate-900"
                        onClick={() => openEdit(coupon)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busyId === coupon.id}
                        className="mr-2 text-xs font-bold text-amber-700 hover:text-amber-900 disabled:opacity-40"
                        onClick={() => handleToggleActive(coupon)}
                      >
                        {coupon.is_active ? "비활성화" : "활성화"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === coupon.id}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-40"
                        onClick={() => handleDelete(coupon)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={COUPONS_PAGE_SIZE}
          totalCount={totalCount}
        />
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">
                {form.id ? "쿠폰 수정" : "새 쿠폰 만들기"}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={closeForm}
              >
                <CloseIcon size={16} />
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">쿠폰 이름 *</span>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={handleField("title")}
                  placeholder="예: 신규가입 5천원 할인"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">설명 (어드민 메모)</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={handleField("description")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">할인 형식</span>
                <select
                  value={form.discount_type}
                  onChange={handleField("discount_type")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="fixed">정액 할인 (원)</option>
                  <option value="percentage">정률 할인 (%)</option>
                  <option value="free_shipping">무료배송</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">
                  할인 값
                  {form.discount_type === "fixed" && " (원)"}
                  {form.discount_type === "percentage" && " (%)"}
                </span>
                <input
                  type="number"
                  min="0"
                  max={form.discount_type === "percentage" ? 100 : undefined}
                  disabled={form.discount_type === "free_shipping"}
                  value={form.discount_value}
                  onChange={handleField("discount_value")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>

              {form.discount_type === "percentage" ? (
                <label className="md:col-span-2">
                  <span className="text-xs font-bold text-slate-700">
                    할인 상한 (원) <span className="text-rose-600">* 필수</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.max_discount_amount}
                    onChange={handleField("max_discount_amount")}
                    placeholder="예: 5000 — 정률 쿠폰은 반드시 상한 필요"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                  {/* 정률 + max_discount 빈칸 + 전체 발급 조합은 회사가 망할 수 있음.
                      저장 시점에 입력하지 않으면 차단. */}
                  {!form.max_discount_amount ? (
                    <p className="mt-1 text-xs font-semibold text-rose-600">
                      정률 쿠폰은 상한 없이 사용하면 객단가에 비례해 회사 손실이 무제한이 됩니다. 반드시 입력하세요.
                    </p>
                  ) : null}
                </label>
              ) : null}

              {/* 누적 예산 cap — 누적 할인이 이 금액 도달 시 자동 비활성 (backend trigger 처리) */}
              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">
                  누적 예산 cap (원, 선택) — 안전장치
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.budget_cap_amount}
                  onChange={handleField("budget_cap_amount")}
                  placeholder="예: 5000000 — 누적 할인이 이 금액 초과 시 쿠폰 자동 비활성"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">
                  비워두면 무제한. 정률·전체 발급 쿠폰일수록 cap 권장.
                </p>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">최소 주문 금액 (원)</span>
                <input
                  type="number"
                  min="0"
                  value={form.min_order_amount}
                  onChange={handleField("min_order_amount")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">사용 가능 브랜드 (선택)</span>
                <select
                  value={form.scope_brand}
                  onChange={handleField("scope_brand")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">전체 주문 (제한 없음)</option>
                  {BRAND_OPTIONS.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand} 교재 한정
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  지정하면 해당 브랜드 교재가 담긴 주문에서만 쓸 수 있고, 최소 주문
                  금액·할인액도 그 브랜드 품목 합계 기준으로 계산돼요.
                </p>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">발급 방식</span>
                <select
                  value={form.issuance_type}
                  onChange={handleField("issuance_type")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="admin_assigned">어드민 발급 (특정 회원/전체)</option>
                  <option value="code">코드 입력 (회원이 코드 입력)</option>
                  <option value="download">다운로드 (회원이 쿠폰 페이지에서 받기)</option>
                </select>
              </label>

              {form.issuance_type === "code" ? (
                <label className="md:col-span-2">
                  <span className="text-xs font-bold text-slate-700">쿠폰 코드 *</span>
                  <input
                    required
                    type="text"
                    value={form.code}
                    onChange={handleField("code")}
                    placeholder="예: WELCOME2026"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                  />
                </label>
              ) : null}

              {/* 사용 기간 — 구 식스샵의 '기한 설정 유형' 3종 */}
              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">기한 설정 유형</span>
                <select
                  value={form.validity_mode}
                  onChange={handleField("validity_mode")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="unlimited">시작일로부터 무기한으로 설정</option>
                  <option value="range">시작일과 종료일 설정</option>
                  <option value="relative">지급일 기준 사용 기간 설정</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">
                  {form.validity_mode === "relative" ? "발급 시작일 (선택)" : "시작일 (선택)"}
                </span>
                <input
                  type="datetime-local"
                  value={form.valid_from}
                  onChange={handleField("valid_from")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">비워두면 즉시 발급/사용 가능</p>
              </label>

              {form.validity_mode === "range" ? (
                <label>
                  <span className="text-xs font-bold text-slate-700">종료일 *</span>
                  <input
                    required
                    type="datetime-local"
                    value={form.valid_until}
                    onChange={handleField("valid_until")}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">이 시각 이후 발급·사용 불가</p>
                </label>
              ) : null}

              {form.validity_mode === "relative" ? (
                <label>
                  <span className="text-xs font-bold text-slate-700">지급일로부터 사용 기간 (일) *</span>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.valid_days}
                    onChange={handleField("valid_days")}
                    placeholder="예: 30 — 받은 날부터 30일간 사용 가능"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    회원마다 쿠폰을 받은 시점 + N일이 만료일이 됩니다
                  </p>
                </label>
              ) : null}

              <label>
                <span className="text-xs font-bold text-slate-700">1인당 사용 한도 (선택)</span>
                <input
                  type="number"
                  min="1"
                  value={form.usage_limit_per_user}
                  onChange={handleField("usage_limit_per_user")}
                  placeholder="비워두면 무제한"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">전체 발급 한도 (선택)</span>
                <input
                  type="number"
                  min="1"
                  value={form.total_quantity}
                  onChange={handleField("total_quantity")}
                  placeholder="비워두면 무제한"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              {/* 쿠폰 자동 지급 조건 (구 식스샵 패리티 — 현재는 회원 가입 시 1종) */}
              <label className="md:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.issue_on_signup}
                  onChange={handleField("issue_on_signup")}
                />
                <span className="text-sm font-bold text-slate-700">회원 가입 시 자동 지급</span>
              </label>

              <label className="md:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={handleField("is_active")}
                />
                <span className="text-sm font-bold text-slate-700">
                  활성 — 비활성화하면 신규 발급/사용이 막힙니다 (이미 발급된 쿠폰은 영향 없음)
                </span>
              </label>
            </div>

            <footer className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                onClick={closeForm}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {isSaving ? <BusyText>저장 중...</BusyText> : form.id ? "수정 저장" : "쿠폰 생성"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {issueTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">쿠폰 발급</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-bold">{issueTarget.title}</span>
                  {issueTarget.issuance_type === "code" || issueTarget.issuance_type === "download"
                    ? " · 한 회원당 1매만 발급됩니다 (이미 보유한 회원은 자동 제외)"
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={closeIssue}
                disabled={isIssuing}
              >
                <CloseIcon size={16} />
              </button>
            </header>

            <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div>
                <p className="font-bold text-amber-900">전체 회원에게 발급</p>
                <p className="mt-1 text-xs text-amber-800">
                  관리자 계정을 제외한 모든 활성 회원에게 1매씩 발급합니다.
                </p>
              </div>
              <button
                type="button"
                disabled={isIssuing}
                onClick={handleIssueToAll}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                전체 발급
              </button>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-slate-700">특정 회원에게 발급</label>
              <input
                type="search"
                value={issueSearch}
                onChange={(e) => setIssueSearch(e.target.value)}
                placeholder="이름/이메일/전화번호로 검색"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
              {isIssueLoading ? (
                <div className="p-4 text-center text-sm text-slate-400"><InlineLoading /></div>
              ) : issueMembers.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">
                  {issueSearch ? "검색 결과가 없습니다." : "검색어를 입력하세요."}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {issueMembers.map((member) => (
                    <li key={member.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900">
                          {member.display_name || member.name || member.email}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {member.email}
                          {member.phone ? ` · ${member.phone}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isIssuing}
                        onClick={() => handleIssueToUser(member)}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        발급
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={isIssuing}
                onClick={closeIssue}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {historyTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">발급 이력</h2>
                <p className="mt-1 text-sm text-slate-500">{historyTarget.title}</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={closeHistory}
              >
                <CloseIcon size={16} />
              </button>
            </header>

            {/* 통계 */}
            {historyStats ? (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-xs text-slate-500">총 발급</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{historyStats.total_issued}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-emerald-50 p-3 text-center">
                  <div className="text-xs text-emerald-700">사용</div>
                  <div className="mt-1 text-xl font-black text-emerald-800">{historyStats.used_count}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-blue-50 p-3 text-center">
                  <div className="text-xs text-blue-700">미사용</div>
                  <div className="mt-1 text-xl font-black text-blue-800">{historyStats.available_count}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-rose-50 p-3 text-center">
                  <div className="text-xs text-rose-700">만료</div>
                  <div className="mt-1 text-xl font-black text-rose-800">{historyStats.expired_count}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-amber-50 p-3 text-center">
                  <div className="text-xs text-amber-700">잔여 발급</div>
                  <div className="mt-1 text-xl font-black text-amber-800">
                    {historyStats.remaining_quota == null ? "무제한" : historyStats.remaining_quota}
                  </div>
                </div>
              </div>
            ) : null}

            {/* 발급 이력 목록 */}
            <div className="overflow-hidden rounded-md border border-slate-200">
              {isHistoryLoading ? (
                <div className="p-8 text-center text-sm text-slate-400"><InlineLoading /></div>
              ) : historyRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">아직 발급되지 않았습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">회원</th>
                      <th className="px-3 py-2 text-left">발급일</th>
                      <th className="px-3 py-2 text-left">만료일</th>
                      <th className="px-3 py-2 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-900">
                            {row.nickname || row.name || row.email}
                          </div>
                          <div className="text-xs text-slate-500">{row.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                          {row.issued_at ? new Date(row.issued_at).toLocaleString("ko-KR") : "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                          {row.expires_at ? new Date(row.expires_at).toLocaleString("ko-KR") : "무기한"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${
                              row.status === "used"
                                ? "bg-emerald-100 text-emerald-800"
                                : row.status === "expired"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {row.status === "used"
                              ? "사용"
                              : row.status === "expired"
                                ? "만료"
                                : "보유"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <footer className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeHistory}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-bold text-white shadow-lg ${
            toast.tone === "error"
              ? "bg-rose-600"
              : toast.tone === "success"
                ? "bg-emerald-600"
                : "bg-slate-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <DestructiveConfirmModal
        busy={isIssuing}
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

export default AdminCouponsPage;
