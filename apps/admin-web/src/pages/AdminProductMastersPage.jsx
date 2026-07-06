import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import ProductMasterEditModal from "../components/ProductMasterEditModal";
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

// 2026-05-19 정책: 신규 입고는 모두 S(새 책). 등급은 S/A+ 이원화.
// A 라벨은 기존 데이터 표시용으로만 유지 (admin 신규 입력 옵션에서는 제거됨).
const CONDITION_LABEL = {
  S: "S (새 책)",
  A_PLUS: "A+ (사용감 적음)",
  A: "A (사용감 있음)",
};

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
  // 수정 모달 (제목/가격/사진 — 2026-07-06 피드백)
  const [editTarget, setEditTarget] = useState(null);
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
          `선택 ${ids.length}개 상품을 삭제합니다.\n\n` +
          `· 연결된 책이 있는 상품은 자동 skip됩니다.\n` +
          `· 이미 등록된 주문 이력에는 영향이 없습니다.\n\n` +
          `이 작업은 되돌릴 수 없습니다.`,
        confirmPhrase: "삭제",
        reasonRequired: false,
        confirmLabel: `${ids.length}건 삭제`,
        run: async () => {
          await runBulkProductDelete(ids);
        },
      });
      return;
    }

    const label = { selling: "공개(판매중)", hidden: "숨김", sold_out: "품절" }[action] ?? action;
    setDestructiveModal({
      title: `${ids.length}개 상품 상태 일괄 변경 — '${label}'`,
      description:
        `선택 ${ids.length}개 상품을 '${label}' 상태로 일괄 변경합니다.\n\n` +
        (action === "selling"
          ? `· 즉시 스토어에 노출됩니다.\n· 검수가 완료되지 않은 상품이 공개되면 클레임이 발생할 수 있습니다.`
          : action === "sold_out"
            ? `· 즉시 '품절' 표시로 전환됩니다. 진행 중인 장바구니에 영향이 있을 수 있습니다.`
            : `· 즉시 스토어에서 숨김 처리됩니다.`),
      confirmPhrase: action,
      reasonRequired: false,
      confirmLabel: `${ids.length}건 ${label}`,
      run: async () => {
        await runBulkProductStatus(action, ids);
      },
    });
  };

  // products 갱신 시에는 살아남은 id만 유지 (입력 변경에 의한 초기화는 별도 effect).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const surviving = new Set();
      products.forEach((p) => {
        if (prev.has(p.id)) surviving.add(p.id);
      });
      return surviving.size === prev.size ? prev : surviving;
    });
  }, [products]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filters, currentPage]);

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
        // 페이지가 가득 차면 정확한 총량을 알 수 없음 — 0이면 다음 페이지로 못 가므로
        // "최소 한 페이지 더 있음"으로 표현한다.
        setTotalCount(
          raw.length < PRODUCTS_PAGE_SIZE
            ? (currentPage - 1) * PRODUCTS_PAGE_SIZE + raw.length
            : currentPage * PRODUCTS_PAGE_SIZE + 1,
        );
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
          <Link
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
            to="/admin/register"
          >
            + 상품 등록
          </Link>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                          onClick={() => setEditTarget(product)}
                          type="button"
                        >
                          수정
                        </button>
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
                      </div>
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

      {/* 상세 모달 */}
      <AdminDialog
        bodyClassName="!p-0"
        onClose={closeDetail}
        open={Boolean(detailTarget)}
        size="xl"
      >
        {detailTarget ? (
          <>
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
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                  onClick={() => setEditTarget(detailTarget)}
                  type="button"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
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
          </>
        ) : null}
      </AdminDialog>

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

      {/* 상품 수정 모달 (제목/옵션/정가/사진 + 인스턴스별 판매가·상세사진) */}
      <ProductMasterEditModal
        onClose={() => setEditTarget(null)}
        onSaved={async (result) => {
          setEditTarget(null);
          const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
          showToast(
            skipped.length > 0
              ? `상품이 수정되었습니다. (제외 ${skipped.length}건: ${skipped[0]?.reason ?? ""})`
              : "상품이 수정되었습니다.",
            "success",
          );
          // 상세 모달이 같은 상품을 보고 있으면 갱신
          if (detailTarget) await openDetail(detailTarget);
          await loadProducts();
        }}
        product={editTarget}
      />
    </AdminShell>
  );
}

export default AdminProductMastersPage;
