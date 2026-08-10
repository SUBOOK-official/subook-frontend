import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "../components/AdminDialog";
import AdminShell from "../components/AdminShell";
import AdminPagination from "../components/AdminPagination";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import ProductMasterEditModal from "../components/ProductMasterEditModal";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { bookStatusLabel } from "@shared-domain/status";
import StatusBadge from "@shared-domain/StatusBadge";
import { CloseIcon } from "../components/icons";
import { downloadInventoryAuditXlsx } from "../lib/inventoryAuditExport";
import { COVER_BUCKET, uploadImageToBucket } from "../lib/adminImageUpload";
import { BusyText, InlineLoading, LoadingOverlay } from "../components/Loading";
import {
  prepareStudioImagePayload,
  requestStudioGeneration,
  studioResultToFile,
} from "../lib/studioClient";

// 식스샵 스타일 어드민 상품 마스터 페이지.
// products 테이블을 1차 단위로 표시하고, 행 클릭 시 그 product에 link된
// books 인스턴스(셀러별/등급별)를 모달로 보여준다.

// products.status는 재고(books) 파생값 — DB 가드 트리거가 직접 쓰기를 재고 기준으로
// 수렴시킨다(2026-07-25). 여기서는 읽기 전용 뱃지로만 표시하고, 상품 올리기/내리기는
// books.is_public 경로(admin_bulk_set_products_visibility·admin_set_book_visibility)를 쓴다.
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

// ── 상태 변경 이력 (2026-08-01) ──────────────────────────────────────────────
// admin_get_product_status_history RPC가 book_change_logs(권별 status/is_public,
// 2026-05-13부터)와 product_status_logs(상품 파생 상태 전이, 2026-08-01부터)를 합쳐 준다.
// actor_type: 'admin'=관리자 수동 / 'member'=회원 행위(주문·취소)로 인한 자동 /
// 'system'=크론·PG 서버리스 등 auth 컨텍스트 없는 완전 자동.

// 권 상태 전이별 원인 힌트 — 실제 전이를 만드는 경로가 정해져 있어 안전하게 표기 가능
// (on_sale→reserved는 주문 선점 트리거, reserved→on_sale은 취소/만료 복원 등)
const HISTORY_TRANSITION_HINT = {
  "on_sale>reserved": "주문 선점",
  "reserved>on_sale": "주문 취소·만료 복원",
  "reserved>settled": "판매완료 처리",
  "on_sale>settled": "판매완료 처리",
  "settled>on_sale": "판매 복귀 (환불·정산취소)",
};

function formatHistoryDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function describeHistoryEvent(ev) {
  if (ev.kind === "product_status") {
    const from = STATUS_LABEL[ev.old_value] ?? ev.old_value ?? "-";
    const to = STATUS_LABEL[ev.new_value] ?? ev.new_value ?? "-";
    return { text: `${from} → ${to}`, hint: null };
  }
  if (ev.kind === "book_registered") {
    return { text: "재고 등록 (입고)", hint: null };
  }
  if (ev.kind === "book_visibility") {
    return ev.new_value === "true"
      ? { text: "스토어 노출 처리", hint: null }
      : { text: "스토어 노출 해제", hint: null };
  }
  const from = bookStatusLabel[ev.old_value] ?? ev.old_value ?? "-";
  const to = bookStatusLabel[ev.new_value] ?? ev.new_value ?? "-";
  return {
    text: `${from} → ${to}`,
    hint: HISTORY_TRANSITION_HINT[`${ev.old_value}>${ev.new_value}`] ?? null,
  };
}

function historyActorInfo(ev) {
  if (ev.kind === "book_registered") return null;
  if (ev.actor_type === "admin") {
    return {
      badge: "수동",
      badgeClass: "bg-indigo-100 text-indigo-800",
      label: `관리자 ${ev.actor_name ?? ""}`.trim(),
    };
  }
  if (ev.actor_type === "member") {
    return {
      badge: "자동",
      badgeClass: "bg-slate-100 text-slate-600",
      label: `회원 ${ev.actor_name ?? ""}`.trim(),
    };
  }
  return { badge: "자동", badgeClass: "bg-slate-100 text-slate-600", label: "시스템" };
}

function priceRangeLabel(min, max) {
  if (min == null && max == null) return "-";
  if (min === max) return formatCurrency(min);
  return `${formatCurrency(min)} ~ ${formatCurrency(max)}`;
}

// 로컬(KST) 기준 YYYY-MM-DD — 엑셀 기간 프리셋용
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateStr(d);
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
  // 정렬 — 기본 '최근 수정순' (2026-07-22 운영자 피드백: 기존 상품에 재고를 추가하면
  // 등록순 정렬에선 과거 위치에 묻혀 못 찾음. updated_at은 books 변경 트리거가 유지)
  const [sortKey, setSortKey] = useState("updated");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  // 상세 모달
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [bookBusyId, setBookBusyId] = useState(null);
  // 상태 변경 이력 (2026-08-01) — null=미로딩, []=이력 없음/실패
  const [historyEvents, setHistoryEvents] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  // 권별 위치/일련번호 인라인 수정 (2026-07-18 재고 실사 이관)
  const [invEdit, setInvEdit] = useState(null);
  const [invSaving, setInvSaving] = useState(false);
  // 수정 모달 (제목/가격/사진 — 2026-07-06 피드백)
  const [editTarget, setEditTarget] = useState(null);
  const requestIdRef = useRef(0);

  // 일괄 선택
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // 표지 AI 일괄 변환 진행률 (2026-07-22)
  const [bulkStudioProgress, setBulkStudioProgress] = useState(null);
  // 재고 전수조사 엑셀 (R2: 구 대시보드 catalog 뷰에서 이식, 2026-07-22 등록일 범위 추가)
  const [isInventoryExporting, setIsInventoryExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportRange, setExportRange] = useState({ from: "", to: "" });
  // 사용자(책 주인 = 수거신청자)별 추출 (2026-07-23 운영자 피드백)
  const [exportSeller, setExportSeller] = useState("");

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

  // 완전 삭제 (2026-07-22): 주문·정산 이력이 없는 상품만 책과 함께 하드 삭제.
  // 구 admin_bulk_delete_products는 책이 1권이라도 있으면 무조건 차단이라 사실상
  // 아무것도 못 지웠음 — 이력 보호 조건만 남기고 진짜 삭제로 교체.
  const runBulkProductDelete = async (ids) => {
    setBulkProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_bulk_hard_delete_products", { p_ids: ids });
      if (error) {
        showToast(error.message || "삭제에 실패했습니다.", "error");
      } else {
        const deletedProducts = data?.deleted_products ?? 0;
        const deletedBooks = data?.deleted_books ?? 0;
        const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
        if (skipped.length > 0) {
          console.warn("[하드 삭제] 보호되어 건너뜀:", skipped);
        }
        showToast(
          `완전 삭제 ${deletedProducts}종 · ${deletedBooks}권` +
            (skipped.length > 0
              ? ` / ${skipped.length}종 보호됨(${skipped[0]?.reason ?? "이력 존재"}${skipped.length > 1 ? " 외" : ""})`
              : ""),
          skipped.length > 0 ? "info" : "success",
        );
      }
      setSelectedIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  // 일괄 노출/숨김 — books.is_public을 직접 플립 (2026-07-22 수리).
  // 구 admin_bulk_update_product_status는 파생값 products.status만 바꿔 스토어에
  // 반영되지 않고 다음 트리거 때 원복되는 버그가 있어 사용 중단.
  const runBulkProductVisibility = async (isPublic, ids) => {
    setBulkProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_bulk_set_products_visibility", {
        p_product_ids: ids,
        p_is_public: isPublic,
      });
      if (error) {
        showToast(error.message || "일괄 변경에 실패했습니다.", "error");
      } else {
        const books = data?.updated_books ?? 0;
        const skipped = Array.isArray(data?.skipped_product_ids) ? data.skipped_product_ids.length : 0;
        showToast(
          `재고 ${books}권 ${isPublic ? "노출" : "숨김"} 전환 완료` +
            (skipped > 0 ? ` / ${skipped}개 상품은 노출된 재고 없음(판매중·가격·검수 메타 조건 미충족)` : ""),
          skipped > 0 ? "info" : "success",
        );
      }
      setSelectedIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  // 표지 AI 일괄 변환 (2026-07-22): 현재 표지를 내려받아 스튜디오 변환 후 교체.
  // 화/수 실물사진으로 등록된 표지 45종 백필 겸 영구 기능. 순차 처리(레이트리밋 회피).
  const runBulkCoverStudio = async (ids) => {
    setBulkProcessing(true);
    // 실시간 진행 패널 (2026-07-23 운영자 피드백: 어떤 상품이 변환 중인지 보이게)
    setBulkStudioProgress({ done: 0, total: ids.length, current: null, log: [], finished: false });
    const failures = [];
    let converted = 0;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      if (!accessToken) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        const target = products.find((p) => p.id === id);
        const title = target?.title ?? `#${id}`;
        setBulkStudioProgress((p) => (p ? { ...p, current: title } : p));
        try {
          const coverUrl = target?.cover_image_url;
          if (!coverUrl) throw new Error("표지 없음");
          const res = await fetch(coverUrl);
          if (!res.ok) throw new Error("표지 다운로드 실패");
          const blob = await res.blob();
          const name = decodeURIComponent((coverUrl.split("/").pop() || "cover.jpg").split("?")[0]);
          const file = new File([blob], name, { type: blob.type || "image/jpeg" });
          const payload = await prepareStudioImagePayload(file);
          const generated = await requestStudioGeneration(accessToken, payload);
          const studioFile = studioResultToFile(generated, file.name);
          const url = await uploadImageToBucket(COVER_BUCKET, studioFile, "studio-batch");
          if (!url) throw new Error("변환본 업로드 실패");
          const { error: rpcError } = await supabase.rpc("admin_set_product_cover", {
            p_product_id: id,
            p_cover_image_url: url,
          });
          if (rpcError) throw new Error(rpcError.message || "표지 반영 실패");
          converted += 1;
          setBulkStudioProgress((p) =>
            p ? { ...p, done: i + 1, current: null, log: [...p.log, { id, title, ok: true }] } : p,
          );
        } catch (err) {
          const message = err?.message || "알 수 없는 오류";
          failures.push({ id, title, message });
          setBulkStudioProgress((p) =>
            p ? { ...p, done: i + 1, current: null, log: [...p.log, { id, title, ok: false, message }] } : p,
          );
        }
      }
      if (failures.length > 0) console.warn("[표지 AI 변환] 실패 목록:", failures);
      showToast(
        `표지 AI 변환 ${converted}건 완료` + (failures.length > 0 ? ` / 실패 ${failures.length}건 — 아래 패널에서 확인` : ""),
        failures.length > 0 ? "info" : "success",
      );
    } catch (err) {
      showToast(err?.message || "표지 AI 변환을 시작하지 못했습니다.", "error");
    } finally {
      // 패널은 닫기 버튼으로 직접 닫을 때까지 유지 — 실패 목록 확인용
      setBulkStudioProgress((p) => (p ? { ...p, current: null, finished: true } : p));
      setBulkProcessing(false);
      setSelectedIds(new Set());
      await loadProducts();
    }
  };

  const handleBulkProductAction = (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === "delete") {
      setDestructiveModal({
        title: `상품 완전 삭제 — ${ids.length}건`,
        description:
          `선택 ${ids.length}개 상품을 연결된 재고(책)와 함께 완전히 삭제합니다.\n\n` +
          `· 주문·정산 이력이 있는 상품, 판매완료/폐기 책이 있는 상품은 자동으로 보호(건너뜀)됩니다.\n` +
          `· 장바구니·찜·재입고 알림 연결은 함께 정리됩니다.\n\n` +
          `이 작업은 되돌릴 수 없습니다.`,
        confirmPhrase: "삭제",
        reasonRequired: false,
        confirmLabel: `${ids.length}건 완전 삭제`,
        run: async () => {
          await runBulkProductDelete(ids);
        },
      });
      return;
    }

    if (action === "cover_studio") {
      setDestructiveModal({
        title: `표지 AI 변환 — ${ids.length}건`,
        description:
          `선택 ${ids.length}개 상품의 현재 표지를 AI 스튜디오 사진으로 변환해 교체합니다.\n\n` +
          `· 상품당 20초 안팎 걸리며 순서대로 처리됩니다.\n` +
          `· 표지가 없는 상품은 건너뜁니다.\n` +
          `· 이미 변환된 표지(_studio)를 다시 변환하면 이중 변환될 수 있으니 선택을 확인해 주세요.\n\n` +
          `기존 표지 이미지는 새 변환본으로 교체됩니다.`,
        confirmPhrase: "변환",
        reasonRequired: false,
        confirmLabel: `${ids.length}건 변환 시작`,
        run: async () => {
          await runBulkCoverStudio(ids);
        },
      });
      return;
    }

    const isPublic = action === "selling";
    const label = isPublic ? "공개(노출)" : "숨김";
    setDestructiveModal({
      title: `${ids.length}개 상품 일괄 ${label}`,
      description:
        `선택 ${ids.length}개 상품의 재고(권)를 일괄 ${label} 처리합니다.\n\n` +
        (isPublic
          ? `· 판매중이고 가격이 입력된 재고가 즉시 스토어에 노출됩니다.\n· 가격이 없는 재고는 노출 대상에서 제외됩니다.\n· 검수가 완료되지 않은 상품이 공개되면 클레임이 발생할 수 있습니다.`
          : `· 모든 재고가 즉시 스토어에서 숨김 처리됩니다.`),
      confirmPhrase: action,
      reasonRequired: false,
      confirmLabel: `${ids.length}건 ${label}`,
      run: async () => {
        await runBulkProductVisibility(isPublic, ids);
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
  }, [search, filters, currentPage, sortKey]);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // 재고 전수조사 엑셀 다운로드 — 셀러·상품·판매가·정산여부 스냅샷.
  // 등록일(books.created_at) 범위를 선택할 수 있다 (비우면 전체, 2026-07-22).
  const handleDownloadInventoryAudit = async () => {
    if (!isSupabaseConfigured || isInventoryExporting) {
      return;
    }
    setIsInventoryExporting(true);
    try {
      const { rowCount } = await downloadInventoryAuditXlsx({
        fromDate: exportRange.from || null,
        toDate: exportRange.to || null,
        sellerQuery: exportSeller.trim() || null,
      });
      const rangeLabel =
        exportRange.from || exportRange.to
          ? ` (등록일 ${exportRange.from || "처음"}~${exportRange.to || "오늘"})`
          : "";
      const sellerLabel = exportSeller.trim() ? ` · 셀러 '${exportSeller.trim()}'` : "";
      showToast(`${rowCount.toLocaleString("ko-KR")}행 재고 엑셀을 다운로드했습니다${rangeLabel}${sellerLabel}.`, "success");
      setExportDialogOpen(false);
    } catch (exportError) {
      showToast(
        exportError instanceof Error ? exportError.message : "재고 엑셀 생성에 실패했습니다.",
        "error",
      );
    } finally {
      setIsInventoryExporting(false);
    }
  };

  const loadProducts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = {
      p_limit: PRODUCTS_PAGE_SIZE,
      p_offset: (currentPage - 1) * PRODUCTS_PAGE_SIZE,
      p_sort: sortKey,
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
  }, [search, filters, showToast, currentPage, sortKey]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadProducts();
    }, 200);
    return () => window.clearTimeout(timerId);
  }, [loadProducts]);

  // 단건 공개/숨김 — 일괄 액션과 동일하게 books.is_public 경로 (2026-07-25).
  // products.status는 재고 파생값이라(가드 트리거가 쓰기를 재고 기준으로 수렴)
  // 직접 쓰기가 무의미해짐 — 구 상태 드롭다운(admin_set_product_status)은
  // 성공 토스트만 뜨는 no-op이어서 제거하고 이 버튼으로 대체.
  const handleProductVisibility = async (product, nextPublic) => {
    setBusyId(product.id);
    const { data, error } = await supabase.rpc("admin_bulk_set_products_visibility", {
      p_product_ids: [product.id],
      p_is_public: nextPublic,
    });
    setBusyId(null);
    if (error) {
      showToast(error.message || "노출 변경에 실패했습니다.", "error");
      return;
    }
    const updatedBooks = data?.updated_books ?? 0;
    const skipped =
      Array.isArray(data?.skipped_product_ids) && data.skipped_product_ids.length > 0;
    if (nextPublic && skipped) {
      showToast("노출 가능한 재고가 없습니다 (판매중·가격·검수 메타 조건 미충족).", "info");
    } else if (updatedBooks === 0) {
      showToast(`이미 ${nextPublic ? "공개" : "숨김"} 상태입니다.`, "info");
    } else {
      showToast(
        `"${product.title}" 재고 ${updatedBooks}권을 ${nextPublic ? "공개" : "숨김"} 처리했습니다.`,
        "success",
      );
    }
    await loadProducts();
  };

  // 상세 모달 열기 — 권별 현황과 상태 변경 이력을 병렬 로드.
  // 이력 RPC 실패는 권별 현황 표시를 막지 않는다 (2026-08-01).
  const openDetail = async (product) => {
    setDetailTarget(product);
    setDetailData(null);
    setInvEdit(null);
    setIsDetailLoading(true);
    setHistoryEvents(null);
    setIsHistoryLoading(true);
    const [invRes, histRes] = await Promise.all([
      supabase.rpc("admin_get_product_inventory", { p_product_id: product.id }),
      supabase.rpc("admin_get_product_status_history", { p_product_id: product.id }),
    ]);
    setIsDetailLoading(false);
    setIsHistoryLoading(false);
    if (histRes.error) {
      setHistoryEvents([]);
      console.warn("[상태 변경 이력] 조회 실패:", histRes.error.message);
    } else {
      setHistoryEvents(Array.isArray(histRes.data?.events) ? histRes.data.events : []);
    }
    if (invRes.error) {
      showToast(invRes.error.message || "상세 정보를 불러오지 못했습니다.", "error");
      return;
    }
    setDetailData(invRes.data);
  };
  const closeDetail = () => {
    setDetailTarget(null);
    setDetailData(null);
    setInvEdit(null);
    setHistoryEvents(null);
    setIsHistoryLoading(false);
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

  // 권별 위치/일련번호 저장 — 빈 입력은 값 비우기(clear)로 처리
  const handleInventoryMetaSave = async () => {
    if (!invEdit) return;
    const serialTrim = String(invEdit.serial ?? "").trim();
    const locTrim = String(invEdit.location ?? "").trim();
    const serialNum = serialTrim === "" ? null : Number(serialTrim);
    if (serialTrim !== "" && (!Number.isInteger(serialNum) || serialNum <= 0)) {
      showToast("일련번호는 1 이상의 정수여야 합니다.", "error");
      return;
    }
    setInvSaving(true);
    const { error } = await supabase.rpc("admin_update_book_inventory_meta", {
      p_book_id: invEdit.bookId,
      p_serial_number: serialNum,
      p_location: locTrim || null,
      p_clear_serial: serialTrim === "",
      p_clear_location: locTrim === "",
    });
    setInvSaving(false);
    if (error) {
      showToast(error.message || "위치/일련번호 저장에 실패했습니다.", "error");
      return;
    }
    showToast("위치/일련번호가 저장되었습니다.", "success");
    setInvEdit(null);
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
          {/* R2: 재고 전수조사 엑셀 — 등록일 범위 선택 다이얼로그로 진입 (2026-07-22) */}
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={isInventoryExporting}
            onClick={() => setExportDialogOpen(true)}
            type="button"
          >
            {isInventoryExporting ? <BusyText>생성 중...</BusyText> : "재고 엑셀"}
          </button>
          <Link
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
            to="/admin/register"
          >
            + 상품 등록
          </Link>
        </>
      }
      activeModule="products"
      description="책 종류 단위 관리. 같은 메타데이터의 책은 자동으로 한 상품 아래로 묶이고, 상태(판매중·품절·숨김)는 재고에서 자동 계산됩니다. 상품을 내리려면 숨김(노출 해제)을 사용하세요."
      title="상품 재고"
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
            placeholder="상품명, 강사명, 옵션, 일련번호로 검색"
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
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="updated">최근 수정순</option>
            <option value="created">최신 등록순</option>
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
              className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md px-3 py-1.5 disabled:opacity-60"
              disabled={bulkProcessing}
              onClick={() => handleBulkProductAction("cover_studio")}
              type="button"
            >
              {bulkStudioProgress
                ? `AI 변환 중 ${bulkStudioProgress.done}/${bulkStudioProgress.total}`
                : "표지 AI 변환"}
            </button>
            <button
              className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md px-3 py-1.5 disabled:opacity-60"
              disabled={bulkProcessing}
              onClick={() => handleBulkProductAction("delete")}
              type="button"
            >
              {bulkProcessing ? <BusyText>처리 중...</BusyText> : "일괄 삭제"}
            </button>
          </div>
        ) : null}

        {/* 표지 AI 변환 실시간 진행 패널 (2026-07-23) — 완료 후에도 닫기 전까지 유지 */}
        {bulkStudioProgress ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-indigo-900">
                표지 AI 변환 {bulkStudioProgress.finished ? "완료" : "진행 중"} —{" "}
                {bulkStudioProgress.done}/{bulkStudioProgress.total}
              </span>
              <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                  style={{
                    width: `${bulkStudioProgress.total > 0 ? Math.round((bulkStudioProgress.done / bulkStudioProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              {bulkStudioProgress.finished ? (
                <button
                  className="text-xs font-bold text-indigo-700 underline hover:text-indigo-900"
                  onClick={() => setBulkStudioProgress(null)}
                  type="button"
                >
                  닫기
                </button>
              ) : null}
            </div>
            {bulkStudioProgress.current ? (
              <p className="mt-2 animate-pulse text-xs font-bold text-indigo-700">
                지금 변환 중: {bulkStudioProgress.current} (상품당 20초 안팎)
              </p>
            ) : null}
            {bulkStudioProgress.log.length > 0 ? (
              <ul className="mt-2 max-h-36 space-y-0.5 overflow-y-auto text-xs">
                {[...bulkStudioProgress.log].reverse().map((entry) => (
                  <li
                    className={entry.ok ? "font-semibold text-emerald-700" : "font-semibold text-rose-600"}
                    key={entry.id}
                  >
                    {entry.ok ? "✓" : "✗"} {entry.title}
                    {!entry.ok ? ` — ${entry.message}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* 상품 그리드 (테이블) */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400"><InlineLoading /></div>
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
                  <th className="w-24 px-3 py-3 text-center" title="재고에서 자동 계산됩니다">
                    상태
                  </th>
                  <th className="w-44 px-3 py-3 text-right">액션</th>
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
                      {Array.isArray(product.locations) && product.locations.length > 0 ? (
                        <div className="mt-0.5 font-mono text-[11px] font-semibold text-indigo-600">
                          {product.locations.join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          STATUS_BADGE[product.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                        title="재고에서 자동 계산 — 판매중: 노출 판매중 재고 있음 · 품절: 노출 재고 전량 판매됨 · 숨김: 노출 재고 없음"
                      >
                        {STATUS_LABEL[product.status] ?? product.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                          onClick={() => setEditTarget(product)}
                          type="button"
                        >
                          수정
                        </button>
                        {(product.public_count ?? 0) > 0 ? (
                          <button
                            className="whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-500 hover:bg-slate-50 disabled:opacity-50"
                            disabled={busyId === product.id}
                            onClick={() => handleProductVisibility(product, false)}
                            title="모든 재고의 노출을 해제해 스토어에서 내립니다"
                            type="button"
                          >
                            {busyId === product.id ? "처리 중" : "숨김"}
                          </button>
                        ) : (
                          <button
                            className="whitespace-nowrap rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50"
                            disabled={busyId === product.id}
                            onClick={() => handleProductVisibility(product, true)}
                            title="조건을 충족하는 재고를 스토어에 노출합니다"
                            type="button"
                          >
                            {busyId === product.id ? "처리 중" : "공개"}
                          </button>
                        )}
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
                  <CloseIcon size={16} />
                </button>
              </div>
            </header>

            <div className="p-6">
              <h3 className="mb-3 text-sm font-bold text-slate-700">
                권별 현황 ({detailBooks.length}권)
              </h3>
              {isDetailLoading ? (
                <div className="p-8 text-center text-sm text-slate-400"><InlineLoading /></div>
              ) : detailBooks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">아직 등록된 책이 없습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">셀러</th>
                      <th className="px-3 py-2 text-left">옵션</th>
                      <th className="px-3 py-2 text-left">위치 · 번호</th>
                      <th className="px-3 py-2 text-left">등급</th>
                      <th className="px-3 py-2 text-right">가격</th>
                      <th className="px-3 py-2 text-center">판매 상태</th>
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
                        <td className="px-3 py-2">
                          {invEdit?.bookId === book.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
                                onChange={(e) => setInvEdit((v) => ({ ...v, location: e.target.value }))}
                                placeholder="위치"
                                type="text"
                                value={invEdit.location}
                              />
                              <input
                                className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
                                onChange={(e) => setInvEdit((v) => ({ ...v, serial: e.target.value }))}
                                placeholder="번호"
                                type="number"
                                value={invEdit.serial}
                              />
                              <button
                                className="rounded bg-slate-900 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                disabled={invSaving}
                                onClick={handleInventoryMetaSave}
                                type="button"
                              >
                                {invSaving ? "..." : "저장"}
                              </button>
                              <button
                                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                                onClick={() => setInvEdit(null)}
                                type="button"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              className="group flex items-center gap-1 text-left"
                              onClick={() =>
                                setInvEdit({
                                  bookId: book.id,
                                  location: book.location ?? "",
                                  serial: book.serial_number != null ? String(book.serial_number) : "",
                                })
                              }
                              title="위치/일련번호 수정"
                              type="button"
                            >
                              {book.location || book.serial_number != null ? (
                                <span className="font-mono text-xs font-bold text-indigo-700">
                                  {book.location ?? "미지정"}
                                  {book.serial_number != null ? ` · No.${book.serial_number}` : ""}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">미지정</span>
                              )}
                              <span className="text-[10px] font-semibold text-slate-300 group-hover:text-slate-500">
                                수정
                              </span>
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {CONDITION_LABEL[book.condition_grade] ?? book.condition_grade ?? "S"}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {book.price != null ? formatCurrency(book.price) : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusBadge status={book.status} />
                        </td>
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

              {/* 상태 변경 이력 (2026-08-01) — 수동(관리자)/자동(주문·결제·만료 등) 구분 타임라인 */}
              <div className="mt-8">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-sm font-bold text-slate-700">상태 변경 이력</h3>
                  {Array.isArray(historyEvents) && historyEvents.length > 0 ? (
                    <span className="text-[11px] text-slate-400">최근 {historyEvents.length}건</span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-slate-400">
                  권별 판매 상태·노출 변경과 상품 상태(판매중·품절·숨김) 전환 기록입니다.{" "}
                  <span className="font-semibold text-indigo-600">수동</span>은 관리자 직접 조작,{" "}
                  <span className="font-semibold text-slate-500">자동</span>은 주문·결제·취소·만료 등
                  시스템/회원 행위에 의한 변경입니다.
                </p>
                {isHistoryLoading ? (
                  <div className="rounded-md border border-slate-200 p-6 text-center text-xs text-slate-400">
                    <InlineLoading label="이력을 불러오는 중..." />
                  </div>
                ) : !Array.isArray(historyEvents) || historyEvents.length === 0 ? (
                  <div className="rounded-md border border-slate-200 p-6 text-center text-xs text-slate-400">
                    아직 기록된 이력이 없습니다.
                  </div>
                ) : (
                  <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                    {historyEvents.map((ev, idx) => {
                      const desc = describeHistoryEvent(ev);
                      const actor = historyActorInfo(ev);
                      return (
                        <li
                          className="flex items-center gap-3 px-3 py-2 text-xs"
                          key={`${ev.kind}-${ev.book_id ?? "p"}-${ev.changed_at}-${idx}`}
                        >
                          <span className="w-28 flex-shrink-0 font-mono text-[11px] text-slate-400">
                            {formatHistoryDateTime(ev.changed_at)}
                          </span>
                          {ev.kind === "product_status" ? (
                            <span className="w-20 flex-shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              상품
                            </span>
                          ) : (
                            <span
                              className="w-20 flex-shrink-0 truncate rounded bg-indigo-50 px-1.5 py-0.5 text-center text-[10px] font-bold text-indigo-700"
                              title={ev.seller_name ? `셀러: ${ev.seller_name}` : undefined}
                            >
                              {ev.serial_number != null ? `No.${ev.serial_number}` : `권 #${ev.book_id}`}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                            {desc.text}
                            {desc.hint ? (
                              <span className="ml-1.5 font-normal text-slate-400">· {desc.hint}</span>
                            ) : null}
                          </span>
                          {actor ? (
                            <span className="flex flex-shrink-0 items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${actor.badgeClass}`}>
                                {actor.badge}
                              </span>
                              <span className="max-w-32 truncate text-[11px] text-slate-500">{actor.label}</span>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-slate-400">
                  권별 이력은 2026-05-13부터, 상품 상태 전환은 2026-08-01부터 기록됩니다. (최근 200건까지 표시)
                </p>
              </div>
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

      {/* 재고 엑셀 — 등록일 범위 선택 (2026-07-22: 화/수 등록분처럼 기간별 추출 요구) */}
      <AdminDialog
        onClose={() => setExportDialogOpen(false)}
        open={exportDialogOpen}
        size="sm"
        title="재고 엑셀 다운로드"
      >
        <div className="space-y-4 p-6">
          <p className="text-xs text-slate-500">
            등록일 기준으로 내려받을 범위를 선택하세요. 비워두면 전체 재고를 내려받습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "전체", from: "", to: "" },
              { label: "오늘", from: localDateStr(new Date()), to: localDateStr(new Date()) },
              { label: "어제", from: daysAgoStr(1), to: daysAgoStr(1) },
              { label: "최근 7일", from: daysAgoStr(6), to: localDateStr(new Date()) },
            ].map((preset) => (
              <button
                className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                  exportRange.from === preset.from && exportRange.to === preset.to
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                key={preset.label}
                onClick={() => setExportRange({ from: preset.from, to: preset.to })}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              onChange={(e) => setExportRange((r) => ({ ...r, from: e.target.value }))}
              type="date"
              value={exportRange.from}
            />
            <span className="text-slate-400">~</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              onChange={(e) => setExportRange((r) => ({ ...r, to: e.target.value }))}
              type="date"
              value={exportRange.to}
            />
          </div>
          {/* 사용자(책 주인)별 추출 — 수거신청자 이름/전화 일부 일치 */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="export-seller">
              수거신청자(셀러) 필터
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              id="export-seller"
              onChange={(e) => setExportSeller(e.target.value)}
              placeholder="이름 또는 전화번호 일부 — 비우면 전체"
              type="text"
              value={exportSeller}
            />
          </div>
          <button
            className="btn-primary w-full !py-2.5 text-sm"
            disabled={isInventoryExporting}
            onClick={handleDownloadInventoryAudit}
            type="button"
          >
            {isInventoryExporting ? <BusyText>생성 중...</BusyText> : "다운로드"}
          </button>
        </div>
      </AdminDialog>

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
      <LoadingOverlay
        detail={isInventoryExporting ? "재고 건수가 많으면 시간이 걸립니다" : null}
        message={isInventoryExporting ? "재고 엑셀을 만들고 있습니다" : "선택한 상품을 처리하고 있습니다"}
        open={isInventoryExporting || bulkProcessing}
      />
    </AdminShell>
  );
}

export default AdminProductMastersPage;
