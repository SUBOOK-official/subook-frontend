import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminSectionTabs from "../components/AdminSectionTabs";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";
import { formatDate } from "@shared-domain/format";
import StatusBadge from "@shared-domain/StatusBadge";

const PAGE_SIZE = 20;
const SHIPMENT_INDEX_PAGE_SIZE = 1000;
const SHIPMENT_BOOK_QUERY_CHUNK_SIZE = 40;
const BOOK_ID_QUERY_CHUNK_SIZE = 100;
const BOOK_FETCH_PAGE_SIZE = 1000;
const BULK_SETTLEMENT_TEMPLATE_FILE_NAME = "subook-bulk-settlement-template.xlsx";
const BULK_SETTLEMENT_PURCHASE_SELLER_KEY = "매입";
const INVENTORY_AUDIT_FILE_NAME_PREFIX = "subook-inventory-audit";
const INVENTORY_AUDIT_SHEET_NAME = "inventory_audit";
const INVENTORY_AUDIT_EXPORT_HEADERS = [
  "수거신청자",
  "상품명",
  "판매가",
  "옵션",
  "정산여부",
];

const initialForm = {
  sellerName: "",
  sellerPhone: "",
  pickupDate: "",
};

function sanitizeSearchKeyword(value) {
  return String(value ?? "")
    .trim()
    .replace(/[,%()]/g, "")
    .replace(/\s+/g, " ");
}

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

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function hasSpreadsheetValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return !Number.isNaN(value);
  }

  return String(value).trim() !== "";
}

function collapseWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toNullableText(value) {
  const text = collapseWhitespace(value);
  return text === "" ? null : text;
}

function splitBulkSettlementOptions(value) {
  const optionText = toNullableText(value);
  if (!optionText) {
    return [null];
  }

  const items = optionText
    .split(",")
    .map((item) => collapseWhitespace(item))
    .filter(Boolean);

  return items.length > 0 ? items : [optionText];
}

function normalizeOptionalText(value) {
  const text = toNullableText(value);
  if (!text) {
    return null;
  }

  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u00d7\u2715]/g, "x")
    .replace(/\s+/g, "");
}

function isBulkSettlementPurchaseRow(row) {
  return row.sellerName === BULK_SETTLEMENT_PURCHASE_SELLER_KEY;
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function parsePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return Number.NaN;
    }

    const truncated = Math.trunc(value);
    return truncated > 0 ? truncated : Number.NaN;
  }

  const normalized = String(value).replaceAll(",", "").trim();
  if (normalized === "") {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number.parseInt(normalized, 10);
  return parsed > 0 ? parsed : Number.NaN;
}

function normalizeHeaderKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

const bulkSettlementColumnAliases = {
  bookId: ["BookId", "Book ID", "book_id", "책ID", "책 ID", "도서ID", "도서 ID"].map(
    normalizeHeaderKey,
  ),
  shipmentId: [
    "ShipmentId",
    "Shipment ID",
    "shipment_id",
    "수거ID",
    "수거 ID",
    "픽업ID",
    "픽업 ID",
  ].map(normalizeHeaderKey),
  sellerPhone: [
    "SellerPhone",
    "Seller Phone",
    "seller_phone",
    "Phone",
    "phone",
    "전화번호",
    "판매자전화번호",
    "휴대폰",
  ].map(normalizeHeaderKey),
  sellerName: ["SellerName", "Seller Name", "seller_name", "판매자명", "이름"].map(
    normalizeHeaderKey,
  ),
  pickupDate: [
    "PickupDate",
    "Pickup Date",
    "pickup_date",
    "수거일",
    "수거일자",
    "픽업일",
  ].map(normalizeHeaderKey),
  title: ["Title", "title", "제목", "책제목", "도서명"].map(normalizeHeaderKey),
  option: ["Option", "option", "옵션"].map(normalizeHeaderKey),
};

function getRowValueByAliases(row, aliases) {
  const normalizedEntries = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value]),
  );

  for (const alias of aliases) {
    if (normalizedEntries.has(alias)) {
      return normalizedEntries.get(alias);
    }
  }

  return "";
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const excelEpoch = Date.UTC(1899, 11, 30);
    const nextDate = new Date(excelEpoch + Math.trunc(value) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(nextDate.getTime())) {
      return null;
    }

    return nextDate.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const isoLikeMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (isoLikeMatch) {
    const [, year, month, day] = isoLikeMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function buildBulkSettlementDescriptor(row) {
  const parts = [];

  if (row.bookId !== null) {
    parts.push(`BookId ${row.bookId}`);
  }
  if (row.shipmentId !== null) {
    parts.push(`ShipmentId ${row.shipmentId}`);
  }
  if (row.sellerPhoneText) {
    parts.push(`전화번호 ${row.sellerPhoneText}`);
  }
  if (row.sellerNameText) {
    parts.push(`판매자 ${row.sellerNameText}`);
  }
  if (row.pickupDate) {
    parts.push(`수거일 ${row.pickupDate}`);
  }
  if (row.titleText) {
    parts.push(`제목 ${row.titleText}`);
  }
  if (row.optionText) {
    parts.push(`옵션 ${row.optionText}`);
  }

  return parts.join(" / ") || "식별값 없음";
}

function parseBulkSettlementRows(rows) {
  const validRows = [];
  const invalidIssues = [];
  let blankRowCount = 0;
  let purchaseCount = 0;

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const rawBookId = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.bookId);
    const rawShipmentId = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.shipmentId);
    const rawSellerPhone = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.sellerPhone);
    const rawSellerName = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.sellerName);
    const rawPickupDate = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.pickupDate);
    const rawTitle = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.title);
    const rawOption = getRowValueByAliases(rawRow, bulkSettlementColumnAliases.option);

    const hasAnyInput = [
      rawBookId,
      rawShipmentId,
      rawSellerPhone,
      rawSellerName,
      rawPickupDate,
      rawTitle,
      rawOption,
    ].some(hasSpreadsheetValue);

    if (!hasAnyInput) {
      blankRowCount += 1;
      return;
    }

    const bookId = parsePositiveInteger(rawBookId);
    const shipmentId = parsePositiveInteger(rawShipmentId);
    const sellerPhoneText = toNullableText(rawSellerPhone);
    const sellerNameText = toNullableText(rawSellerName);
    const titleText = toNullableText(rawTitle);
    const optionText = toNullableText(rawOption);
    const optionValues = bookId === null ? splitBulkSettlementOptions(rawOption) : [optionText];
    const pickupDate = normalizeDateValue(rawPickupDate);

    const parsedRow = {
      rowNumber,
      bookId,
      shipmentId,
      sellerPhone: normalizePhone(rawSellerPhone),
      sellerPhoneText,
      sellerName: normalizeOptionalText(rawSellerName),
      sellerNameText,
      pickupDate,
      title: normalizeOptionalText(rawTitle),
      titleText,
      option: normalizeOptionalText(rawOption),
      optionText,
    };

    if (isBulkSettlementPurchaseRow(parsedRow)) {
      purchaseCount += optionValues.length;
      return;
    }

    if (Number.isNaN(bookId)) {
      invalidIssues.push({
        rowNumber,
        type: "invalid",
        message: "BookId 값은 1 이상의 숫자여야 합니다.",
        descriptor: buildBulkSettlementDescriptor(parsedRow),
      });
      return;
    }

    if (Number.isNaN(shipmentId)) {
      invalidIssues.push({
        rowNumber,
        type: "invalid",
        message: "ShipmentId 값은 1 이상의 숫자여야 합니다.",
        descriptor: buildBulkSettlementDescriptor(parsedRow),
      });
      return;
    }

    if (hasSpreadsheetValue(rawPickupDate) && !pickupDate) {
      invalidIssues.push({
        rowNumber,
        type: "invalid",
        message: "PickupDate 값을 날짜로 해석하지 못했습니다.",
        descriptor: buildBulkSettlementDescriptor(parsedRow),
      });
      return;
    }

    if (bookId === null && !titleText) {
      invalidIssues.push({
        rowNumber,
        type: "invalid",
        message: "기본 업로드 형식은 SellerName + Title이며 Option은 비워둘 수 있습니다.",
        descriptor: buildBulkSettlementDescriptor(parsedRow),
      });
      return;
    }

    const hasShipmentHint =
      shipmentId !== null ||
      Boolean(parsedRow.sellerPhone) ||
      Boolean(parsedRow.sellerName);

    if (bookId === null && !hasShipmentHint) {
      invalidIssues.push({
        rowNumber,
        type: "invalid",
        message:
          "기본 업로드 형식은 SellerName + Title이며 Option은 선택입니다. 예외 상황에서만 추가 식별 컬럼을 사용해 주세요.",
        descriptor: buildBulkSettlementDescriptor(parsedRow),
      });
      return;
    }

    optionValues.forEach((optionValue) => {
      validRows.push({
        ...parsedRow,
        option: normalizeOptionalText(optionValue),
        optionText: optionValue,
      });
    });
  });

  return { validRows, invalidIssues, blankRowCount, purchaseCount };
}

function buildBulkSettlementGroupKey(row) {
  return JSON.stringify([
    row.shipmentId ?? "",
    row.sellerPhone ?? "",
    row.sellerName ?? "",
    row.pickupDate ?? "",
    row.title ?? "",
    row.option ?? "",
  ]);
}

function matchesBulkSettlementRow(book, row) {
  if (row.bookId !== null) {
    return book.id === row.bookId;
  }

  if (!row.title || book.titleKey !== row.title) {
    return false;
  }

  if (row.shipmentId !== null && book.shipment_id !== row.shipmentId) {
    return false;
  }

  if (row.sellerPhone && book.sellerPhoneKey !== row.sellerPhone) {
    return false;
  }

  if (row.sellerName && book.sellerNameKey !== row.sellerName) {
    return false;
  }

  if (row.pickupDate && book.pickupDateKey !== row.pickupDate) {
    return false;
  }

  if (row.option === null) {
    if (book.optionKey !== null) {
      return false;
    }
  } else if (book.optionKey !== row.option) {
    return false;
  }

  return true;
}

function formatBulkSettlementIssue(issue) {
  const descriptor = issue.descriptor ? ` (${issue.descriptor})` : "";
  return `${issue.rowNumber}행: ${issue.message}${descriptor}`;
}

function getInventoryAuditStatusLabel(status) {
  return status === "settled" ? "정산완료" : "미정산";
}

function buildInventoryAuditGroupKey(book) {
  const hasOption = Boolean(toNullableText(book.option));

  return JSON.stringify([
    book.shipment_id ?? "",
    normalizeOptionalText(book.title) ?? "",
    book.price ?? "",
    book.status ?? "",
    hasOption ? "option-group" : `book-${book.id}`,
  ]);
}

function formatInventoryAuditOptionText(optionValues) {
  return optionValues
    .map((value) => toNullableText(value))
    .filter((value) => value !== null)
    .join(",");
}

function compareInventoryAuditRows(a, b) {
  const sellerCompare = a.sellerName.localeCompare(b.sellerName, "ko-KR");
  if (sellerCompare !== 0) {
    return sellerCompare;
  }

  if (a.shipmentId !== b.shipmentId) {
    return a.shipmentId - b.shipmentId;
  }

  const titleCompare = a.title.localeCompare(b.title, "ko-KR");
  if (titleCompare !== 0) {
    return titleCompare;
  }

  const priceA = typeof a.price === "number" ? a.price : -1;
  const priceB = typeof b.price === "number" ? b.price : -1;
  if (priceA !== priceB) {
    return priceA - priceB;
  }

  const statusCompare = a.settlementStatus.localeCompare(b.settlementStatus, "ko-KR");
  if (statusCompare !== 0) {
    return statusCompare;
  }

  return a.firstBookId - b.firstBookId;
}

function getInventoryAuditFileName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${INVENTORY_AUDIT_FILE_NAME_PREFIX}-${year}-${month}-${day}.xlsx`;
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const bulkSettlementInputRef = useRef(null);

  const [form, setForm] = useState(initialForm);
  const [shipments, setShipments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isBulkSettling, setIsBulkSettling] = useState(false);
  const [isInventoryExporting, setIsInventoryExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkSettlementReport, setBulkSettlementReport] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteCandidateId, setDeleteCandidateId] = useState(null);
  const [deletingShipmentId, setDeletingShipmentId] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const fetchShipments = async ({ page, searchKeyword } = {}) => {
    if (!isSupabaseConfigured) {
      return;
    }

    const targetPage = page ?? currentPage;
    const search = searchKeyword ?? appliedSearch;

    setIsLoading(true);
    setError("");

    let query = supabase.from("shipments").select("*", { count: "exact" });

    if (search) {
      query = query.or(`seller_name.ilike.%${search}%,seller_phone.ilike.%${search}`);
    }

    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: fetchError, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (fetchError) {
      setError("수거 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setShipments(data ?? []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchShipments({ page: currentPage, searchKeyword: appliedSearch });
  }, [currentPage, appliedSearch]);

  useEffect(() => {
    if (deleteCandidateId === null) {
      return;
    }

    const hasCandidate = shipments.some((shipment) => shipment.id === deleteCandidateId);
    if (!hasCandidate) {
      setDeleteCandidateId(null);
    }
  }, [deleteCandidateId, shipments]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!isSupabaseConfigured) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    if (!form.sellerName.trim() || !form.sellerPhone.trim() || !form.pickupDate) {
      setError("이름, 전화번호, 수거 일자를 모두 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    const { error: insertError } = await supabase.from("shipments").insert({
      seller_name: form.sellerName.trim(),
      seller_phone: form.sellerPhone.trim(),
      pickup_date: form.pickupDate,
      status: "scheduled",
    });

    if (insertError) {
      setError("수거 등록에 실패했습니다.");
      setIsSubmitting(false);
      return;
    }

    setForm(initialForm);
    setSuccess("새 수거 내역이 등록되었습니다.");
    setIsSubmitting(false);

    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      await fetchShipments({ page: 1, searchKeyword: appliedSearch });
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const nextSearch = sanitizeSearchKeyword(searchInput);
    setAppliedSearch(nextSearch);
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  };

  const handleSearchReset = async () => {
    setSearchInput("");
    setAppliedSearch("");
    setDeleteCandidateId(null);

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    await fetchShipments({ page: 1, searchKeyword: "" });
  };

  const handleDeleteShipment = async (shipment) => {
    if (!isSupabaseConfigured || deletingShipmentId !== null) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingShipmentId(shipment.id);

    const { error: deleteError } = await supabase
      .from("shipments")
      .delete()
      .eq("id", shipment.id);

    if (deleteError) {
      setError("수거 삭제에 실패했습니다. 관리자 삭제 권한 정책을 확인해 주세요.");
      setDeletingShipmentId(null);
      return;
    }

    const nextTotalCount = Math.max(0, totalCount - 1);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / PAGE_SIZE));
    const nextPage = Math.min(currentPage, nextTotalPages);

    setShipments((prev) => prev.filter((item) => item.id !== shipment.id));
    setTotalCount(nextTotalCount);
    setDeleteCandidateId(null);
    setSuccess(`${shipment.seller_name} 님 수거 내역을 삭제했습니다.`);
    setDeletingShipmentId(null);

    if (nextPage !== currentPage) {
      setCurrentPage(nextPage);
      return;
    }

    await fetchShipments({ page: nextPage, searchKeyword: appliedSearch });
  };

  const fetchShipmentIndex = async () => {
    const shipmentIndex = [];
    let from = 0;

    while (true) {
      const to = from + SHIPMENT_INDEX_PAGE_SIZE - 1;
      const { data, error: shipmentError } = await supabase
        .from("shipments")
        .select("id,seller_name,seller_phone,pickup_date")
        .order("id", { ascending: true })
        .range(from, to);

      if (shipmentError) {
        throw new Error("수거 목록을 불러오지 못했습니다.");
      }

      if (!data || data.length === 0) {
        break;
      }

      shipmentIndex.push(
        ...data.map((item) => ({
          ...item,
          sellerNameKey: normalizeOptionalText(item.seller_name),
          sellerPhoneKey: normalizePhone(item.seller_phone),
          pickupDateKey: normalizeDateValue(item.pickup_date),
        })),
      );

      if (data.length < SHIPMENT_INDEX_PAGE_SIZE) {
        break;
      }

      from += SHIPMENT_INDEX_PAGE_SIZE;
    }

    return shipmentIndex;
  };

  const fetchAllInventoryBooks = async () => {
    const books = [];
    let from = 0;

    while (true) {
      const to = from + BOOK_FETCH_PAGE_SIZE - 1;
      const { data, error: booksError } = await supabase
        .from("books")
        .select("id,shipment_id,title,option,status,price")
        .order("id", { ascending: true })
        .range(from, to);

      if (booksError) {
        throw new Error("재고 전수조사 대상 책 목록을 불러오지 못했습니다.");
      }

      if (!data || data.length === 0) {
        break;
      }

      books.push(...data);

      if (data.length < BOOK_FETCH_PAGE_SIZE) {
        break;
      }

      from += BOOK_FETCH_PAGE_SIZE;
    }

    return books;
  };

  const fetchCandidateBooks = async (parsedRows) => {
    const shipmentIndex = await fetchShipmentIndex();
    const shipmentMap = new Map(shipmentIndex.map((shipment) => [shipment.id, shipment]));
    const candidateShipmentIds = new Set();

    parsedRows.forEach((row) => {
      if (row.bookId !== null) {
        return;
      }

      shipmentIndex.forEach((shipment) => {
        if (row.shipmentId !== null && shipment.id !== row.shipmentId) {
          return;
        }

        if (row.sellerPhone && shipment.sellerPhoneKey !== row.sellerPhone) {
          return;
        }

        if (row.sellerName && shipment.sellerNameKey !== row.sellerName) {
          return;
        }

        if (row.pickupDate && shipment.pickupDateKey !== row.pickupDate) {
          return;
        }

        candidateShipmentIds.add(shipment.id);
      });
    });

    const candidateBookMap = new Map();

    for (const shipmentIdChunk of chunkArray(
      [...candidateShipmentIds],
      SHIPMENT_BOOK_QUERY_CHUNK_SIZE,
    )) {
      let from = 0;

      while (true) {
        const to = from + BOOK_FETCH_PAGE_SIZE - 1;
        const { data, error: booksError } = await supabase
          .from("books")
          .select("id,shipment_id,title,option,status")
          .in("shipment_id", shipmentIdChunk)
          .order("id", { ascending: true })
          .range(from, to);

        if (booksError) {
          throw new Error("정산 대상 책 목록을 불러오지 못했습니다.");
        }

        (data ?? []).forEach((book) => {
          candidateBookMap.set(book.id, book);
        });

        if (!data || data.length < BOOK_FETCH_PAGE_SIZE) {
          break;
        }

        from += BOOK_FETCH_PAGE_SIZE;
      }
    }

    const directBookIds = [
      ...new Set(
        parsedRows
          .filter((row) => row.bookId !== null)
          .map((row) => row.bookId)
          .filter((bookId) => typeof bookId === "number"),
      ),
    ];

    for (const bookIdChunk of chunkArray(directBookIds, BOOK_ID_QUERY_CHUNK_SIZE)) {
      const { data, error: booksError } = await supabase
        .from("books")
        .select("id,shipment_id,title,option,status")
        .in("id", bookIdChunk);

      if (booksError) {
        throw new Error("책 ID 기준 조회에 실패했습니다.");
      }

      (data ?? []).forEach((book) => {
        candidateBookMap.set(book.id, book);
        if (!shipmentMap.has(book.shipment_id)) {
          candidateShipmentIds.add(book.shipment_id);
        }
      });
    }

    const missingShipmentIds = [...candidateShipmentIds].filter(
      (shipmentId) => !shipmentMap.has(shipmentId),
    );

    for (const shipmentIdChunk of chunkArray(missingShipmentIds, SHIPMENT_BOOK_QUERY_CHUNK_SIZE)) {
      const { data, error: shipmentError } = await supabase
        .from("shipments")
        .select("id,seller_name,seller_phone,pickup_date")
        .in("id", shipmentIdChunk);

      if (shipmentError) {
        throw new Error("책에 연결된 수거 정보를 불러오지 못했습니다.");
      }

      (data ?? []).forEach((item) => {
        shipmentMap.set(item.id, {
          ...item,
          sellerNameKey: normalizeOptionalText(item.seller_name),
          sellerPhoneKey: normalizePhone(item.seller_phone),
          pickupDateKey: normalizeDateValue(item.pickup_date),
        });
      });
    }

    return [...candidateBookMap.values()].map((book) => {
      const shipment = shipmentMap.get(book.shipment_id) ?? null;

      return {
        ...book,
        shipment,
        titleKey: normalizeOptionalText(book.title),
        optionKey: normalizeOptionalText(book.option),
        sellerNameKey: shipment?.sellerNameKey ?? null,
        sellerPhoneKey: shipment?.sellerPhoneKey ?? null,
        pickupDateKey: shipment?.pickupDateKey ?? null,
      };
    });
  };

  const handleOpenBulkSettlementPicker = () => {
    bulkSettlementInputRef.current?.click();
  };

  const handleDownloadSettlementTemplate = async () => {
    try {
      const xlsx = await import("xlsx");
      const templateRows = [
        {
          SellerName: "홍길동",
          Title: "수학의 정석",
          Option: "상,하",
        },
        {
          SellerName: "김민수",
          Title: "영어 기출",
          Option: "",
        },
      ];

      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(templateRows);
      xlsx.utils.book_append_sheet(workbook, worksheet, "bulk_settlement");
      xlsx.writeFile(workbook, BULK_SETTLEMENT_TEMPLATE_FILE_NAME);
    } catch (_error) {
      setError("엑셀 템플릿을 생성하지 못했습니다.");
    }
  };

  const handleDownloadInventoryAudit = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    setError("");
    setSuccess("");
    setIsInventoryExporting(true);

    try {
      const [xlsx, shipmentIndex, books] = await Promise.all([
        import("xlsx"),
        fetchShipmentIndex(),
        fetchAllInventoryBooks(),
      ]);
      const shipmentMap = new Map(shipmentIndex.map((shipment) => [shipment.id, shipment]));
      const groupedRows = new Map();

      books.forEach((book) => {
        const shipment = shipmentMap.get(book.shipment_id);
        if (!shipment) {
          return;
        }

        const groupKey = buildInventoryAuditGroupKey(book);
        const existingRow = groupedRows.get(groupKey);

        if (existingRow) {
          existingRow.options.push(book.option);
          return;
        }

        groupedRows.set(groupKey, {
          shipmentId: shipment.id,
          sellerName: collapseWhitespace(shipment.seller_name),
          title: collapseWhitespace(book.title),
          price: book.price,
          options: [book.option],
          settlementStatus: getInventoryAuditStatusLabel(book.status),
          firstBookId: book.id,
        });
      });

      const exportRows = [...groupedRows.values()]
        .sort(compareInventoryAuditRows)
        .map((row) => ({
          [INVENTORY_AUDIT_EXPORT_HEADERS[0]]: row.sellerName,
          [INVENTORY_AUDIT_EXPORT_HEADERS[1]]: row.title,
          [INVENTORY_AUDIT_EXPORT_HEADERS[2]]: row.price ?? "",
          [INVENTORY_AUDIT_EXPORT_HEADERS[3]]: formatInventoryAuditOptionText(row.options),
          [INVENTORY_AUDIT_EXPORT_HEADERS[4]]: row.settlementStatus,
        }));

      if (exportRows.length === 0) {
        setError("다운로드할 책 데이터가 없습니다.");
        return;
      }

      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(exportRows, {
        header: INVENTORY_AUDIT_EXPORT_HEADERS,
      });

      worksheet["!cols"] = [
        { wch: 18 },
        { wch: 36 },
        { wch: 12 },
        { wch: 28 },
        { wch: 12 },
      ];

      if (worksheet["!ref"]) {
        worksheet["!autofilter"] = { ref: worksheet["!ref"] };
      }

      xlsx.utils.book_append_sheet(workbook, worksheet, INVENTORY_AUDIT_SHEET_NAME);
      xlsx.writeFile(workbook, getInventoryAuditFileName());
      setSuccess(`${exportRows.length}행 재고 전수조사 엑셀을 다운로드했습니다.`);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "재고 전수조사 엑셀을 생성하지 못했습니다.",
      );
    } finally {
      setIsInventoryExporting(false);
    }
  };

  const handleBulkSettlementUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    setError("");
    setSuccess("");
    setBulkSettlementReport(null);
    setIsBulkSettling(true);

    try {
      const fileBuffer = await file.arrayBuffer();
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(fileBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      if (!worksheet) {
        setError("엑셀 파일에서 시트를 찾지 못했습니다.");
        return;
      }

      const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
      if (rawRows.length === 0) {
        setError("엑셀 파일에 데이터가 없습니다.");
        return;
      }

      const { validRows, invalidIssues, blankRowCount, purchaseCount } =
        parseBulkSettlementRows(rawRows);
      const purchaseNotice =
        purchaseCount > 0 ? ` 매입 ${purchaseCount}건은 정산 대상에서 제외했습니다.` : "";

      if (validRows.length === 0) {
        setBulkSettlementReport({
          totalRowCount: rawRows.length,
          blankRowCount,
          purchaseCount,
          invalidCount: invalidIssues.length,
          duplicateCount: 0,
          updatedCount: 0,
          alreadySettledCount: 0,
          ambiguousCount: 0,
          notFoundCount: 0,
          issuePreview: invalidIssues.map(formatBulkSettlementIssue),
        });
        if (invalidIssues.length === 0 && purchaseCount > 0) {
          setSuccess(`매입 ${purchaseCount}건을 제외하고 처리할 정산 대상은 없었습니다.`);
        } else {
          setError(`처리 가능한 행이 없습니다. 템플릿 형식을 확인해 주세요.${purchaseNotice}`);
        }
        return;
      }

      const candidateBooks = await fetchCandidateBooks(validRows);
      const assignedBookIds = new Set();
      const updateBookIds = [];
      const duplicateIssues = [];
      const ambiguousIssues = [];
      const notFoundIssues = [];
      let alreadySettledCount = 0;

      validRows
        .filter((row) => row.bookId !== null)
        .forEach((row) => {
          const matchingBooks = candidateBooks.filter((book) => matchesBulkSettlementRow(book, row));
          if (matchingBooks.length === 0) {
            notFoundIssues.push({
              rowNumber: row.rowNumber,
              type: "not_found",
              message: "BookId에 해당하는 책을 찾지 못했습니다.",
              descriptor: buildBulkSettlementDescriptor(row),
            });
            return;
          }

          const [matchedBook] = matchingBooks;
          if (assignedBookIds.has(matchedBook.id)) {
            duplicateIssues.push({
              rowNumber: row.rowNumber,
              type: "duplicate",
              message: "같은 BookId가 파일 안에서 중복되었습니다.",
              descriptor: buildBulkSettlementDescriptor(row),
            });
            return;
          }

          assignedBookIds.add(matchedBook.id);
          if (matchedBook.status === "settled") {
            alreadySettledCount += 1;
            return;
          }

          updateBookIds.push(matchedBook.id);
        });

      const groupedRows = new Map();
      validRows
        .filter((row) => row.bookId === null)
        .forEach((row) => {
          const groupKey = buildBulkSettlementGroupKey(row);
          const existingRows = groupedRows.get(groupKey) ?? [];
          existingRows.push(row);
          groupedRows.set(groupKey, existingRows);
        });

      groupedRows.forEach((rowsInGroup) => {
        const sampleRow = rowsInGroup[0];
        const allMatchingBooks = candidateBooks.filter((book) => matchesBulkSettlementRow(book, sampleRow));
        const remainingBooks = allMatchingBooks.filter((book) => !assignedBookIds.has(book.id));
        const availableBooks = remainingBooks.filter((book) => book.status !== "settled");
        const settledBooks = remainingBooks.filter((book) => book.status === "settled");

        if (availableBooks.length > rowsInGroup.length) {
          rowsInGroup.forEach((row) => {
            ambiguousIssues.push({
              rowNumber: row.rowNumber,
              type: "ambiguous",
              message:
                "같은 조건으로 찾은 미정산 책이 여러 권입니다. Option, PickupDate, ShipmentId 등을 추가해 주세요.",
              descriptor: buildBulkSettlementDescriptor(row),
            });
          });
          return;
        }

        const rowsToUpdate = rowsInGroup.slice(0, availableBooks.length);
        rowsToUpdate.forEach((_row, index) => {
          const matchedBook = availableBooks[index];
          assignedBookIds.add(matchedBook.id);
          updateBookIds.push(matchedBook.id);
        });

        const remainingRows = rowsInGroup.slice(availableBooks.length);
        const settledRows = remainingRows.slice(0, settledBooks.length);
        settledRows.forEach((_row, index) => {
          const matchedBook = settledBooks[index];
          assignedBookIds.add(matchedBook.id);
          alreadySettledCount += 1;
        });

        remainingRows.slice(settledBooks.length).forEach((row) => {
          notFoundIssues.push({
            rowNumber: row.rowNumber,
            type: "not_found",
            message: "조건에 맞는 책을 찾지 못했거나, 파일에 적힌 수량보다 일치하는 책 수가 부족합니다.",
            descriptor: buildBulkSettlementDescriptor(row),
          });
        });
      });

      if (updateBookIds.length > 0) {
        for (const bookIdChunk of chunkArray(updateBookIds, BOOK_ID_QUERY_CHUNK_SIZE)) {
          const { error: updateError } = await supabase
            .from("books")
            .update({ status: "settled" })
            .in("id", bookIdChunk);

          if (updateError) {
            throw new Error("일괄 정산 완료 업데이트에 실패했습니다.");
          }
        }
      }

      const issuePreview = [
        ...invalidIssues,
        ...duplicateIssues,
        ...ambiguousIssues,
        ...notFoundIssues,
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .map(formatBulkSettlementIssue);

      setBulkSettlementReport({
        totalRowCount: rawRows.length,
        blankRowCount,
        purchaseCount,
        invalidCount: invalidIssues.length,
        duplicateCount: duplicateIssues.length,
        updatedCount: updateBookIds.length,
        alreadySettledCount,
        ambiguousCount: ambiguousIssues.length,
        notFoundCount: notFoundIssues.length,
        issuePreview,
      });

      if (updateBookIds.length > 0) {
        setSuccess(`${updateBookIds.length}권을 정산 완료로 변경했습니다.${purchaseNotice}`);
      } else if (alreadySettledCount > 0 && issuePreview.length === 0 && invalidIssues.length === 0) {
        setSuccess(`업로드한 책은 이미 모두 정산 완료 상태였습니다.${purchaseNotice}`);
      } else {
        setSuccess(`엑셀 일괄 정산 처리를 마쳤습니다.${purchaseNotice}`);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "엑셀 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBulkSettling(false);
    }
  };

  const handleSignOut = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    navigate("/admin/login", { replace: true });
  };

  return (
    <main className="app-shell-admin">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Admin</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            수거 등록/관리
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            등록, 조회, 상태 변경을 한 화면에서 빠르게 관리할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn-secondary !px-3 !py-2 text-xs" href={sellerPortalUrl}>
            판매자 화면
          </a>
          <button
            className="btn-secondary !px-3 !py-2 text-xs"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            {isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </header>

      <AdminSectionTabs />

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="card animate-rise h-full">
          <h2 className="section-title">수거 등록</h2>
          <p className="mt-1 text-sm text-slate-500">
            등록 시 상태는 자동으로 수거예정으로 저장됩니다.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block">
              <span className="label">판매자 이름</span>
              <input
                className="input-base"
                name="sellerName"
                onChange={handleChange}
                placeholder="홍길동"
                type="text"
                value={form.sellerName}
              />
            </label>

            <label className="block">
              <span className="label">전화번호</span>
              <input
                className="input-base"
                name="sellerPhone"
                onChange={handleChange}
                placeholder="01012345678"
                type="tel"
                value={form.sellerPhone}
              />
            </label>

            <label className="block">
              <span className="label">수거 일자</span>
              <input
                className="input-base"
                name="pickupDate"
                onChange={handleChange}
                type="date"
                value={form.pickupDate}
              />
            </label>

            <button className="btn-primary" disabled={isSubmitting || isBulkSettling} type="submit">
              {isSubmitting ? "등록 중..." : "수거 등록"}
            </button>
          </form>
        </section>

        <section className="card animate-rise h-full">
          <h2 className="section-title">판매자 검색</h2>
          <p className="mt-1 text-sm text-slate-500">
            이름 또는 전화번호 뒷자리로 조회할 수 있습니다.
          </p>

          <form className="mt-3 flex gap-2" onSubmit={handleSearchSubmit}>
            <input
              className="input-base !mt-0 !min-w-0 !flex-1 !py-2.5"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="예: 홍길동 / 5678"
              type="text"
              value={searchInput}
            />
            <button
              className="btn-secondary !w-auto !shrink-0 !whitespace-nowrap !px-4 !py-2.5"
              type="submit"
            >
              검색
            </button>
          </form>

          {appliedSearch ? (
            <button
              className="mt-2 text-sm font-bold text-brand underline"
              onClick={handleSearchReset}
              type="button"
            >
              검색 초기화
            </button>
          ) : null}
        </section>
      </div>
      {error ? <p className="notice-error mb-4">{error}</p> : null}
      {success ? <p className="notice-success mb-4">{success}</p> : null}

      <section className="card animate-rise mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">재고 전수조사 엑셀</h2>
            <p className="mt-1 text-sm text-slate-500">
              현재 DB 기준으로 수거신청자, 상품명, 판매가, 옵션, 정산여부를 엑셀로 내려받습니다.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              같은 수거 건 안에서 동일한 상품명, 판매가, 정산상태의 옵션은 `상,하`처럼 쉼표로 묶어 한 줄로 정리합니다.
            </p>
          </div>

          <button
            className="btn-primary !w-auto !px-4 !py-2.5 text-sm"
            disabled={isInventoryExporting || isBulkSettling}
            onClick={handleDownloadInventoryAudit}
            type="button"
          >
            {isInventoryExporting ? "엑셀 생성 중..." : "엑셀 다운로드"}
          </button>
        </div>
      </section>

      <section className="card animate-rise mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">일괄 정산 완료</h2>
            <p className="mt-1 text-sm text-slate-500">
              엑셀 한 장으로 여러 판매자의 책을 한 번에 정산 완료 처리할 수 있습니다.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              공식 업로드 컬럼: `SellerName`, `Title`, `Option(선택)`
              <br />
              `Option`이 없는 책은 비워둘 수 있고, 같은 제목의 여러 옵션은 `상,하`처럼 쉼표로 구분할 수 있습니다.
              <br />
              `SellerName`이 `매입`인 행은 정산 대상에서 제외하고 별도로 카운트합니다.
              <br />
              추가 식별 컬럼은 예외 상황에서만 내부적으로 지원합니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary !w-auto !px-4 !py-2.5 text-sm"
              disabled={isBulkSettling || isInventoryExporting}
              onClick={handleDownloadSettlementTemplate}
              type="button"
            >
              템플릿 다운로드
            </button>
            <button
              className="btn-primary !w-auto !px-4 !py-2.5 text-sm"
              disabled={isBulkSettling || isInventoryExporting}
              onClick={handleOpenBulkSettlementPicker}
              type="button"
            >
              {isBulkSettling ? "정산 처리 중..." : "엑셀 업로드"}
            </button>
          </div>
        </div>

        <input
          ref={bulkSettlementInputRef}
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleBulkSettlementUpload}
          type="file"
        />

        {bulkSettlementReport ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">정산 완료</p>
                <p className="mt-1 text-xl font-black text-brand">
                  {bulkSettlementReport.updatedCount}권
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">이미 완료</p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {bulkSettlementReport.alreadySettledCount}권
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">확인 필요</p>
                <p className="mt-1 text-xl font-black text-amber-600">
                  {bulkSettlementReport.ambiguousCount + bulkSettlementReport.notFoundCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">형식 오류</p>
                <p className="mt-1 text-xl font-black text-rose-600">
                  {bulkSettlementReport.invalidCount + bulkSettlementReport.duplicateCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">매입 제외</p>
                <p className="mt-1 text-xl font-black text-slate-700">
                  {bulkSettlementReport.purchaseCount}건
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              총 {bulkSettlementReport.totalRowCount}행 처리
              {bulkSettlementReport.blankRowCount > 0
                ? ` · 빈 행 ${bulkSettlementReport.blankRowCount}개 제외`
                : ""}
              {bulkSettlementReport.purchaseCount > 0
                ? ` · 매입 ${bulkSettlementReport.purchaseCount}건 제외`
                : ""}
            </p>

            {bulkSettlementReport.issuePreview.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-bold text-amber-800">확인 필요한 행</p>
                <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1 text-xs font-semibold text-amber-900">
                  {bulkSettlementReport.issuePreview.map((message, index) => (
                    <li key={`${index}-${message}`}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                확인 필요한 행 없이 처리되었습니다.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="section-title">수거 목록</h2>
          <p className="text-xs font-semibold text-slate-500">총 {totalCount}건</p>
        </div>

        {isLoading ? <p className="text-sm text-slate-500">불러오는 중...</p> : null}

        {!isLoading && shipments.length === 0 ? (
          <div className="card text-sm font-semibold text-slate-500">조회 결과가 없습니다.</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shipments.map((shipment) => {
            const isDeleteConfirmOpen = deleteCandidateId === shipment.id;
            const isDeletingThisShipment = deletingShipmentId === shipment.id;
            const isDeletePending = deletingShipmentId !== null;

            return (
              <article
                className="card animate-rise transition hover:ring-brand/30"
                key={shipment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">
                      {shipment.seller_name}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">{shipment.seller_phone}</p>
                  </div>
                  <StatusBadge type="shipment" status={shipment.status} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  수거 일자: <span className="text-brand">{formatDate(shipment.pickup_date)}</span>
                </p>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                      to={`/admin/shipments/${shipment.id}`}
                    >
                      상세 보기
                    </Link>

                    {!isDeleteConfirmOpen ? (
                      <button
                        className="inline-flex rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeletePending || isBulkSettling}
                        onClick={() => {
                          setDeleteCandidateId(shipment.id);
                          setError("");
                          setSuccess("");
                        }}
                        type="button"
                      >
                        수거 삭제
                      </button>
                    ) : (
                      <button
                        className="btn-secondary !w-auto !px-3 !py-2 text-xs"
                        disabled={isDeletePending || isBulkSettling}
                        onClick={() => setDeleteCandidateId(null)}
                        type="button"
                      >
                        삭제 취소
                      </button>
                    )}
                  </div>

                  {isDeleteConfirmOpen ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs font-semibold text-rose-700">
                        이 수거 내역을 삭제하면 연결된 책 목록도 함께 삭제됩니다.
                      </p>
                      <button
                        className="mt-2 inline-flex rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeletePending || isBulkSettling}
                        onClick={() => handleDeleteShipment(shipment)}
                        type="button"
                      >
                        {isDeletingThisShipment ? "삭제 중..." : "영구 삭제 확인"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-center gap-1">
          <button
            className="btn-secondary !w-auto !px-3 !py-2 text-xs"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
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
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            type="button"
          >
            다음
          </button>
        </nav>
      ) : null}
    </main>
  );
}

export default AdminDashboardPage;
