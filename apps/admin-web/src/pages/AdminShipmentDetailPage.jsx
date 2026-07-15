import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import BulkPriceDeltaModal from "../components/BulkPriceDeltaModal";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import InspectionImageUploader from "../components/InspectionImageUploader";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { bookConditionLabel, bookStatusLabel, shipmentStatusLabel } from "@shared-domain/status";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import StatusBadge from "@shared-domain/StatusBadge";
import NotificationResultModal from "../components/NotificationResultModal";
import { notifyArrived, notifyInspectionDone } from "../lib/adminNotification";

const BOOKS_PAGE_SIZE = 30;

const adminBookStatusOptions = [
  { value: "on_sale", label: bookStatusLabel.on_sale },
  { value: "settled", label: bookStatusLabel.settled },
];

// 2026-05-19 정책: 신규 입고는 모두 S(새 책). 등급은 S / A+ 두 종류로 이원화.
// A 등급은 신규 입력 옵션에서 제거 (기존 A 데이터는 화면에서 계속 노출, 재고 소진까지).
const adminBookConditionOptions = [
  { value: "", label: "등급 선택" },
  { value: "S", label: bookConditionLabel.S },
  { value: "A_PLUS", label: bookConditionLabel.A_PLUS },
  { value: "DISCARD", label: bookConditionLabel.DISCARD },
];

// EBS는 브랜드로만 분류 — 유형 옵션에서 제외 (2026-07-13, public 스토어 필터와 동일 정책).
const adminBookTypeOptions = ["기출", "모의고사", "N제", "주간지", "내신"];

function toNullableText(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function parsePrice(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue)) {
      return Number.NaN;
    }
    return rawValue >= 0 ? Math.trunc(rawValue) : Number.NaN;
  }

  const normalized = String(rawValue).replaceAll(",", "").trim();
  if (normalized === "") {
    return null;
  }

  if (!/^-?\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number.parseInt(normalized, 10);
  return parsed >= 0 ? parsed : Number.NaN;
}

function formatBookLabel(book) {
  const option = toNullableText(book.option);
  return option ? `${book.title} [${option}]` : book.title;
}

function getBookSortPriority(status) {
  return status === "on_sale" ? 0 : 1;
}

function compareBooksForDisplay(a, b) {
  const priorityDiff = getBookSortPriority(a.status) - getBookSortPriority(b.status);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const aTime = a.created_at ? new Date(a.created_at).getTime() : Number.NaN;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : Number.NaN;
  const canCompareTime = Number.isFinite(aTime) && Number.isFinite(bTime);
  if (canCompareTime && aTime !== bTime) {
    return aTime - bTime;
  }

  return (a.id ?? 0) - (b.id ?? 0);
}

function normalizeComparablePrice(price) {
  if (price === null || price === undefined || price === "") {
    return null;
  }

  const numeric = Number(price);
  return Number.isNaN(numeric) ? null : numeric;
}

function normalizeOptionalInteger(value) {
  const parsed = parsePrice(value);
  return parsed === null || Number.isNaN(parsed) ? null : parsed;
}

function normalizeUrlList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toNullableText(item)).filter(Boolean);
  }

  const text = toNullableText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPublicStoreDraft(book) {
  const productId = normalizeOptionalInteger(book.product_id ?? book.productId ?? book.product?.id);

  return {
    product_id: productId === null ? "" : String(productId),
    product_title: toNullableText(book.product_title ?? book.productTitle ?? book.product?.title) ?? "",
    subject: toNullableText(book.subject ?? book.category) ?? "",
    brand: toNullableText(book.brand) ?? "",
    book_type: toNullableText(book.book_type ?? book.type) ?? "",
    published_year: book.published_year ?? book.year ?? "",
    instructor_name: toNullableText(book.instructor_name ?? book.teacher_name) ?? "",
    original_price: book.original_price ?? book.originalPrice ?? "",
    condition_grade: toNullableText(book.condition_grade ?? book.grade) ?? "",
    cover_image_url: toNullableText(book.cover_image_url ?? book.coverImageUrl) ?? "",
    inspection_image_urls: Array.isArray(book.inspection_image_urls)
      ? book.inspection_image_urls.join("\n")
      : toNullableText(book.inspection_image_urls ?? "") ?? "",
    writing_percentage: book.writing_percentage ?? "",
    has_damage:
      typeof book.has_damage === "boolean"
        ? String(book.has_damage)
        : typeof book.hasDamage === "boolean"
          ? String(book.hasDamage)
          : "",
    inspection_notes: toNullableText(book.inspection_notes) ?? "",
    inspected_at: toNullableText(book.inspected_at)?.slice(0, 10) ?? "",
    is_public: Boolean(book.is_public ?? book.isPublic),
  };
}

function buildPublicStorePayload(draft) {
  const hasDamage =
    draft.has_damage === "true" || draft.has_damage === true
      ? true
      : draft.has_damage === "false" || draft.has_damage === false
        ? false
        : null;
  const productId = normalizeOptionalInteger(draft.product_id);

  const conditionGrade = toNullableText(draft.condition_grade);
  const isDiscarded = conditionGrade === "DISCARD";

  const payload = {
    subject: toNullableText(draft.subject),
    brand: toNullableText(draft.brand),
    book_type: toNullableText(draft.book_type),
    published_year: normalizeOptionalInteger(draft.published_year),
    instructor_name: toNullableText(draft.instructor_name),
    original_price: normalizeOptionalInteger(draft.original_price),
    condition_grade: conditionGrade,
    cover_image_url: toNullableText(draft.cover_image_url),
    inspection_image_urls: normalizeUrlList(draft.inspection_image_urls),
    writing_percentage: normalizeOptionalInteger(draft.writing_percentage),
    has_damage: hasDamage,
    inspection_notes: toNullableText(draft.inspection_notes),
    inspected_at: toNullableText(draft.inspected_at),
    // ⚠️ 폐기 등급은 자동으로 status='discarded' + 비노출
    is_public: isDiscarded ? false : Boolean(draft.is_public),
  };

  if (isDiscarded) {
    payload.status = "discarded";
  }

  if (productId !== null) {
    payload.product_id = productId;
  }

  return payload;
}

function getPublicStoreValidationMessage(book, draft) {
  if (!Boolean(draft.is_public)) {
    return "";
  }

  // 트리거(books_enforce_public_storefront_rules)가 공개 시 product_id(상품 마스터 연결) 필수.
  // 미연결 책을 공개하려 하면 영문 에러로 막히므로, 사전에 명확한 한국어로 안내한다.
  if (!book.product_id) {
    return "이 책은 상품 마스터에 연결되어 있지 않아 공개할 수 없어요. (상품 관리에서 연결하거나 운영팀에 문의)";
  }

  const missingFields = [];

  if (!toNullableText(draft.subject)) missingFields.push("과목");
  if (!toNullableText(draft.brand)) missingFields.push("브랜드");
  if (!toNullableText(draft.book_type)) missingFields.push("유형");
  if (!normalizeOptionalInteger(draft.published_year)) missingFields.push("연도");
  if (!toNullableText(draft.condition_grade)) missingFields.push("상태등급");
  if (!toNullableText(draft.cover_image_url)) missingFields.push("표지 이미지");
  if (!normalizeOptionalInteger(draft.original_price)) missingFields.push("정가");
  if (!normalizeComparablePrice(book.price)) missingFields.push("판매가");

  return missingFields.length > 0
    ? `공개 전환을 위해 ${missingFields.join(", ")}을(를) 입력해 주세요.`
    : "";
}

// 정산완료/폐기 책은 셀러 정산액·이력의 근거라 가격 변경 금지 (상품 마스터 모달 priceLocked와 동일 규칙)
const PRICE_LOCKED_BOOK_STATUSES = ["settled", "discarded"];
const PRICE_LOCKED_MESSAGE = "정산완료/폐기된 책의 가격은 변경할 수 없습니다.";

function isBookPriceLocked(book) {
  return PRICE_LOCKED_BOOK_STATUSES.includes(book?.status);
}

function BookPriceEditor({
  draftValue,
  isDirty,
  isInvalid,
  isSaving,
  isDisabled,
  isLocked = false,
  onChange,
  onSave,
  onReset,
  compact = false,
}) {
  const inputClass = compact
    ? "input-base !mt-0 !min-w-[120px] !py-2 text-sm"
    : "input-base !mt-0 !py-2 text-sm";
  const actionClass = compact
    ? "btn-secondary !w-auto !whitespace-nowrap !px-3 !py-2 text-xs"
    : "btn-secondary !w-auto !whitespace-nowrap !px-3 !py-2 text-xs";

  return (
    <div className={compact ? "space-y-2" : "mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"}>
      {!compact ? <p className="label">판매가 수정</p> : null}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-1"}`}>
        <input
          className={inputClass}
          disabled={isDisabled || isLocked}
          onChange={(event) => onChange(event.target.value)}
          placeholder="예: 12000"
          title={isLocked ? PRICE_LOCKED_MESSAGE : undefined}
          type="number"
          value={draftValue}
        />
        <button
          className={actionClass}
          disabled={isDisabled || isLocked || isSaving || !isDirty || isInvalid}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "저장 중..." : "판매가 저장"}
        </button>
        {isLocked ? (
          <span className="text-xs font-semibold text-amber-700">{PRICE_LOCKED_MESSAGE}</span>
        ) : isDirty ? (
          <button
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            disabled={isDisabled || isSaving}
            onClick={onReset}
            type="button"
          >
            취소
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-400">저장됨</span>
        )}
      </div>
      {isInvalid ? (
        <p className="text-xs font-semibold text-rose-700">0 이상의 숫자로 입력해 주세요.</p>
      ) : null}
    </div>
  );
}

function BookStatusEditor({
  draftValue,
  isDirty,
  isSaving,
  isDisabled,
  onChange,
  onSave,
  onReset,
  compact = false,
}) {
  const selectClass = compact ? "input-base !mt-0 !min-w-[140px] !py-2 text-sm" : "input-base";

  return (
    <div className={compact ? "space-y-2" : "mt-3"}>
      {!compact ? <span className="label">상태 변경</span> : null}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-1"}`}>
        <select
          className={selectClass}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          value={draftValue}
        >
          {adminBookStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn-secondary !w-auto !whitespace-nowrap !px-3 !py-2 text-xs"
          disabled={isDisabled || isSaving || !isDirty}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "저장 중..." : "상태 저장"}
        </button>
        {isDirty ? (
          <button
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            disabled={isDisabled || isSaving}
            onClick={onReset}
            type="button"
          >
            취소
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-400">변경 없음</span>
        )}
      </div>
      {isDirty && draftValue === "settled" ? (
        <p className="text-xs font-semibold text-amber-700">
          저장 시 이 책은 정산완료로 반영됩니다.
        </p>
      ) : null}
    </div>
  );
}

function BookPublicStoreEditor({
  book,
  draft,
  isDirty,
  isSaving,
  isDisabled,
  validationMessage,
  onChange,
  onSave,
  onReset,
}) {
  const inputClass = "input-base !mt-0 !py-2 text-sm";
  const textareaClass = "input-base !mt-0 min-h-[96px] !py-2 text-sm";
  const selectClass = "input-base !mt-0 !py-2 text-sm";
  const switchId = `book-public-switch-${book.id}`;
  const productId = normalizeOptionalInteger(draft.product_id);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-sm font-extrabold text-slate-800">공개 스토어 정보</p>
      <div className="space-y-3">
        {productId !== null || toNullableText(draft.product_title) ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="label">상품 그룹</p>
            <div className="mt-1 grid gap-1 text-sm font-semibold text-slate-700 md:grid-cols-2">
              <span>상품 ID: {productId !== null ? productId : "미등록"}</span>
              <span>상품명: {toNullableText(draft.product_title) || "미등록"}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">과목</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("subject", event.target.value)}
              placeholder="예: 수학"
              type="text"
              value={draft.subject}
            />
          </label>

          <label className="block">
            <span className="label">브랜드</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("brand", event.target.value)}
              placeholder="예: 시대인재"
              type="text"
              value={draft.brand}
            />
          </label>

          <label className="block">
            <span className="label">유형</span>
            <select
              className={selectClass}
              disabled={isDisabled}
              onChange={(event) => onChange("book_type", event.target.value)}
              value={draft.book_type}
            >
              <option value="">유형 선택</option>
              {adminBookTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">연도</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("published_year", event.target.value)}
              placeholder="예: 2026"
              type="number"
              value={draft.published_year}
            />
          </label>

          <label className="block">
            <span className="label">강사명</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("instructor_name", event.target.value)}
              placeholder="예: 이지영"
              type="text"
              value={draft.instructor_name}
            />
          </label>

          <label className="block">
            <span className="label">정가</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("original_price", event.target.value)}
              placeholder="예: 18000"
              type="number"
              value={draft.original_price}
            />
          </label>

          <label className="block">
            <span className="label">상태등급</span>
            <select
              className={selectClass}
              disabled={isDisabled}
              onChange={(event) => onChange("condition_grade", event.target.value)}
              value={draft.condition_grade}
            >
              {adminBookConditionOptions.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

        </div>

        <label className="block">
          <span className="label">표지 이미지 URL</span>
          <input
            className={inputClass}
            disabled={isDisabled}
            onChange={(event) => onChange("cover_image_url", event.target.value)}
            placeholder="https://..."
            type="url"
            value={draft.cover_image_url}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">검수 사진 (업로드)</span>
            <InspectionImageUploader
              bookId={book.id}
              disabled={isDisabled}
              onUploaded={(urls) => {
                const currentLines = String(draft.inspection_image_urls || "")
                  .split(/\r?\n|,/)
                  .map((l) => l.trim())
                  .filter(Boolean);
                const merged = [...currentLines, ...urls].join("\n");
                onChange("inspection_image_urls", merged);
              }}
            />
            <textarea
              className={`${textareaClass} mt-2`}
              disabled={isDisabled}
              onChange={(event) => onChange("inspection_image_urls", event.target.value)}
              placeholder="업로드 시 자동 추가됩니다. 직접 입력 시 한 줄에 하나씩."
              value={draft.inspection_image_urls}
            />
          </label>

          <label className="block">
            <span className="label">검수 메모</span>
            <textarea
              className={textareaClass}
              disabled={isDisabled}
              onChange={(event) => onChange("inspection_notes", event.target.value)}
              placeholder="필기 비율, 훼손 여부, 특이사항을 입력해 주세요."
              value={draft.inspection_notes}
            />
          </label>
        </div>

        <div className="grid gap-3">
          <label className="block">
            <span className="label">공개 여부</span>
            <div className="mt-1 flex h-[46px] items-center rounded-xl border border-slate-300 bg-white px-3">
              <input
                checked={Boolean(draft.is_public)}
                disabled={isDisabled}
                id={switchId}
                onChange={(event) => onChange("is_public", event.target.checked)}
                type="checkbox"
              />
              <label className="ml-2 text-sm font-semibold text-slate-700" htmlFor={switchId}>
                스토어에 노출
              </label>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          <button
            className="btn-secondary !w-auto !px-3 !py-2 text-xs"
            disabled={isDisabled || isSaving || !isDirty || Boolean(validationMessage)}
            onClick={onSave}
            type="button"
          >
            {isSaving ? "저장 중..." : "공개 정보 저장"}
          </button>
          {isDirty ? (
            <button
              className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              disabled={isDisabled || isSaving}
              onClick={onReset}
              type="button"
            >
              취소
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">변경 없음</span>
          )}
        </div>

        {validationMessage ? (
          <p className="text-xs font-semibold text-amber-700">{validationMessage}</p>
        ) : (
          <p className="text-xs font-semibold text-slate-400">
            공개 전환 시 필수 정보가 모두 입력되어야 합니다.
          </p>
        )}
      </div>
    </div>
  );
}

function AdminShipmentDetailPage() {
  const { shipmentId } = useParams();
  // 검색어와 현재 페이지를 URL에 반영 → 뒤로가기 회복 가능.
  const [searchParams, setSearchParams] = useSearchParams();

  const [shipment, setShipment] = useState(null);
  const [boxCountInput, setBoxCountInput] = useState("");
  const [books, setBooks] = useState([]);
  const [destructiveModal, setDestructiveModal] = useState(null);
  const [priceDeltaOpen, setPriceDeltaOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  // 상태 전이 시 발송된 알림톡 결과 모달 — console.warn 휘발 위험 제거
  const [shipmentNotificationResult, setShipmentNotificationResult] = useState(null);
  const [updatingBookStatusId, setUpdatingBookStatusId] = useState(null);
  const [updatingBookPriceId, setUpdatingBookPriceId] = useState(null);
  const [deletingBookId, setDeletingBookId] = useState(null);
  const [bookSearchQuery, setBookSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [bookListPage, setBookListPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
  });
  const [bookPriceDrafts, setBookPriceDrafts] = useState({});
  const [bookStatusDrafts, setBookStatusDrafts] = useState({});
  const [bookPublicDrafts, setBookPublicDrafts] = useState({});
  const [updatingBookPublicId, setUpdatingBookPublicId] = useState(null);

  // URL ↔ state 동기화. 검색어/페이지 변경 시 URL 갱신 (replace 모드 — 뒤로가기 스택 오염 방지).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (bookSearchQuery) {
      next.set("q", bookSearchQuery);
    } else {
      next.delete("q");
    }
    if (bookListPage > 1) {
      next.set("page", String(bookListPage));
    } else {
      next.delete("page");
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSearchQuery, bookListPage]);

  const parsedShipmentId = useMemo(() => Number(shipmentId), [shipmentId]);
  const isScheduled = shipment?.status === "scheduled";
  const isInspecting = shipment?.status === "inspecting";
  const isInspected = shipment?.status === "inspected";
  const sortedBooks = useMemo(() => [...books].sort(compareBooksForDisplay), [books]);
  const filteredBooks = useMemo(() => {
    const normalizedQuery = bookSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return sortedBooks;
    }

    return sortedBooks.filter((book) =>
      formatBookLabel(book).toLowerCase().includes(normalizedQuery),
    );
  }, [bookSearchQuery, sortedBooks]);
  const totalBookPages = useMemo(
    () => Math.max(1, Math.ceil(filteredBooks.length / BOOKS_PAGE_SIZE)),
    [filteredBooks.length],
  );
  const pagedBooks = useMemo(() => {
    const from = (bookListPage - 1) * BOOKS_PAGE_SIZE;
    const to = from + BOOKS_PAGE_SIZE;
    return filteredBooks.slice(from, to);
  }, [bookListPage, filteredBooks]);

  useEffect(() => {
    setBookListPage(1);
  }, [bookSearchQuery]);

  useEffect(() => {
    setBookListPage((prev) => Math.min(prev, totalBookPages));
  }, [totalBookPages]);

  // ─── 일괄 책 선택/작업 ───────────────────────────────────────────────
  const [selectedBookIds, setSelectedBookIds] = useState(() => new Set());
  const [bulkBookProcessing, setBulkBookProcessing] = useState(false);

  // ─── 키보드 워크플로 (j/k 이동, x 선택, / 검색 포커스) ─────────────
  // 운영자가 100권 단위 검수 시 마우스 클릭 횟수를 크게 줄이기 위한 단축키 (UI 안내 배너는 미노출).
  const [focusedBookId, setFocusedBookId] = useState(null);
  // 데스크탑 table에서 한 책의 "공개 스토어 정보"를 expand row로 펼치기 위한 state.
  // 좁은 td 안에 grid를 넣으면 1열로 stack되는 문제를 해결.
  const [expandedBookId, setExpandedBookId] = useState(null);

  useEffect(() => {
    if (pagedBooks.length === 0) {
      if (focusedBookId !== null) setFocusedBookId(null);
      return;
    }
    if (!focusedBookId || !pagedBooks.some((book) => book.id === focusedBookId)) {
      setFocusedBookId(pagedBooks[0].id);
    }
  }, [pagedBooks, focusedBookId]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handleKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // 입력 필드 안에서는 Enter만 row save 단축키로 허용. 나머지는 무시.
      const isEditable = isEditableTarget(event.target);

      const currentIndex = pagedBooks.findIndex((book) => book.id === focusedBookId);
      const focusedBook = currentIndex >= 0 ? pagedBooks[currentIndex] : null;
      const moveTo = (nextIndex) => {
        if (nextIndex < 0 || nextIndex >= pagedBooks.length) return;
        const nextBook = pagedBooks[nextIndex];
        setFocusedBookId(nextBook.id);
        const el = document.querySelector(`[data-shipment-book-id="${nextBook.id}"]`);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      };

      // 등급 적용 + 즉시 저장. <details>가 닫혀 있어도 draft + supabase update.
      const applyGradeAndSave = async (grade) => {
        if (!focusedBook) return;
        handleBookPublicDraftChange(focusedBook, "condition_grade", grade);
        // immediate save — 직접 supabase update (draft 우회)
        if (!isSupabaseConfigured) return;
        const currentDraft = getBookPublicDraftValue(focusedBook);
        const nextPayload = buildPublicStorePayload({ ...currentDraft, condition_grade: grade });
        setUpdatingBookPublicId(focusedBook.id);
        const { data, error: updateError } = await supabase
          .from("books")
          .update(nextPayload)
          .eq("id", focusedBook.id)
          .select("*")
          .maybeSingle();
        if (!updateError) {
          setBooks((prev) =>
            prev.map((item) =>
              item.id === focusedBook.id ? { ...item, ...(data ?? nextPayload) } : item,
            ),
          );
          resetBookPublicDraft(focusedBook.id);
          setNotice(`등급 ${grade} 저장`);
        } else {
          setError(updateError.message || "등급 저장에 실패했습니다.");
        }
        setUpdatingBookPublicId(null);
      };

      const focusPriceInput = () => {
        if (!focusedBook) return;
        const row = document.querySelector(
          `[data-shipment-book-id="${focusedBook.id}"]`,
        );
        const input = row?.querySelector('input[type="number"][placeholder*="12000"]')
          ?? row?.querySelector('input[type="number"]');
        if (input instanceof HTMLElement) {
          input.focus();
          input.scrollIntoView({ block: "nearest" });
        }
      };

      const togglePublic = async () => {
        if (!focusedBook) return;
        const currentDraft = getBookPublicDraftValue(focusedBook);
        const nextValue = !Boolean(currentDraft.is_public);
        // 공개 ON 전환 시 검증 — 미연결/필수값 누락이면 트리거 영문 에러 대신 명확히 안내.
        if (nextValue) {
          const validationMessage = getPublicStoreValidationMessage(focusedBook, {
            ...currentDraft,
            is_public: true,
          });
          if (validationMessage) {
            setError(validationMessage);
            return;
          }
        }
        handleBookPublicDraftChange(focusedBook, "is_public", nextValue);
        if (!isSupabaseConfigured) return;
        const nextPayload = buildPublicStorePayload({ ...currentDraft, is_public: nextValue });
        setUpdatingBookPublicId(focusedBook.id);
        const { data, error: updateError } = await supabase
          .from("books")
          .update(nextPayload)
          .eq("id", focusedBook.id)
          .select("*")
          .maybeSingle();
        if (!updateError) {
          setBooks((prev) =>
            prev.map((item) =>
              item.id === focusedBook.id ? { ...item, ...(data ?? nextPayload) } : item,
            ),
          );
          resetBookPublicDraft(focusedBook.id);
          setNotice(nextValue ? "공개 처리" : "비노출 처리");
        } else {
          setError(updateError.message || "공개 토글 실패");
        }
        setUpdatingBookPublicId(null);
      };

      // Enter는 입력 필드 안에서도 작동(현재 행의 dirty draft를 모두 저장).
      if (event.key === "Enter" && focusedBook) {
        if (hasBookPriceChange(focusedBook)) {
          event.preventDefault();
          void handleSaveBookPrice(focusedBook);
          return;
        }
        if (hasBookPublicDraftChange(focusedBook) && !getPublicStoreValidationMessage(focusedBook, getBookPublicDraftValue(focusedBook))) {
          event.preventDefault();
          void handleSaveBookPublicDraft(focusedBook);
          return;
        }
      }

      if (isEditable) return;

      switch (event.key) {
        case "j":
        case "ArrowDown":
          if (event.shiftKey) return;
          event.preventDefault();
          if (currentIndex === -1 && pagedBooks.length > 0) {
            moveTo(0);
          } else {
            moveTo(currentIndex + 1);
          }
          break;
        case "k":
        case "ArrowUp":
          if (event.shiftKey) return;
          event.preventDefault();
          moveTo(Math.max(0, currentIndex - 1));
          break;
        case "x":
          if (!focusedBookId) return;
          event.preventDefault();
          toggleSelectBook(focusedBookId);
          break;
        case "/":
          event.preventDefault();
          {
            const input = document.querySelector('input[data-shipment-book-search="true"]');
            if (input instanceof HTMLElement) input.focus();
          }
          break;
        case "s":
        case "S":
          // 2026-05-19 정책: 신규 입고는 모두 S(새 책) 디폴트. 단축키로 빠른 적용.
          if (event.shiftKey) return;
          event.preventDefault();
          void applyGradeAndSave("S");
          break;
        case "a":
          // A 등급은 신규 입력 폐지. 'a' 단일은 더 이상 매핑 없음(무시).
          event.preventDefault();
          break;
        case "A":
          // Shift+A = A+ 등급
          event.preventDefault();
          void applyGradeAndSave("A_PLUS");
          break;
        case "d":
        case "D":
          if (event.shiftKey) return;
          event.preventDefault();
          if (!focusedBook) return;
          // 폐기는 비가역(되돌리려면 다시 등급 지정). 단축키 오타로 인한 즉시 폐기를 막기 위해
          // 마우스/일괄 폐기와 동일하게 확인 모달을 거친다.
          setDestructiveModal({
            title: "이 책을 폐기할까요?",
            description:
              "'폐기'로 변경하면 더 이상 판매 노출되지 않습니다. 되돌리려면 다시 등급(S / A+)을 지정해야 해요.",
            confirmLabel: "폐기",
            run: () => applyGradeAndSave("DISCARD"),
          });
          break;
        case "p":
        case "P":
          if (event.shiftKey) return;
          event.preventDefault();
          focusPriceInput();
          break;
        case "u":
        case "U":
          if (event.shiftKey) return;
          event.preventDefault();
          void togglePublic();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedBooks, focusedBookId, bookPriceDrafts, bookPublicDrafts]);

  const toggleSelectBook = (id) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisibleBooks = () => {
    setSelectedBookIds((current) => {
      const visibleIds = pagedBooks.map((b) => b.id);
      const allVisibleSelected = visibleIds.every((id) => current.has(id)) && visibleIds.length > 0;
      if (allVisibleSelected) {
        const next = new Set(current);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(current);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // 페이지/검색 바뀌면 선택 초기화
  useEffect(() => {
    setSelectedBookIds(new Set());
  }, [bookSearchQuery, bookListPage]);

  const runBulkBookRpc = async (rpcName, params, { noticeSuffix = "" } = {}) => {
    setBulkBookProcessing(true);
    try {
      const { data, error } = await supabase.rpc(rpcName, params);
      if (error) {
        setError(`일괄 작업 실패: ${error.message}`);
      } else {
        const ok = data?.success_count ?? data?.updated_count ?? 0;
        const fail = data?.fail_count ?? 0;
        setNotice(`처리 완료 — 성공 ${ok}건${fail > 0 ? ` / 실패 ${fail}건` : ""}${noticeSuffix}`);
      }
      setSelectedBookIds(new Set());
      await refreshBooks();
    } finally {
      setBulkBookProcessing(false);
    }
  };

  const handleBulkBookAction = (action, opts = {}) => {
    const ids = Array.from(selectedBookIds);
    if (ids.length === 0) return;

    if (action === "visibility-show" || action === "visibility-hide") {
      const label = action === "visibility-show" ? "공개" : "숨김";
      const showLabel = action === "visibility-show";
      setDestructiveModal({
        title: `${ids.length}권 가시성 일괄 변경 — '${label}'`,
        description:
          `선택 ${ids.length}권을 일괄 '${label}'으로 변경합니다.\n\n` +
          (showLabel
            ? `· '공개'로 바뀌는 책은 즉시 스토어에 노출됩니다.\n· 검수가 미완료된 책이 공개되면 구매자 클레임이 발생할 수 있습니다.`
            : `· '숨김'으로 바뀌면 진행 중인 상세 페이지가 즉시 사라집니다.\n· 이미 장바구니에 담은 구매자에게 영향이 있을 수 있습니다.`),
        confirmPhrase: label,
        reasonRequired: false,
        confirmLabel: `${ids.length}권 ${label}`,
        run: async () => {
          await runBulkBookRpc("admin_bulk_update_books_visibility", {
            p_ids: ids,
            p_is_public: showLabel,
          });
        },
      });
      return;
    }

    if (action === "status-discarded") {
      setDestructiveModal({
        title: `책 일괄 폐기 — ${ids.length}권`,
        description:
          `선택 ${ids.length}권을 일괄 '폐기'로 변경합니다.\n\n` +
          `· active 주문이 있는 책은 자동 reject됩니다.\n` +
          `· 폐기 상태의 책은 더 이상 노출되지 않습니다.\n\n` +
          `이 작업은 되돌릴 수 없습니다.`,
        confirmPhrase: "폐기",
        reasonRequired: true,
        reasonMinLength: 3,
        reasonPlaceholder: "예) 파손 / 오염 / 검수 불합격 / 분실",
        confirmLabel: `${ids.length}권 폐기`,
        run: async () => {
          await runBulkBookRpc("admin_bulk_update_books_status", {
            p_ids: ids,
            p_status: "discarded",
          });
        },
      });
      return;
    }

    if (action === "price-delta") {
      // P0-5 별도 처리: 입력 검증된 percent 값으로 호출됨
      const percent = Number(opts.percent);
      if (!Number.isFinite(percent) || percent === 0) {
        setError("유효한 변동 비율이 아닙니다.");
        return;
      }
      // 정산완료/폐기 책은 가격 보호 — 선택에 섞여 있으면 제외하고 실행 (RPC도 이중 방어)
      const lockedIdSet = new Set(books.filter(isBookPriceLocked).map((b) => b.id));
      const targetIds = ids.filter((id) => !lockedIdSet.has(id));
      const excludedCount = ids.length - targetIds.length;
      if (targetIds.length === 0) {
        setError("선택한 책이 모두 정산완료/폐기 상태라 가격을 변경할 수 없습니다.");
        return;
      }
      void runBulkBookRpc(
        "admin_bulk_update_books_price_delta",
        { p_ids: targetIds, p_delta_percent: percent },
        { noticeSuffix: excludedCount > 0 ? ` (정산완료/폐기 ${excludedCount}권 제외)` : "" },
      );
      return;
    }

    if (action === "grade-set") {
      // 등급 일괄 지정 (S / A+) — 신규 입고 전량 S 디폴트 정책의 반복 입력을 한 번에.
      // DISCARD는 비가역이라 기존 '일괄 폐기'(확인 모달 + 사유 필수) 경로만 유지.
      const grade = opts.grade === "A_PLUS" ? "A_PLUS" : "S";
      const gradeLabel = grade === "A_PLUS" ? "A+" : "S";
      setDestructiveModal({
        title: `${ids.length}권 등급 일괄 지정 — '${gradeLabel}'`,
        description:
          `선택 ${ids.length}권의 상태 등급을 '${gradeLabel}'로 일괄 지정합니다.\n\n` +
          `· 정산완료/폐기 상태의 책은 자동으로 제외됩니다.\n` +
          `· 등급은 이후 개별 행에서 다시 변경할 수 있습니다.`,
        reasonRequired: false,
        confirmLabel: `${ids.length}권 등급 ${gradeLabel}`,
        run: async () => {
          await runBulkBookRpc("admin_bulk_update_books_grade", {
            p_ids: ids,
            p_grade: grade,
          });
        },
      });
    }
  };

  const refreshBooks = async () => {
    if (!isSupabaseConfigured || Number.isNaN(parsedShipmentId)) {
      return false;
    }

    const { data, error: booksError } = await supabase
      .from("books")
      .select("*")
      .eq("shipment_id", parsedShipmentId)
      .order("created_at", { ascending: true });

    if (booksError) {
      setError("책 목록을 불러오지 못했습니다.");
      return false;
    }

    setBooks(data ?? []);
    setBookPriceDrafts({});
    setBookStatusDrafts({});
    setBookPublicDrafts({});
    setUpdatingBookPublicId(null);
    return true;
  };

  const fetchDetail = async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    if (Number.isNaN(parsedShipmentId)) {
      setError("유효하지 않은 수거 ID입니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    const [shipmentResult, booksResult] = await Promise.all([
      supabase.from("shipments").select("*").eq("id", parsedShipmentId).maybeSingle(),
      supabase
        .from("books")
        .select("*")
        .eq("shipment_id", parsedShipmentId)
        .order("created_at", { ascending: true }),
    ]);

    if (shipmentResult.error) {
      setError("수거 정보를 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    if (booksResult.error) {
      setError("책 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setShipment(shipmentResult.data);
    setBoxCountInput(String(shipmentResult.data?.box_count ?? 0));
    setBooks(booksResult.data ?? []);
    setBookPriceDrafts({});
    setBookStatusDrafts({});
    setBookPublicDrafts({});
    setUpdatingBookPublicId(null);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDetail();
  }, [parsedShipmentId]);

  const performUpdateShipmentStatus = async ({ nextStatus, successMessage }) => {
    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    setActionLoading(true);
    setError("");
    setNotice("");

    const { error: updateError } = await supabase
      .from("shipments")
      .update({ status: nextStatus })
      .eq("id", shipment.id);

    if (updateError) {
      setError("상태 변경에 실패했습니다.");
      setActionLoading(false);
      return;
    }

    setShipment((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    setNotice(successMessage);
    setActionLoading(false);

    // 알림톡 발송 — 결과를 명시적으로 모달에 노출 (성공/실패 분리).
    // 이전엔 console.warn으로만 끝나서 운영자가 "알림톡 갔다"고 잘못 인지하던 P0 사고.
    try {
      let result = null;
      let label = "알림톡";
      if (nextStatus === "inspecting") {
        label = "입고 완료 알림";
        result = await notifyArrived({ shipment: { ...shipment, book_count: books.length } });
      } else if (nextStatus === "inspected") {
        label = "검수 완료 알림";
        result = await notifyInspectionDone({ shipment, books });
      }
      if (result && result.success === false) {
        setShipmentNotificationResult({
          title: `${label} 발송 결과`,
          successCount: 0,
          failures: [{
            id: `notif-${nextStatus}`,
            label: `${shipment.seller_name || "셀러"} (${shipment.seller_phone || "번호 없음"})`,
            error: result.error || "알림톡 발송 실패",
          }],
        });
      }
    } catch (notifyErr) {
      setShipmentNotificationResult({
        title: "알림톡 발송 결과",
        successCount: 0,
        failures: [{
          id: `notif-${nextStatus}-exception`,
          label: `${shipment.seller_name || "셀러"} (${shipment.seller_phone || "번호 없음"})`,
          error: notifyErr?.message || "알림톡 API 호출 실패",
        }],
      });
    }
  };

  // 검수 완료 전환 시 미등급 책이 1권이라도 있으면 destructive confirm 모달로 차단.
  // 운영자가 폐기/미등급 책을 인지하고 명시적으로 강행하도록 강제.
  const handleSaveBoxCount = async () => {
    if (!isSupabaseConfigured || !shipment) return;
    const parsed = Math.max(0, Number.parseInt(boxCountInput, 10) || 0);
    setActionLoading(true);
    setError("");
    setNotice("");
    const { error: updateError } = await supabase
      .from("shipments")
      .update({ box_count: parsed })
      .eq("id", shipment.id);
    setActionLoading(false);
    if (updateError) {
      setError("박스 수 저장에 실패했습니다.");
      return;
    }
    setShipment((prev) => (prev ? { ...prev, box_count: parsed } : prev));
    setBoxCountInput(String(parsed));
    setNotice(`박스 수 ${parsed}개 저장 — 상품화 비용 ${(parsed * 5000).toLocaleString()}원이 셀러 정산 시 차감됩니다.`);
  };

  const handleUpdateShipmentStatus = ({ nextStatus, successMessage }) => {
    if (nextStatus === "inspected") {
      const discardedCount = books.filter((book) => book.condition_grade === "DISCARD").length;
      const ungradedCount = books.filter(
        (book) => !book.condition_grade || book.condition_grade === "",
      ).length;

      if (ungradedCount > 0) {
        setDestructiveModal({
          title: "미등급 책이 있습니다",
          description:
            `폐기 ${discardedCount}권, 미등급 ${ungradedCount}권이 있습니다.\n\n` +
            `미등급 책은 셀러에게 알림톡이 전송될 때 등급 정보가 누락됩니다.\n` +
            `모든 책에 등급을 입력한 뒤 전환하는 것을 권장합니다.\n\n` +
            `그래도 강행하시겠습니까?`,
          confirmPhrase: "강행",
          reasonRequired: false,
          confirmLabel: "강행하여 검수 완료",
          run: async () => {
            await performUpdateShipmentStatus({ nextStatus, successMessage });
          },
        });
        return;
      }

      if (discardedCount > 0) {
        setDestructiveModal({
          title: "검수 완료로 전환",
          description: `폐기 ${discardedCount}권을 포함하여 검수 완료로 전환합니다.\n셀러에게 검수 결과 알림톡이 발송됩니다.`,
          confirmPhrase: "완료",
          reasonRequired: false,
          confirmLabel: "검수 완료 전환",
          run: async () => {
            await performUpdateShipmentStatus({ nextStatus, successMessage });
          },
        });
        return;
      }
    }

    void performUpdateShipmentStatus({ nextStatus, successMessage });
  };

  const getStatusDraftValue = (book) => {
    if (Object.prototype.hasOwnProperty.call(bookStatusDrafts, book.id)) {
      return bookStatusDrafts[book.id];
    }

    return book.status;
  };

  const resetBookStatusDraft = (bookId) => {
    setBookStatusDrafts((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
  };

  const handleStatusDraftChange = (bookId, value) => {
    setBookStatusDrafts((prev) => ({ ...prev, [bookId]: value }));
  };

  const hasBookStatusChange = (book) => getStatusDraftValue(book) !== book.status;

  const handleSaveBookStatus = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const nextStatus = getStatusDraftValue(book);
    if (nextStatus === book.status) {
      resetBookStatusDraft(book.id);
      return;
    }

    if (nextStatus === "settled") {
      setDestructiveModal({
        title: "책 상태를 '정산 완료'로 변경",
        description:
          `${formatBookLabel(book)}\n\n` +
          `· '정산 완료'로 마크하면 후속 정산 자동 처리 흐름에서 이 책이 제외됩니다.\n` +
          `· 실제 셀러 송금이 끝났는지 다시 한 번 확인해 주세요.`,
        confirmPhrase: "정산완료",
        reasonRequired: false,
        confirmLabel: "정산완료로 저장",
        run: async () => {
          await performBookStatusUpdate(book, nextStatus);
        },
      });
      return;
    }

    await performBookStatusUpdate(book, nextStatus);
  };

  const performBookStatusUpdate = async (book, nextStatus) => {
    setError("");
    setNotice("");
    setUpdatingBookStatusId(book.id);

    const { error: updateError } = await supabase
      .from("books")
      .update({ status: nextStatus })
      .eq("id", book.id);

    if (updateError) {
      setError("책 상태 저장에 실패했습니다.");
      setUpdatingBookStatusId(null);
      return;
    }

    setBooks((prev) =>
      prev.map((item) =>
        item.id === book.id ? { ...item, status: nextStatus } : item,
      ),
    );
    resetBookStatusDraft(book.id);
    setNotice(nextStatus === "settled" ? "책 상태를 정산완료로 저장했습니다." : "책 상태를 저장했습니다.");
    setUpdatingBookStatusId(null);
  };

  const getBookPublicDraftValue = (book) => {
    if (Object.prototype.hasOwnProperty.call(bookPublicDrafts, book.id)) {
      return bookPublicDrafts[book.id];
    }

    return buildPublicStoreDraft(book);
  };

  const resetBookPublicDraft = (bookId) => {
    setBookPublicDrafts((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
  };

  const handleBookPublicDraftChange = (book, field, value) => {
    setBookPublicDrafts((prev) => ({
      ...prev,
      [book.id]: {
        ...buildPublicStoreDraft(book),
        ...(prev[book.id] ?? {}),
        [field]: value,
      },
    }));
  };

  const hasBookPublicDraftChange = (book) => {
    const currentValue = buildPublicStorePayload(buildPublicStoreDraft(book));
    const nextValue = buildPublicStorePayload(getBookPublicDraftValue(book));
    return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
  };

  const handleSaveBookPublicDraft = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const draft = getBookPublicDraftValue(book);
    const validationMessage = getPublicStoreValidationMessage(book, draft);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setError("");
    setNotice("");
    setUpdatingBookPublicId(book.id);

    const payload = buildPublicStorePayload(draft);
    const { data, error: updateError } = await supabase
      .from("books")
      .update(payload)
      .eq("id", book.id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      setError("공개 스토어 정보 저장에 실패했습니다.");
      setUpdatingBookPublicId(null);
      return;
    }

    setBooks((prev) =>
      prev.map((item) =>
        item.id === book.id
          ? {
              ...item,
              ...(data ?? payload),
            }
          : item,
      ),
    );
    resetBookPublicDraft(book.id);
    setNotice("공개 스토어 정보를 저장했습니다.");
    setUpdatingBookPublicId(null);
  };

  const getPriceDraftValue = (book) => {
    if (Object.prototype.hasOwnProperty.call(bookPriceDrafts, book.id)) {
      return bookPriceDrafts[book.id];
    }

    return book.price === null || book.price === undefined ? "" : String(book.price);
  };

  const handlePriceDraftChange = (bookId, value) => {
    setBookPriceDrafts((prev) => ({ ...prev, [bookId]: value }));
  };

  const resetBookPriceDraft = (bookId) => {
    setBookPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
  };

  const hasBookPriceChange = (book) => {
    const nextPrice = parsePrice(getPriceDraftValue(book));
    if (Number.isNaN(nextPrice)) {
      return true;
    }

    return nextPrice !== normalizeComparablePrice(book.price);
  };

  const handleSaveBookPrice = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    // 상품 마스터 모달과 동일한 가격 보호 — UI 비활성화를 우회해도(단축키 Enter 등) 차단
    if (isBookPriceLocked(book)) {
      setError(PRICE_LOCKED_MESSAGE);
      resetBookPriceDraft(book.id);
      return;
    }

    if (!hasBookPriceChange(book)) {
      resetBookPriceDraft(book.id);
      return;
    }

    const nextRawValue = getPriceDraftValue(book);
    const parsedPrice = parsePrice(nextRawValue);
    if (Number.isNaN(parsedPrice)) {
      setError("판매 가격은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    setError("");
    setNotice("");
    setUpdatingBookPriceId(book.id);

    const { error: updateError } = await supabase
      .from("books")
      .update({ price: parsedPrice })
      .eq("id", book.id);

    if (updateError) {
      setError("판매가 저장에 실패했습니다.");
      setUpdatingBookPriceId(null);
      return;
    }

    setBooks((prev) =>
      prev.map((item) => (item.id === book.id ? { ...item, price: parsedPrice } : item)),
    );
    resetBookPriceDraft(book.id);
    setNotice("판매가를 수정했습니다.");
    setUpdatingBookPriceId(null);
  };

  const handleDeleteBook = (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    setDestructiveModal({
      title: "책 삭제",
      description:
        `${formatBookLabel(book)}\n\n` +
        `· 이 책에 연결된 가격/검수 정보가 모두 사라집니다.\n` +
        `· 진행 중인 주문이 있는 책은 삭제할 수 없습니다.\n` +
        `· 이 작업은 되돌릴 수 없습니다.`,
      confirmPhrase: "삭제",
      reasonRequired: false,
      confirmLabel: "책 삭제",
      run: async () => {
        await performDeleteBook(book);
      },
    });
  };

  const performDeleteBook = async (book) => {
    setError("");
    setNotice("");
    setDeletingBookId(book.id);

    const { error: deleteError } = await supabase.from("books").delete().eq("id", book.id);
    if (deleteError) {
      setError("책 삭제에 실패했습니다.");
      setDeletingBookId(null);
      return;
    }

    setBooks((prev) => prev.filter((item) => item.id !== book.id));
    resetBookPriceDraft(book.id);
    resetBookStatusDraft(book.id);
    setNotice("책을 삭제했습니다.");
    setDeletingBookId(null);
  };

  if (isLoading) {
    return (
      <AdminShell
        activeModule="inspection"
        description="수거 건과 연결된 책 목록, 검수 상태, 가격 정보를 불러오고 있습니다."
        title="검수 · 가격 책정"
      >
        <div className="card text-sm font-semibold text-slate-500">불러오는 중...</div>
      </AdminShell>
    );
  }

  if (!shipment) {
    return (
      <AdminShell
        actions={
          <Link className="btn-secondary !w-auto !px-4 !py-2.5 text-xs" to="/admin#pickup-operations">
            수거 목록으로
          </Link>
        }
        activeModule="inspection"
        description="검수 대상 수거 건을 찾을 수 없습니다. 삭제되었거나 잘못된 경로일 수 있습니다."
        title="검수 · 가격 책정"
      >
        <p className="notice-error">수거 정보를 찾을 수 없습니다.</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      actions={
        <Link className="btn-secondary !w-auto !px-4 !py-2.5 text-xs" to="/admin#pickup-operations">
          수거 목록으로
        </Link>
      }
      activeModule="inspection"
      description=""
      summaryCards={[
        {
          label: "수거 상태",
          value: shipmentStatusLabel[shipment.status] ?? shipment.status,
          tone: "brand",
          hint: `수거일 ${formatDate(shipment.pickup_date)}`,
        },
        {
          label: "등록 책 수",
          value: `${books.length}권`,
          hint: "현재 수거 건에 연결된 책",
        },
        {
          label: "가격 입력 완료",
          value: `${books.filter((book) => normalizeComparablePrice(book.price) !== null).length}권`,
          tone: "success",
          hint: "판매가가 저장된 책 기준",
        },
        {
          label: "스토어 공개중",
          value: `${books.filter((book) => Boolean(book.is_public)).length}권`,
          tone: "warning",
          hint: "공개 스토어에 노출되는 책",
        },
      ]}
      title={`${shipment.seller_name} 님 수거 상세`}
    >
      {!isSupabaseConfigured ? (
        <p className="notice-error">Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.</p>
      ) : null}

      {error ? <p className="notice-error">{error}</p> : null}
      {notice ? <p className="notice-success">{notice}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4 xl:sticky xl:top-6">
          <section className="card animate-rise space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="section-title">수거 상태</h2>
              <StatusBadge type="shipment" status={shipment.status} />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              전화번호: <span className="text-slate-900">{shipment.seller_phone}</span>
            </p>
            <p className="text-sm font-semibold text-slate-600">
              수거 일자: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
            </p>

            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="label">실제 박스 수 (상품화 비용)</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="input-base !w-24"
                  inputMode="numeric"
                  min="0"
                  onChange={(e) => setBoxCountInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  type="text"
                  value={boxCountInput}
                />
                <span className="text-sm text-slate-500">박스</span>
                <button
                  className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                  disabled={actionLoading}
                  onClick={handleSaveBoxCount}
                  type="button"
                >
                  저장
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                박스 1개당 5,000원 — 셀러 정산 시 첫 판매 건부터 차감됩니다. (현재 {(Math.max(0, Number.parseInt(boxCountInput, 10) || 0) * 5000).toLocaleString()}원)
              </p>
            </div>

            {isScheduled ? (
              <button
                className="btn-primary mt-2"
                disabled={actionLoading}
                onClick={() =>
                  handleUpdateShipmentStatus({
                    nextStatus: "inspecting",
                    successMessage: "검수중 상태로 변경되었습니다.",
                  })
                }
                type="button"
              >
                {actionLoading ? "변경 중..." : "검수중으로 변경"}
              </button>
            ) : null}

            {isInspecting ? (
              <button
                className="btn-primary mt-2"
                disabled={actionLoading}
                onClick={() =>
                  handleUpdateShipmentStatus({
                    nextStatus: "inspected",
                    successMessage: "검수 완료 상태로 변경되었습니다.",
                  })
                }
                type="button"
              >
                {actionLoading ? "변경 중..." : "검수 완료로 변경"}
              </button>
            ) : null}

          </section>

          <section className="card animate-rise">
            <h2 className="section-title">상품 등록</h2>
            <p className="mt-1 text-sm text-slate-500">
              이 고객의 교재를 검색·신규 등록하고 사진까지 한 번에 처리합니다.
            </p>
            <Link
              className="btn-primary mt-3 inline-flex w-full items-center justify-center"
              to={`/admin/register?shipmentId=${shipment.id}`}
            >
              이 고객 상품 등록하기 →
            </Link>
          </section>

        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="section-title">책 목록</h2>
              {books.length > 0 ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  검색 결과 {filteredBooks.length}권 · 페이지 {bookListPage}/{totalBookPages}
                </p>
              ) : null}
            </div>
            {filteredBooks.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                  disabled={bookListPage === 1}
                  onClick={() => setBookListPage((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  이전
                </button>
                <button
                  className="btn-secondary !w-auto !px-3 !py-1.5 text-xs"
                  disabled={bookListPage === totalBookPages}
                  onClick={() => setBookListPage((prev) => Math.min(totalBookPages, prev + 1))}
                  type="button"
                >
                  다음
                </button>
              </div>
            ) : null}
          </div>

          {books.length === 0 ? (
            <div className="card text-sm font-semibold text-slate-500">
              아직 등록된 책이 없습니다.
            </div>
          ) : null}

          {books.length > 0 ? (
            <div className="card !p-3">
              <input
                className="input-base !mt-0 !py-2.5 text-sm"
                data-shipment-book-search="true"
                onChange={(event) => setBookSearchQuery(event.target.value)}
                placeholder="등록된 책 검색 (제목/옵션) — / 키로 빠르게 포커스"
                type="text"
                value={bookSearchQuery}
              />
              <p className="mt-2 text-xs font-semibold text-slate-500">페이지당 {BOOKS_PAGE_SIZE}권</p>
            </div>
          ) : null}

          {books.length > 0 && filteredBooks.length === 0 ? (
            <div className="card text-sm font-semibold text-slate-500">
              검색 조건에 맞는 책이 없습니다.
            </div>
          ) : null}

          {filteredBooks.length > 0 ? (
            <>
              <div className="grid gap-3 lg:hidden">
                {pagedBooks.map((book) => {
                  const priceDraftValue = getPriceDraftValue(book);
                  const statusDraftValue = getStatusDraftValue(book);
                  const isPriceDirty = hasBookPriceChange(book);
                  const isPriceInvalid = Number.isNaN(parsePrice(priceDraftValue));
                  const isStatusDirty = hasBookStatusChange(book);
                  const isRowBusy =
                    deletingBookId === book.id ||
                    updatingBookPriceId === book.id ||
                    updatingBookStatusId === book.id ||
                    updatingBookPublicId === book.id;

                  return (
                    <article
                      className={`card animate-rise transition ${
                        focusedBookId === book.id
                          ? "ring-2 ring-brand/40 shadow-md"
                          : ""
                      }`}
                      data-shipment-book-id={book.id}
                      key={book.id}
                      onClick={() => setFocusedBookId(book.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900">{book.title}</h3>
                          {toNullableText(book.option) ? (
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              옵션 {book.option}
                            </p>
                          ) : null}
                        </div>
                        <StatusBadge status={book.status} />
                      </div>

                      <p className="mt-2 text-sm font-semibold text-slate-600">
                        현재 판매가: <span className="text-brand">{formatCurrency(book.price)}</span>
                      </p>

                      <BookPriceEditor
                        compact={false}
                        draftValue={priceDraftValue}
                        isDirty={isPriceDirty}
                        isDisabled={isRowBusy}
                        isInvalid={isPriceInvalid}
                        isLocked={isBookPriceLocked(book)}
                        isSaving={updatingBookPriceId === book.id}
                        onChange={(value) => handlePriceDraftChange(book.id, value)}
                        onReset={() => resetBookPriceDraft(book.id)}
                        onSave={() => handleSaveBookPrice(book)}
                      />

                      <BookStatusEditor
                        compact={false}
                        draftValue={statusDraftValue}
                        isDirty={isStatusDirty}
                        isDisabled={isRowBusy}
                        isSaving={updatingBookStatusId === book.id}
                        onChange={(value) => handleStatusDraftChange(book.id, value)}
                        onReset={() => resetBookStatusDraft(book.id)}
                        onSave={() => handleSaveBookStatus(book)}
                      />

                      <BookPublicStoreEditor
                        book={book}
                        draft={getBookPublicDraftValue(book)}
                        isDirty={hasBookPublicDraftChange(book)}
                        isDisabled={isRowBusy}
                        isSaving={updatingBookPublicId === book.id}
                        validationMessage={getPublicStoreValidationMessage(
                          book,
                          getBookPublicDraftValue(book),
                        )}
                        onChange={(field, value) => handleBookPublicDraftChange(book, field, value)}
                        onReset={() => resetBookPublicDraft(book.id)}
                        onSave={() => handleSaveBookPublicDraft(book)}
                      />

                      <button
                        className="mt-3 inline-flex rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                        disabled={isRowBusy}
                        onClick={() => handleDeleteBook(book)}
                        type="button"
                      >
                        {deletingBookId === book.id ? "삭제 중..." : "책 삭제"}
                      </button>
                    </article>
                  );
                })}
              </div>

              {/* 일괄 액션 바 — 선택 시 표시 (desktop 테이블 상단) */}
              {selectedBookIds.size > 0 ? (
                <div className="hidden lg:flex mb-3 flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-sm">
                  <span className="text-sm font-bold text-amber-900">
                    {selectedBookIds.size}권 선택됨
                  </span>
                  <button
                    className="text-xs text-amber-700 underline hover:text-amber-900"
                    onClick={() => setSelectedBookIds(new Set())}
                    type="button"
                  >
                    선택 해제
                  </button>
                  <div className="flex-1" />
                  <button
                    className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing}
                    onClick={() => handleBulkBookAction("visibility-show")}
                    type="button"
                  >
                    일괄 공개
                  </button>
                  <button
                    className="text-xs font-semibold text-white bg-slate-600 hover:bg-slate-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing}
                    onClick={() => handleBulkBookAction("visibility-hide")}
                    type="button"
                  >
                    일괄 숨김
                  </button>
                  <button
                    className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing}
                    onClick={() => handleBulkBookAction("grade-set", { grade: "S" })}
                    type="button"
                  >
                    등급 S 일괄
                  </button>
                  <button
                    className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing}
                    onClick={() => handleBulkBookAction("grade-set", { grade: "A_PLUS" })}
                    type="button"
                  >
                    등급 A+ 일괄
                  </button>
                  <button
                    className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing || selectedBookIds.size === 0}
                    onClick={() => setPriceDeltaOpen(true)}
                    type="button"
                  >
                    일괄 가격 ±%
                  </button>
                  <button
                    className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md px-3 py-1.5 disabled:opacity-60"
                    disabled={bulkBookProcessing}
                    onClick={() => handleBulkBookAction("status-discarded")}
                    type="button"
                  >
                    {bulkBookProcessing ? "처리 중..." : "일괄 폐기"}
                  </button>
                </div>
              ) : null}

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="w-10 px-2 py-3 text-left">
                          <input
                            aria-label="현재 페이지 책 전체 선택"
                            checked={
                              pagedBooks.length > 0 &&
                              pagedBooks.every((b) => selectedBookIds.has(b.id))
                            }
                            onChange={toggleSelectAllVisibleBooks}
                            type="checkbox"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          책 정보
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          현재 상태
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          현재 판매가
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          판매가 수정
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          상태 변경
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedBooks.map((book) => {
                        const priceDraftValue = getPriceDraftValue(book);
                        const statusDraftValue = getStatusDraftValue(book);
                        const isPriceDirty = hasBookPriceChange(book);
                        const isPriceInvalid = Number.isNaN(parsePrice(priceDraftValue));
                        const isStatusDirty = hasBookStatusChange(book);
                        const isRowBusy =
                          deletingBookId === book.id ||
                          updatingBookPriceId === book.id ||
                          updatingBookStatusId === book.id ||
                          updatingBookPublicId === book.id;
                        const isExpanded = expandedBookId === book.id;
                        const isPublicDirty = hasBookPublicDraftChange(book);

                        return (
                          <Fragment key={book.id}>
                            <tr
                              className={`align-top transition hover:bg-slate-50 ${
                                selectedBookIds.has(book.id) ? "bg-amber-50" : ""
                              } ${isExpanded ? "bg-slate-50" : ""}`}
                            >
                              <td className="px-2 py-4">
                                <input
                                  aria-label={`${book.title} 선택`}
                                  checked={selectedBookIds.has(book.id)}
                                  onChange={() => toggleSelectBook(book.id)}
                                  type="checkbox"
                                />
                              </td>
                              <td className="px-4 py-4">
                                <p className="font-bold text-slate-900">{book.title}</p>
                                {toNullableText(book.option) ? (
                                  <p className="mt-1 text-xs font-semibold text-slate-500">
                                    옵션 {book.option}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-xs font-semibold text-slate-400">
                                    옵션 없음
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <StatusBadge status={book.status} />
                              </td>
                              <td className="px-4 py-4 font-semibold text-slate-700">
                                {formatCurrency(book.price)}
                              </td>
                              <td className="px-4 py-4">
                                <BookPriceEditor
                                  compact
                                  draftValue={priceDraftValue}
                                  isDirty={isPriceDirty}
                                  isDisabled={isRowBusy}
                                  isInvalid={isPriceInvalid}
                                  isLocked={isBookPriceLocked(book)}
                                  isSaving={updatingBookPriceId === book.id}
                                  onChange={(value) => handlePriceDraftChange(book.id, value)}
                                  onReset={() => resetBookPriceDraft(book.id)}
                                  onSave={() => handleSaveBookPrice(book)}
                                />
                              </td>
                              <td className="px-4 py-4">
                                <BookStatusEditor
                                  compact
                                  draftValue={statusDraftValue}
                                  isDirty={isStatusDirty}
                                  isDisabled={isRowBusy}
                                  isSaving={updatingBookStatusId === book.id}
                                  onChange={(value) => handleStatusDraftChange(book.id, value)}
                                  onReset={() => resetBookStatusDraft(book.id)}
                                  onSave={() => handleSaveBookStatus(book)}
                                />
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col gap-2">
                                  <button
                                    aria-expanded={isExpanded}
                                    className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-bold transition ${
                                      isExpanded
                                        ? "border-slate-400 bg-slate-100 text-slate-800"
                                        : isPublicDirty
                                          ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                    disabled={isRowBusy}
                                    onClick={() => setExpandedBookId(isExpanded ? null : book.id)}
                                    type="button"
                                  >
                                    {isExpanded
                                      ? "공개 정보 접기 ▲"
                                      : isPublicDirty
                                        ? "공개 정보 편집 (수정중) ▼"
                                        : "공개 정보 편집 ▼"}
                                  </button>
                                  <button
                                    className="inline-flex justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                                    disabled={isRowBusy}
                                    onClick={() => handleDeleteBook(book)}
                                    type="button"
                                  >
                                    {deletingBookId === book.id ? "삭제 중..." : "책 삭제"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="bg-slate-50">
                                <td className="px-4 pb-5 pt-0" colSpan={7}>
                                  <BookPublicStoreEditor
                                    book={book}
                                    draft={getBookPublicDraftValue(book)}
                                    isDirty={isPublicDirty}
                                    isDisabled={isRowBusy}
                                    isSaving={updatingBookPublicId === book.id}
                                    validationMessage={getPublicStoreValidationMessage(
                                      book,
                                      getBookPublicDraftValue(book),
                                    )}
                                    onChange={(field, value) =>
                                      handleBookPublicDraftChange(book, field, value)
                                    }
                                    onReset={() => resetBookPublicDraft(book.id)}
                                    onSave={() => handleSaveBookPublicDraft(book)}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>

      <DestructiveConfirmModal
        busy={bulkBookProcessing}
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

      <BulkPriceDeltaModal
        books={books}
        busy={bulkBookProcessing}
        onCancel={() => setPriceDeltaOpen(false)}
        onConfirm={(percent) => {
          setPriceDeltaOpen(false);
          handleBulkBookAction("price-delta", { percent });
        }}
        open={priceDeltaOpen}
        selectedIds={selectedBookIds}
      />

      {/* 상태 전이 시 알림톡 결과 — 성공/실패 명시적 노출 */}
      <NotificationResultModal
        failures={shipmentNotificationResult?.failures ?? []}
        onClose={() => setShipmentNotificationResult(null)}
        open={Boolean(shipmentNotificationResult)}
        successCount={shipmentNotificationResult?.successCount ?? 0}
        title={shipmentNotificationResult?.title ?? "알림톡 발송 결과"}
      />
    </AdminShell>
  );
}

export default AdminShipmentDetailPage;

