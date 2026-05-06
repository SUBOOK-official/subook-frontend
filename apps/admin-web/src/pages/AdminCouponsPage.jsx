import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency } from "@shared-domain/format";

const ISSUANCE_TYPE_LABEL = {
  admin_assigned: "어드민 발급",
  code: "코드 입력",
  download: "다운로드",
};

const initialForm = {
  id: null,
  title: "",
  description: "",
  discount_type: "fixed",
  discount_value: "",
  max_discount_amount: "",
  min_order_amount: "0",
  valid_from: "",
  valid_until: "",
  usage_limit_per_user: "",
  total_quantity: "",
  issuance_type: "admin_assigned",
  code: "",
  is_active: true,
};

// 폼 → API payload (빈 문자열은 null로 전달)
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
    valid_until: form.valid_until || null,
    usage_limit_per_user: form.usage_limit_per_user
      ? Number(form.usage_limit_per_user)
      : null,
    total_quantity: form.total_quantity ? Number(form.total_quantity) : null,
    issuance_type: form.issuance_type,
    code: form.issuance_type === "code" ? form.code.trim() || null : null,
    is_active: Boolean(form.is_active),
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
    valid_from: row.valid_from ? row.valid_from.slice(0, 16) : "",
    valid_until: row.valid_until ? row.valid_until.slice(0, 16) : "",
    usage_limit_per_user: row.usage_limit_per_user != null ? String(row.usage_limit_per_user) : "",
    total_quantity: row.total_quantity != null ? String(row.total_quantity) : "",
    issuance_type: row.issuance_type || "admin_assigned",
    code: row.code || "",
    is_active: Boolean(row.is_active),
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
  if (!coupon.valid_from && !coupon.valid_until) return "무기한";
  const fmt = (v) => (v ? v.replace("T", " ").slice(0, 16) : "");
  const from = fmt(coupon.valid_from) || "즉시";
  const until = fmt(coupon.valid_until) || "무기한";
  return `${from} ~ ${until}`;
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"
      }`}
    >
      {active ? "활성" : "비활성"}
    </span>
  );
}

function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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

    const params = { p_only_active: onlyActive, p_limit: 200 };
    if (search.trim()) params.p_search = search.trim();

    const { data, error } = await supabase.rpc("admin_list_coupons", params);
    if (currentRequestId !== requestIdRef.current) return;

    if (error) {
      showToast(error.message || "쿠폰 목록을 불러오지 못했습니다.", "error");
      setCoupons([]);
    } else {
      setCoupons(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, [search, onlyActive, showToast]);

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
    if (!window.confirm(`전체 활성 회원에게 "${issueTarget.title}" 쿠폰을 발급하시겠습니까?\n(취소 불가)`)) {
      return;
    }
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

  const filteredSummary = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter((c) => c.is_active).length;
    return { total, active, inactive: total - active };
  }, [coupons]);

  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">쿠폰 관리</h1>
            <p className="mt-1 text-sm text-slate-500">
              쿠폰 템플릿을 정의합니다. 발급(특정 회원/전체)과 회원 보유 쿠폰함은 다음 단계에서 추가됩니다.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            onClick={openCreate}
          >
            + 새 쿠폰
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <input
            type="search"
            placeholder="쿠폰 이름 또는 코드로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-md border border-slate-300 px-3 py-2"
          />
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            활성만 보기
          </label>
          <span className="ml-auto text-xs text-slate-500">
            전체 {filteredSummary.total} · 활성 {filteredSummary.active} · 비활성 {filteredSummary.inactive}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : coupons.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {search ? "검색 결과가 없습니다." : "등록된 쿠폰이 없습니다. 우측 상단에서 새로 만들어보세요."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
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
                    <td className="px-4 py-3 text-slate-700">{describeDiscount(coupon)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {coupon.min_order_amount > 0 ? formatCurrency(coupon.min_order_amount) : "조건 없음"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{describeValidity(coupon)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {ISSUANCE_TYPE_LABEL[coupon.issuance_type] ?? coupon.issuance_type}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {coupon.issued_count}
                      {coupon.total_quantity ? ` / ${coupon.total_quantity}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={coupon.is_active} />
                    </td>
                    <td className="px-4 py-3 text-right">
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
                        className="mr-2 text-xs font-bold text-slate-700 hover:text-slate-900"
                        onClick={() => openEdit(coupon)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busyId === coupon.id}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-40"
                        onClick={() => handleToggleActive(coupon)}
                      >
                        {coupon.is_active ? "비활성화" : "활성화"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                ✕
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
                  <span className="text-xs font-bold text-slate-700">할인 상한 (원, 선택)</span>
                  <input
                    type="number"
                    min="0"
                    value={form.max_discount_amount}
                    onChange={handleField("max_discount_amount")}
                    placeholder="예: 5000 — 비워두면 상한 없음"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              ) : null}

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

              <label>
                <span className="text-xs font-bold text-slate-700">유효 시작 (선택)</span>
                <input
                  type="datetime-local"
                  value={form.valid_from}
                  onChange={handleField("valid_from")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">유효 만료 (선택)</span>
                <input
                  type="datetime-local"
                  value={form.valid_until}
                  onChange={handleField("valid_until")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

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
                {isSaving ? "저장 중..." : form.id ? "수정 저장" : "쿠폰 생성"}
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
                ✕
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
                <div className="p-4 text-center text-sm text-slate-400">불러오는 중...</div>
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

    </AdminShell>
  );
}

export default AdminCouponsPage;
