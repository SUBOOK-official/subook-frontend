// 재고 전수조사 엑셀 다운로드 — R2 IA 개편에서 대시보드(구 catalog 뷰)에서 이식.
// 전체 shipments/books를 페이지 단위로 걷어 셀러·상품·가격·정산여부로 그룹핑해 XLSX 생성.
// 진입점: 상품 재고(AdminProductMastersPage) 헤더 액션.
import { exportRowsToXlsx } from "./excelFile";
import { supabase } from "@shared-supabase/adminSupabaseClient";

const SHIPMENT_INDEX_PAGE_SIZE = 1000;
const BOOK_FETCH_PAGE_SIZE = 1000;
const INVENTORY_AUDIT_FILE_NAME_PREFIX = "subook-inventory-audit";
const INVENTORY_AUDIT_SHEET_NAME = "inventory_audit";
const INVENTORY_AUDIT_EXPORT_HEADERS = [
  "수거신청자",
  "상품명",
  "판매가",
  "옵션",
  "정산여부",
];

function collapseWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toNullableText(value) {
  const text = collapseWhitespace(value);
  return text === "" ? null : text;
}

function normalizeOptionalText(value) {
  const text = toNullableText(value);
  if (!text) {
    return null;
  }

  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/\s+/g, "");
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

async function fetchShipmentIndex() {
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

    shipmentIndex.push(...data);

    if (data.length < SHIPMENT_INDEX_PAGE_SIZE) {
      break;
    }

    from += SHIPMENT_INDEX_PAGE_SIZE;
  }

  return shipmentIndex;
}

async function fetchAllInventoryBooks() {
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
}

// 재고 전수조사 XLSX를 생성·다운로드하고 행 수를 반환한다. 실패 시 throw.
export async function downloadInventoryAuditXlsx() {
  const [shipmentIndex, books] = await Promise.all([
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
    throw new Error("다운로드할 책 데이터가 없습니다.");
  }

  await exportRowsToXlsx({
    rows: exportRows,
    columns: [
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[0], header: INVENTORY_AUDIT_EXPORT_HEADERS[0], width: 18 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[1], header: INVENTORY_AUDIT_EXPORT_HEADERS[1], width: 36 },
      {
        key: INVENTORY_AUDIT_EXPORT_HEADERS[2],
        header: INVENTORY_AUDIT_EXPORT_HEADERS[2],
        type: Number,
        width: 12,
      },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[3], header: INVENTORY_AUDIT_EXPORT_HEADERS[3], width: 28 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[4], header: INVENTORY_AUDIT_EXPORT_HEADERS[4], width: 12 },
    ],
    fileName: getInventoryAuditFileName(),
    sheetName: INVENTORY_AUDIT_SHEET_NAME,
  });

  return { rowCount: exportRows.length };
}
