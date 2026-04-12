import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { readSheetRowsAsObjects } from "../lib/excelFile";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { bookConditionLabel, bookStatusLabel, shipmentStatusLabel } from "@shared-domain/status";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import StatusBadge from "@shared-domain/StatusBadge";
import { notifyArrived, notifyInspectionDone } from "../lib/adminNotification";

const initialBookForm = {
  title: "",
  option: "",
  price: "",
};
const BOOKS_PAGE_SIZE = 30;

const adminBookStatusOptions = [
  { value: "on_sale", label: bookStatusLabel.on_sale },
  { value: "settled", label: bookStatusLabel.settled },
];

const adminBookConditionOptions = [
  { value: "", label: "등급 선택" },
  { value: "S", label: bookConditionLabel.S },
  { value: "A_PLUS", label: bookConditionLabel.A_PLUS },
  { value: "A", label: bookConditionLabel.A },
];

const adminBookTypeOptions = ["기출", "모의고사", "N제", "EBS", "주간지", "내신"];

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

function splitOptionValues(optionInput) {
  const optionText = toNullableText(optionInput);
  if (!optionText) {
    return [null];
  }

  const optionItems = optionText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return optionItems.length > 0 ? optionItems : [null];
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

  const payload = {
    subject: toNullableText(draft.subject),
    brand: toNullableText(draft.brand),
    book_type: toNullableText(draft.book_type),
    published_year: normalizeOptionalInteger(draft.published_year),
    instructor_name: toNullableText(draft.instructor_name),
    original_price: normalizeOptionalInteger(draft.original_price),
    condition_grade: toNullableText(draft.condition_grade),
    cover_image_url: toNullableText(draft.cover_image_url),
    inspection_image_urls: normalizeUrlList(draft.inspection_image_urls),
    writing_percentage: normalizeOptionalInteger(draft.writing_percentage),
    has_damage: hasDamage,
    inspection_notes: toNullableText(draft.inspection_notes),
    inspected_at: toNullableText(draft.inspected_at),
    is_public: Boolean(draft.is_public),
  };

  if (productId !== null) {
    payload.product_id = productId;
  }

  return payload;
}

function getPublicStoreValidationMessage(book, draft) {
  if (!Boolean(draft.is_public)) {
    return "";
  }

  const missingFields = [];
  const writingPercentage = normalizeOptionalInteger(draft.writing_percentage);
  const hasDamage = buildPublicStorePayload(draft).has_damage;

  if (!toNullableText(draft.subject)) missingFields.push("과목");
  if (!toNullableText(draft.brand)) missingFields.push("브랜드");
  if (!toNullableText(draft.book_type)) missingFields.push("유형");
  if (!normalizeOptionalInteger(draft.published_year)) missingFields.push("연도");
  if (!toNullableText(draft.condition_grade)) missingFields.push("상태등급");
  if (!toNullableText(draft.cover_image_url)) missingFields.push("표지 이미지");
  if (!normalizeOptionalInteger(draft.original_price)) missingFields.push("정가");
  if (!normalizeComparablePrice(book.price)) missingFields.push("판매가");
  if (writingPercentage === null) missingFields.push("필기 비율");
  if (hasDamage === null) missingFields.push("훼손 여부");
  if (!toNullableText(draft.inspected_at)) missingFields.push("검수일");

  if (writingPercentage !== null && (writingPercentage < 0 || writingPercentage > 100)) {
    return "필기 비율은 0~100 사이 숫자로 입력해 주세요.";
  }

  return missingFields.length > 0
    ? `공개 전환을 위해 ${missingFields.join(", ")}을(를) 입력해 주세요.`
    : "";
}

function BookPriceEditor({
  draftValue,
  isDirty,
  isInvalid,
  isSaving,
  isDisabled,
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
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="예: 12000"
          type="number"
          value={draftValue}
        />
        <button
          className={actionClass}
          disabled={isDisabled || isSaving || !isDirty || isInvalid}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "저장 중..." : "판매가 저장"}
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
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer list-none text-sm font-extrabold text-slate-800">
        공개 스토어 정보
      </summary>
      <div className="mt-4 space-y-3">
        {productId !== null || toNullableText(draft.product_title) ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="label">상품 그룹</p>
            <div className="mt-1 grid gap-1 text-sm font-semibold text-slate-700">
              <span>상품 ID: {productId !== null ? productId : "미등록"}</span>
              <span>상품명: {toNullableText(draft.product_title) || "미등록"}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
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

          <label className="block">
            <span className="label">검수일</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("inspected_at", event.target.value)}
              type="date"
              value={draft.inspected_at}
            />
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
            <span className="label">검수 사진 URL</span>
            <textarea
              className={textareaClass}
              disabled={isDisabled}
              onChange={(event) => onChange("inspection_image_urls", event.target.value)}
              placeholder="한 줄에 하나씩 입력하거나 쉼표로 구분"
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

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">필기 비율(%)</span>
            <input
              className={inputClass}
              disabled={isDisabled}
              onChange={(event) => onChange("writing_percentage", event.target.value)}
              placeholder="예: 5"
              type="number"
              value={draft.writing_percentage}
            />
          </label>

          <label className="block">
            <span className="label">훼손 여부</span>
            <select
              className={selectClass}
              disabled={isDisabled}
              onChange={(event) => onChange("has_damage", event.target.value)}
              value={draft.has_damage}
            >
              <option value="">선택해 주세요</option>
              <option value="false">없음</option>
              <option value="true">있음</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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

        <div className="flex flex-wrap items-center gap-2">
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
    </details>
  );
}

function AdminShipmentDetailPage() {
  const { shipmentId } = useParams();
  const fileInputRef = useRef(null);

  const [shipment, setShipment] = useState(null);
  const [books, setBooks] = useState([]);
  const [bookForm, setBookForm] = useState(initialBookForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [updatingBookStatusId, setUpdatingBookStatusId] = useState(null);
  const [updatingBookPriceId, setUpdatingBookPriceId] = useState(null);
  const [deletingBookId, setDeletingBookId] = useState(null);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [bookListPage, setBookListPage] = useState(1);
  const [bookPriceDrafts, setBookPriceDrafts] = useState({});
  const [bookStatusDrafts, setBookStatusDrafts] = useState({});
  const [bookPublicDrafts, setBookPublicDrafts] = useState({});
  const [updatingBookPublicId, setUpdatingBookPublicId] = useState(null);

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

  const handleUpdateShipmentStatus = async ({ nextStatus, successMessage }) => {
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

    // 알림톡 발송 (백그라운드 — 실패해도 상태 변경은 유지)
    try {
      if (nextStatus === "inspecting") {
        await notifyArrived({ shipment: { ...shipment, book_count: books.length } });
      } else if (nextStatus === "inspected") {
        await notifyInspectionDone({ shipment, books });
      }
    } catch {
      console.warn("알림톡 발송 실패 (상태 변경은 정상 처리됨)");
    }
  };

  const handleBookFormChange = (event) => {
    const { name, value } = event.target;
    setBookForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddBook = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    const title = toNullableText(bookForm.title);
    if (!title) {
      setError("책 제목을 입력해 주세요.");
      return;
    }

    const parsedPrice = parsePrice(bookForm.price);
    if (Number.isNaN(parsedPrice)) {
      setError("판매 가격은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    const optionValues = splitOptionValues(bookForm.option);
    const payload = optionValues.map((optionValue) => ({
      shipment_id: shipment.id,
      title,
      option: optionValue,
      status: "on_sale",
      price: parsedPrice,
    }));

    setActionLoading(true);
    setError("");
    setNotice("");

    const { data, error: insertError } = await supabase
      .from("books")
      .insert(payload)
      .select("*");

    if (insertError) {
      setError("책 등록에 실패했습니다.");
      setActionLoading(false);
      return;
    }

    setBooks((prev) => [...prev, ...(data ?? [])]);
    setBookForm(initialBookForm);
    setNotice(`${payload.length}권의 책이 추가되었습니다.`);
    setActionLoading(false);
  };

  const handleOpenExcelPicker = () => {
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupabaseConfigured || !shipment) {
      return;
    }

    if (!isInspected) {
      setError("검수 완료 상태에서만 엑셀 등록이 가능합니다.");
      return;
    }

    setIsBulkUploading(true);
    setError("");
    setNotice("");

    try {
      const rows = await readSheetRowsAsObjects(file);
      if (rows.length === 0) {
        setError("엑셀 파일에 데이터가 없습니다.");
        return;
      }

      const payload = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const title = toNullableText(row.Title ?? row.title ?? row.TITLE);
        if (!title) {
          continue;
        }

        const parsedPrice = parsePrice(row.Price ?? row.price ?? row.PRICE);
        if (Number.isNaN(parsedPrice)) {
          setError(`${index + 2}행 Price 값이 올바른 숫자가 아닙니다.`);
          return;
        }

        const optionValues = splitOptionValues(row.Option ?? row.option ?? row.OPTION);
        for (const optionValue of optionValues) {
          payload.push({
            shipment_id: shipment.id,
            title,
            option: optionValue,
            status: "on_sale",
            price: parsedPrice,
          });
        }
      }

      if (payload.length === 0) {
        setError("등록 가능한 Title 데이터가 없습니다.");
        return;
      }

      const { error: insertError } = await supabase.from("books").insert(payload);
      if (insertError) {
        setError("엑셀 대량 등록에 실패했습니다.");
        return;
      }

      await refreshBooks();
      setNotice(`${payload.length}권의 책을 엑셀로 등록했습니다.`);
    } catch (uploadError) {
      setError("엑셀 파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBulkUploading(false);
    }
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
      const confirmed = window.confirm(
        `이 책을 정산완료로 저장하시겠습니까?\n${formatBookLabel(book)}`,
      );
      if (!confirmed) {
        return;
      }
    }

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

  const handleDeleteBook = async (book) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const confirmed = window.confirm(
      `정말 이 책을 삭제하시겠습니까?\n${formatBookLabel(book)}`,
    );
    if (!confirmed) {
      return;
    }

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

            {isScheduled ? (
              <button
                className="btn-primary mt-2"
                disabled={actionLoading || isBulkUploading}
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
                disabled={actionLoading || isBulkUploading}
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

            {isInspected ? (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                검수 완료 상태입니다. 아래에서 책을 추가하거나 엑셀로 일괄 등록할 수 있습니다.
              </p>
            ) : null}
          </section>

          {isInspected ? (
            <section className="card animate-rise">
              <h2 className="section-title">책 추가</h2>
              <form className="mt-4 space-y-3" onSubmit={handleAddBook}>
                <label className="block">
                  <span className="label">책 제목</span>
                  <input
                    className="input-base"
                    name="title"
                    onChange={handleBookFormChange}
                    placeholder="예: 서바이벌 모의고사"
                    type="text"
                    value={bookForm.title}
                  />
                </label>

                <label className="block">
                  <span className="label">옵션(예: 1회, 2회, 상/하)</span>
                  <input
                    className="input-base"
                    name="option"
                    onChange={handleBookFormChange}
                    placeholder="예: 1회, 2회"
                    type="text"
                    value={bookForm.option}
                  />
                </label>

                <label className="block">
                  <span className="label">판매 가격(선택)</span>
                  <input
                    className="input-base"
                    name="price"
                    onChange={handleBookFormChange}
                    placeholder="예: 12000"
                    type="number"
                    value={bookForm.price}
                  />
                </label>

                <button
                  className="btn-primary"
                  disabled={actionLoading || isBulkUploading}
                  type="submit"
                >
                  {actionLoading ? "추가 중..." : "책 추가"}
                </button>
              </form>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <button
                  className="btn-secondary w-full"
                  disabled={actionLoading || isBulkUploading}
                  onClick={handleOpenExcelPicker}
                  type="button"
                >
                  {isBulkUploading ? "업로드 중..." : "엑셀로 책 등록하기"}
                </button>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  엑셀 컬럼명: `Title`, `Option`, `Price`
                </p>
                <input
                  ref={fileInputRef}
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleExcelUpload}
                  type="file"
                />
              </div>
            </section>
          ) : null}

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
                onChange={(event) => setBookSearchQuery(event.target.value)}
                placeholder="등록된 책 검색 (제목/옵션)"
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
                    isBulkUploading ||
                    updatingBookPriceId === book.id ||
                    updatingBookStatusId === book.id ||
                    updatingBookPublicId === book.id;

                  return (
                    <article className="card animate-rise" key={book.id}>
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

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
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
                          isBulkUploading ||
                          updatingBookPriceId === book.id ||
                          updatingBookStatusId === book.id ||
                          updatingBookPublicId === book.id;

                        return (
                          <tr className="align-top transition hover:bg-slate-50" key={book.id}>
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
                                onChange={(field, value) =>
                                  handleBookPublicDraftChange(book, field, value)
                                }
                                onReset={() => resetBookPublicDraft(book.id)}
                                onSave={() => handleSaveBookPublicDraft(book)}
                              />
                            </td>
                            <td className="px-4 py-4">
                              <button
                                className="inline-flex rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                                disabled={isRowBusy}
                                onClick={() => handleDeleteBook(book)}
                                type="button"
                              >
                                {deletingBookId === book.id ? "삭제 중..." : "책 삭제"}
                              </button>
                            </td>
                          </tr>
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
    </AdminShell>
  );
}

export default AdminShipmentDetailPage;

