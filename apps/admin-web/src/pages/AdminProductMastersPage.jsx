import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";

// 식스샵 스타일 어드민 상품 마스터 페이지.
// products 테이블을 1차 단위로 표시하고, 행 클릭 시 그 product에 link된
// books 인스턴스(셀러별/등급별)를 모달로 보여준다.

const STATUS_LABEL = {
  selling: "판매중",
  sold_out: "품절",
  hidden: "숨김",
};

const STATUS_BADGE = {
  selling: "bg-emerald-100 text-emerald-800",
  sold_out: "bg-amber-100 text-amber-800",
  hidden: "bg-slate-200 text-slate-500",
};

const BRAND_OPTIONS = [
  "시대인재",
  "강남대성",
  "대성마이맥",
  "이투스",
  "EBS",
  "메가스터디",
  "이감",
  "상상국어평가연구소",
];

const SUBJECT_OPTIONS = ["국어", "수학", "영어", "과학", "사회", "한국사", "기타"];

const BOOK_TYPE_OPTIONS = ["기출", "모의고사", "N제", "EBS", "주간지", "내신", "개념", "워크북"];

const CONDITION_LABEL = {
  S: "S (새책)",
  A_PLUS: "A+ (사용감 적음)",
  A: "A (사용감 있음)",
};

function initialCreateForm() {
  return {
    title: "",
    subject: "",
    brand: "",
    book_type: "",
    published_year: "",
    instructor_name: "",
    option: "",
    cover_image_url: "",
    status: "selling",
  };
}

function priceRangeLabel(min, max) {
  if (min == null && max == null) return "-";
  if (min === max) return formatCurrency(min);
  return `${formatCurrency(min)} ~ ${formatCurrency(max)}`;
}

function AdminProductMastersPage() {
  const [products, setProducts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [destructiveModal, setDestructiveModal] = useState(null);
  const PRODUCTS_PAGE_SIZE = 50;
  const [summary, setSummary] = useState({ total: 0, selling: 0, sold_out: 0, hidden: 0 });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ brand: "", subject: "", book_type: "", status: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  // 상세 모달
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [bookBusyId, setBookBusyId] = useState(null);
  // 새 상품 모달
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm());
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const requestIdRef = useRef(0);

  // 일괄 선택
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const toggleSelectId = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (current.size === products.length && products.length > 0) return new Set();
      return new Set(products.map((p) => p.id));
    });
  };

  const runBulkProductDelete = async (ids) => {
    setBulkProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_bulk_delete_products", { p_ids: ids });
      if (error) {
        showToast(error.message || "삭제에 실패했습니다.", "error");
      } else {
        const deleted = data?.deleted_count ?? 0;
        const blocked = data?.blocked_count ?? 0;
        showToast(
          `삭제 ${deleted}건 완료${blocked > 0 ? ` / 차단 ${blocked}건 (연결된 책 존재)` : ""}`,
          blocked > 0 ? "info" : "success",
        );
      }
      setSelectedIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  const runBulkProductStatus = async (action, ids) => {
    setBulkProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_bulk_update_product_status", {
        p_ids: ids,
        p_status: action,
      });
      if (error) {
        showToast(error.message || "일괄 변경에 실패했습니다.", "error");
      } else {
        showToast(`${data?.updated_count ?? 0}개 상품 상태 변경 완료`, "success");
      }
      setSelectedIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkProductAction = (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === "delete") {
      setDestructiveModal({
        title: `상품 일괄 삭제 — ${ids.length}건`,
        description:
          `선택한 ${ids.length}개 상품을 삭제합니다.\n\n` +
          `· 연결된 책이 있는 상품은 자동 skip됩니다.\n` +
          `· 이미 등록된 주문 이력에는 영향이 없습니다.\n\n` +
          `이 작업은 되돌릴 수 없습니다.`,
        confirmPhrase: String(ids.length),
        reasonRequired: false,
        confirmLabel: `${ids.length}건 삭제`,
        run: async () => {
          await runBulkProductDelete(ids);
        },
      });
      return;
    }

    const label = { selling: "공개(판매중)", hidden: "숨김", sold_out: "품절" }[action] ?? action;
    if (!window.confirm(`선택한 ${ids.length}개 상품을 '${label}' 상태로 일괄 변경할까요?`)) return;
    void runBulkProductStatus(action, ids);
  };

  // products 목록이 갱신되면 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set());
  }, [products]);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadProducts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = {
      p_limit: PRODUCTS_PAGE_SIZE,
      p_offset: (currentPage - 1) * PRODUCTS_PAGE_SIZE,
    };
    if (search.trim()) params.p_search = search.trim();
    if (filters.brand) params.p_brand = filters.brand;
    if (filters.subject) params.p_subject = filters.subject;
    if (filters.book_type) params.p_book_type = filters.book_type;
    if (filters.status) params.p_status = filters.status;

    const [listRes, summaryRes] = await Promise.all([
      supabase.rpc("admin_list_products_with_inventory", params),
      supabase.rpc("admin_get_products_summary"),
    ]);
    if (currentRequestId !== requestIdRef.current) return;

    if (listRes.error) {
      showToast(listRes.error.message || "상품 목록을 불러오지 못했습니다.", "error");
      setProducts([]);
      setTotalCount(0);
    } else {
      const raw = listRes.data;
      if (Array.isArray(raw)) {
        setProducts(raw);
        setTotalCount(raw.length < PRODUCTS_PAGE_SIZE ? (currentPage - 1) * PRODUCTS_PAGE_SIZE + raw.length : 0);
      } else if (raw && typeof raw === "object") {
        setProducts(Array.isArray(raw.items) ? raw.items : []);
        setTotalCount(Number(raw.total_count) || 0);
      } else {
        setProducts([]);
        setTotalCount(0);
      }
    }
    if (!summaryRes.error && summaryRes.data) {
      setSummary(summaryRes.data);
    }
    setIsLoading(false);
  }, [search, filters, showToast, currentPage]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadProducts();
    }, 200);
    return () => window.clearTimeout(timerId);
  }, [loadProducts]);

  const handleStatusChange = async (product, nextStatus) => {
    if (product.status === nextStatus) return;
    setBusyId(product.id);
    const { error } = await supabase.rpc("admin_set_product_status", {
      p_product_id: product.id,
      p_status: nextStatus,
    });
    setBusyId(null);
    if (error) {
      showToast(error.message || "상태 변경에 실패했습니다.", "error");
      return;
    }
    showToast(`"${product.title}" 상태가 ${STATUS_LABEL[nextStatus]}(으)로 변경되었습니다.`, "success");
    await loadProducts();
  };

  // 상세 모달 열기
  const openDetail = async (product) => {
    setDetailTarget(product);
    setDetailData(null);
    setIsDetailLoading(true);
    const { data, error } = await supabase.rpc("admin_get_product_inventory", {
      p_product_id: product.id,
    });
    setIsDetailLoading(false);
    if (error) {
      showToast(error.message || "상세 정보를 불러오지 못했습니다.", "error");
      return;
    }
    setDetailData(data);
  };
  const closeDetail = () => {
    setDetailTarget(null);
    setDetailData(null);
  };

  // ── 새 상품 모달 ─────────────────────────────────────────────
  const openCreate = () => {
    setCreateForm(initialCreateForm());
    setIsCreateOpen(true);
  };
  const closeCreate = () => {
    setIsCreateOpen(false);
    setCreateForm(initialCreateForm());
  };
  const handleCreateField = (key) => (e) => {
    setCreateForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      showToast("jpeg/png/webp/gif 형식만 업로드 가능합니다.", "error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("이미지 크기는 15MB 이하여야 합니다.", "error");
      return;
    }
    setIsUploadingImage(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `manual/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage
      .from("product-covers")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setIsUploadingImage(false);
      showToast(error.message || "이미지 업로드 실패", "error");
      return;
    }
    const { data: pub } = supabase.storage.from("product-covers").getPublicUrl(path);
    setCreateForm((f) => ({ ...f, cover_image_url: pub.publicUrl }));
    setIsUploadingImage(false);
    showToast("이미지가 업로드되었습니다.", "success");
    e.target.value = "";
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      showToast("상품 이름을 입력하세요.", "error");
      return;
    }
    if (!createForm.subject || !createForm.brand || !createForm.book_type) {
      showToast("과목 / 브랜드 / 책 타입을 모두 선택하세요.", "error");
      return;
    }
    setIsCreating(true);
    const payload = {
      title: createForm.title.trim(),
      subject: createForm.subject,
      brand: createForm.brand,
      book_type: createForm.book_type,
      published_year: createForm.published_year ? Number(createForm.published_year) : null,
      instructor_name: createForm.instructor_name.trim() || null,
      option: createForm.option.trim() || null,
      cover_image_url: createForm.cover_image_url.trim() || null,
      status: createForm.status,
    };
    const { error } = await supabase.rpc("admin_create_product", { p_payload: payload });
    setIsCreating(false);
    if (error) {
      showToast(error.message || "등록에 실패했습니다.", "error");
      return;
    }
    showToast(`"${payload.title}" 상품이 등록되었습니다.`, "success");
    closeCreate();
    await loadProducts();
  };

  const handleBookVisibility = async (book, nextValue) => {
    setBookBusyId(book.id);
    const { error } = await supabase.rpc("admin_set_book_visibility", {
      p_book_id: book.id,
      p_is_public: nextValue,
    });
    setBookBusyId(null);
    if (error) {
      showToast(error.message || "노출 변경에 실패했습니다.", "error");
      return;
    }
    showToast(nextValue ? "노출 처리되었습니다." : "노출 해제되었습니다.", "success");
    // 모달 데이터 갱신 + 목록 갱신 (재고/min/max 변동)
    if (detailTarget) await openDetail(detailTarget);
    await loadProducts();
  };

  const filterEmpty =
    !search.trim() && !filters.brand && !filters.subject && !filters.book_type && !filters.status;

  const productCount = products.length;
  const detailProduct = detailData?.product ?? null;
  const detailBooks = useMemo(() => detailData?.books ?? [], [detailData]);

  return (
    <AdminShell
      actions={
        <>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-400 cursor-not-allowed"
            disabled
            title="식스샵 마이그레이션 후 활성화 예정"
            type="button"
          >
            + 상품 일괄 등록
          </button>
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
            onClick={openCreate}
            type="button"
          >
            + 새 상품
          </button>
        </>
      }
      activeModule="products"
      description="책 종류 단위 관리. 같은 메타데이터의 책은 자동으로 한 상품 아래로 묶입니다."
      title="상품 마스터"
    >
      <div className="space-y-6">

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "", label: "전체", value: summary.total, badge: "bg-slate-100 text-slate-800" },
            { key: "selling", label: "판매중", value: summary.selling, badge: "bg-emerald-100 text-emerald-800" },
            { key: "sold_out", label: "품절", value: summary.sold_out, badge: "bg-amber-100 text-amber-800" },
            { key: "hidden", label: "숨김", value: summary.hidden, badge: "bg-slate-200 text-slate-500" },
          ].map((card) => {
            const isActive = filters.status === card.key && (card.key !== "" || !filters.status);
            return (
              <button
                key={card.key || "all"}
                type="button"
                onClick={() => {
                  setFilters((f) => ({ ...f, status: card.key }));
                  setCurrentPage(1);
                }}
                className={`rounded-md border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wide">
                  {card.label}
                </div>
                <div className="mt-1 text-2xl font-black">{card.value ?? 0}</div>
              </button>
            );
          })}
        </div>

        {/* 검색 + 필터 */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="상품명, 강사명, 옵션으로 검색"
            className="w-72 rounded-md border border-slate-300 px-3 py-2"
          />
          <select
            value={filters.brand}
            onChange={(e) => {
              setFilters((f) => ({ ...f, brand: e.target.value }));
              setCurrentPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">전체 브랜드</option>
            {BRAND_OPTIONS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={filters.subject}
            onChange={(e) => {
              setFilters((f) => ({ ...f, subject: e.target.value }));
              setCurrentPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">전체 과목</option>
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filters.book_type}
            onChange={(e) => {
              setFilters((f) => ({ ...f, book_type: e.target.value }));
              setCurrentPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">전체 타입</option>
            {BOOK_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500">{productCount}개 표시</span>
        </div>

        {/* 일괄 액션 바 (선택 시 표시) */}
        {selectedIds.size > 0 ? (
          <div className="sticky top-0 z-30 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-sm flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-amber-900">{selectedIds.size}개 상품 선택됨</span>
            <button
              className="text-xs text-amber-700 underline hover:text-amber-900"
              onClick={() => setSelectedIds(new Set())}
              type="button"
            >
              선택 해제
            </button>
            <div className="flex-1" />
            <button
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1.5 disabled:opacity-60"
              disabled={bulkProcessing}
              onClick={() => handleBulkProductAction("selling")}
              type="button"
            >
              일괄 공개
            </button>
            <button
              className="text-xs font-semibold text-white bg-slate-600 hover:bg-slate-700 rounded-md px-3 py-1.5 disabled:opacity-60"
              disabled={bulkProcessing}
              onClick={() => handleBulkProductAction("hidden")}
              type="button"
            >
              일괄 숨김
            </button>
            <button
              className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md px-3 py-1.5 disabled:opacity-60"
              disabled={bulkProcessing}
              onClick={() => handleBulkProductAction("delete")}
              type="button"
            >
              {bulkProcessing ? "처리 중..." : "일괄 삭제"}
            </button>
          </div>
        ) : null}

        {/* 상품 그리드 (테이블) */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              {filterEmpty
                ? "등록된 상품이 없습니다. 식스샵 마이그레이션 또는 검수 흐름에서 자동 생성됩니다."
                : "검색 결과가 없습니다."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-2 py-3 text-left">
                    <input
                      aria-label="전체 선택"
                      checked={products.length > 0 && selectedIds.size === products.length}
                      onChange={toggleSelectAll}
                      type="checkbox"
                    />
                  </th>
                  <th className="w-16 px-3 py-3 text-left">이미지</th>
                  <th className="px-3 py-3 text-left">상품 이름</th>
                  <th className="w-32 px-3 py-3 text-right">판매가</th>
                  <th className="w-24 px-3 py-3 text-center">재고</th>
                  <th className="w-24 px-3 py-3 text-center">상태</th>
                  <th className="w-32 px-3 py-3 text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className={`cursor-pointer hover:bg-slate-50 ${
                      selectedIds.has(product.id) ? "bg-amber-50" : ""
                    }`}
                    onClick={() => openDetail(product)}
                  >
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        aria-label={`${product.title} 선택`}
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelectId(product.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-12 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {product.cover_image_url ? (
                          // eslint-disable-next-line jsx-a11y/img-redundant-alt
                          <img
                            src={product.cover_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                            no img
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900">
                        {product.title}
                        {product.option ? (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            ({product.option})
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {[
                          product.brand,
                          product.subject,
                          product.book_type,
                          product.published_year,
                          product.instructor_name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {priceRangeLabel(product.min_price, product.max_price)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-slate-900">{product.inventory_count ?? 0}</span>
                      <span className="text-xs text-slate-400"> · 노출 {product.public_count ?? 0}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          STATUS_BADGE[product.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {STATUS_LABEL[product.status] ?? product.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={product.status}
                        onChange={(e) => handleStatusChange(product, e.target.value)}
                        disabled={busyId === product.id}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="selling">판매중</option>
                        <option value="sold_out">품절</option>
                        <option value="hidden">숨김</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <AdminPagination
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          pageSize={PRODUCTS_PAGE_SIZE}
          totalCount={totalCount}
        />
      </div>

      {/* 새 상품 모달 */}
      {isCreateOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">새 상품 등록</h2>
              <button
                type="button"
                onClick={closeCreate}
                disabled={isCreating || isUploadingImage}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">상품 이름 *</span>
                <input
                  required
                  type="text"
                  value={createForm.title}
                  onChange={handleCreateField("title")}
                  placeholder="예: 2026 시대인재 파이널 브릿지 전국 모의고사 지구과학1"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">과목 *</span>
                <select
                  required
                  value={createForm.subject}
                  onChange={handleCreateField("subject")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">선택</option>
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">브랜드 *</span>
                <select
                  required
                  value={createForm.brand}
                  onChange={handleCreateField("brand")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">선택</option>
                  {BRAND_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  <option value="기타">기타</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">책 타입 *</span>
                <select
                  required
                  value={createForm.book_type}
                  onChange={handleCreateField("book_type")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">선택</option>
                  {BOOK_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="논술">논술</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">출판 연도 (선택)</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={createForm.published_year}
                  onChange={handleCreateField("published_year")}
                  placeholder="예: 2026"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-700">강사명 (선택)</span>
                <input
                  type="text"
                  value={createForm.instructor_name}
                  onChange={handleCreateField("instructor_name")}
                  placeholder="예: 이해원T"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">옵션 (선택)</span>
                <input
                  type="text"
                  value={createForm.option}
                  onChange={handleCreateField("option")}
                  placeholder="예: 회차[7], 1권 / 2권"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <div className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">표지 이미지 (선택)</span>
                <div className="mt-1 flex items-start gap-3">
                  <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    {createForm.cover_image_url ? (
                      // eslint-disable-next-line jsx-a11y/img-redundant-alt
                      <img src={createForm.cover_image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                        no img
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-xs file:font-bold hover:file:bg-slate-300 disabled:opacity-50"
                    />
                    <input
                      type="url"
                      value={createForm.cover_image_url}
                      onChange={handleCreateField("cover_image_url")}
                      placeholder="또는 URL 직접 입력"
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                    />
                    {isUploadingImage ? (
                      <p className="mt-1 text-xs text-slate-500">업로드 중...</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">jpeg/png/webp/gif, 최대 15MB</p>
                    )}
                  </div>
                </div>
              </div>

              <label className="md:col-span-2">
                <span className="text-xs font-bold text-slate-700">상태</span>
                <select
                  value={createForm.status}
                  onChange={handleCreateField("status")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="selling">판매중</option>
                  <option value="sold_out">품절</option>
                  <option value="hidden">숨김</option>
                </select>
              </label>
            </div>

            <footer className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreate}
                disabled={isCreating || isUploadingImage}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isCreating || isUploadingImage}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {isCreating ? "등록 중..." : "상품 등록"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {/* 상세 모달 */}
      {detailTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-6">
              <div className="flex items-start gap-4 min-w-0">
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                  {detailTarget.cover_image_url ? (
                    // eslint-disable-next-line jsx-a11y/img-redundant-alt
                    <img src={detailTarget.cover_image_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-900">{detailTarget.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {[
                      detailTarget.brand,
                      detailTarget.subject,
                      detailTarget.book_type,
                      detailTarget.published_year,
                      detailTarget.instructor_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {detailTarget.option ? (
                    <p className="mt-1 text-xs text-slate-500">옵션: {detailTarget.option}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </header>

            <div className="p-6">
              <h3 className="mb-3 text-sm font-bold text-slate-700">
                인스턴스 ({detailBooks.length}권)
              </h3>
              {isDetailLoading ? (
                <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
              ) : detailBooks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">아직 검수된 인스턴스가 없습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">셀러</th>
                      <th className="px-3 py-2 text-left">옵션</th>
                      <th className="px-3 py-2 text-left">등급</th>
                      <th className="px-3 py-2 text-right">가격</th>
                      <th className="px-3 py-2 text-center">재고 상태</th>
                      <th className="px-3 py-2 text-center">노출</th>
                      <th className="px-3 py-2 text-right">검수일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailBooks.map((book) => (
                      <tr key={book.id}>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-900">{book.seller_name || "-"}</div>
                          <div className="text-xs text-slate-500">{book.seller_phone || ""}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {book.option ? (
                            <span className="font-mono text-xs">{book.option}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {CONDITION_LABEL[book.condition_grade] ?? book.condition_grade ?? "S"}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {book.price != null ? formatCurrency(book.price) : "-"}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-slate-600">{book.status}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={bookBusyId === book.id}
                            onClick={() => handleBookVisibility(book, !book.is_public)}
                            className={`rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                              book.is_public
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {book.is_public ? "노출 중" : "비노출"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500">
                          {formatDate(book.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
        busy={bulkProcessing}
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

export default AdminProductMastersPage;
