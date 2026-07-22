// 재고 전수조사 엑셀 다운로드 — R2 IA 개편에서 대시보드(구 catalog 뷰)에서 이식.
// 2026-07-18 재고 실사 이관: 운영 구글시트("새 DB")와 동일한 1권=1행 형식으로 개편.
//   일련번호·위치가 실물 피킹 기준이므로 그룹핑 없이 권 단위로 내려받는다.
// 진입점: 상품 재고(AdminProductMastersPage) 헤더 액션.
import { exportRowsToXlsx } from "./excelFile";
import { supabase } from "@shared-supabase/adminSupabaseClient";

const SHIPMENT_INDEX_PAGE_SIZE = 1000;
const BOOK_FETCH_PAGE_SIZE = 1000;
const INVENTORY_AUDIT_FILE_NAME_PREFIX = "subook-inventory-audit";
const INVENTORY_AUDIT_SHEET_NAME = "inventory_audit";
// 운영 구글시트 "새 DB(3/30~)" 탭과 동일한 열 순서 (2026-07-20: 판매가·옵션 순서 교정).
// 등록일은 기간 추출 확인용으로 맨 뒤에 추가 (2026-07-22) — 시트 열 순서는 그대로 유지.
const INVENTORY_AUDIT_EXPORT_HEADERS = [
  "일련번호",
  "위치",
  "수거신청자",
  "상품명",
  "판매가",
  "옵션",
  "판매완료여부",
  "등록일",
];

// KST 기준 YYYY-MM-DD (books.created_at → 등록일 표기·필터 경계)
function toKstDateStr(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  } catch {
    return "";
  }
}

function nextDayStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function collapseWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// 책 상태 → 운영 용어 (셀러 입금 여부는 정산 레코드가 별도 추적하므로 '판매완료'로 표기)
const BOOK_EXPORT_STATUS_LABEL = {
  on_sale: "재고",
  reserved: "주문 진행중",
  settled: "판매완료",
  discarded: "폐기",
};

function getInventoryAuditStatusLabel(status) {
  return BOOK_EXPORT_STATUS_LABEL[status] ?? status;
}

// 일련번호 오름차순(미지정은 뒤로) → 셀러 → 상품명 → id
function compareInventoryAuditRows(a, b) {
  const serialA = typeof a.serialNumber === "number" ? a.serialNumber : Number.POSITIVE_INFINITY;
  const serialB = typeof b.serialNumber === "number" ? b.serialNumber : Number.POSITIVE_INFINITY;
  if (serialA !== serialB) {
    return serialA - serialB;
  }

  const sellerCompare = a.sellerName.localeCompare(b.sellerName, "ko-KR");
  if (sellerCompare !== 0) {
    return sellerCompare;
  }

  const titleCompare = a.title.localeCompare(b.title, "ko-KR");
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return a.bookId - b.bookId;
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

async function fetchAllInventoryBooks({ fromDate, toDate } = {}) {
  const books = [];
  let from = 0;

  while (true) {
    const to = from + BOOK_FETCH_PAGE_SIZE - 1;
    let query = supabase
      .from("books")
      .select("id,shipment_id,title,option,status,price,serial_number,location,created_at")
      .order("id", { ascending: true })
      .range(from, to);
    // 등록일(KST) 범위 필터 — from 당일 00:00 이상, to 다음날 00:00 미만
    if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00+09:00`);
    if (toDate) query = query.lt("created_at", `${nextDayStr(toDate)}T00:00:00+09:00`);
    const { data, error: booksError } = await query;

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
// fromDate/toDate(YYYY-MM-DD, KST)는 등록일 범위, sellerQuery는 수거신청자(책 주인)
// 이름·전화 부분 일치 필터 (2026-07-23 운영자 피드백: 사용자별 재고 엑셀).
export async function downloadInventoryAuditXlsx({ fromDate = null, toDate = null, sellerQuery = null } = {}) {
  const [shipmentIndex, books] = await Promise.all([
    fetchShipmentIndex(),
    fetchAllInventoryBooks({ fromDate, toDate }),
  ]);
  const shipmentMap = new Map(shipmentIndex.map((shipment) => [shipment.id, shipment]));
  const normalizedSellerQuery = collapseWhitespace(sellerQuery ?? "").toLowerCase();

  const exportRows = books
    .map((book) => {
      const shipment = shipmentMap.get(book.shipment_id);
      if (!shipment) {
        return null;
      }

      if (normalizedSellerQuery) {
        const haystack = `${collapseWhitespace(shipment.seller_name)} ${collapseWhitespace(shipment.seller_phone)}`.toLowerCase();
        if (!haystack.includes(normalizedSellerQuery)) {
          return null;
        }
      }

      return {
        bookId: book.id,
        serialNumber: book.serial_number,
        location: collapseWhitespace(book.location),
        sellerName: collapseWhitespace(shipment.seller_name),
        title: collapseWhitespace(book.title),
        option: collapseWhitespace(book.option),
        price: book.price,
        settlementStatus: getInventoryAuditStatusLabel(book.status),
        createdDate: toKstDateStr(book.created_at),
      };
    })
    .filter(Boolean)
    .sort(compareInventoryAuditRows)
    .map((row) => ({
      [INVENTORY_AUDIT_EXPORT_HEADERS[0]]: row.serialNumber ?? "",
      [INVENTORY_AUDIT_EXPORT_HEADERS[1]]: row.location,
      [INVENTORY_AUDIT_EXPORT_HEADERS[2]]: row.sellerName,
      [INVENTORY_AUDIT_EXPORT_HEADERS[3]]: row.title,
      [INVENTORY_AUDIT_EXPORT_HEADERS[4]]: row.price ?? "",
      [INVENTORY_AUDIT_EXPORT_HEADERS[5]]: row.option,
      [INVENTORY_AUDIT_EXPORT_HEADERS[6]]: row.settlementStatus,
      [INVENTORY_AUDIT_EXPORT_HEADERS[7]]: row.createdDate,
    }));

  if (exportRows.length === 0) {
    throw new Error(
      normalizedSellerQuery || fromDate || toDate
        ? "조건에 맞는 책이 없습니다. 필터(등록일·수거신청자)를 확인해 주세요."
        : "다운로드할 책 데이터가 없습니다.",
    );
  }

  await exportRowsToXlsx({
    rows: exportRows,
    columns: [
      {
        key: INVENTORY_AUDIT_EXPORT_HEADERS[0],
        header: INVENTORY_AUDIT_EXPORT_HEADERS[0],
        type: Number,
        width: 10,
      },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[1], header: INVENTORY_AUDIT_EXPORT_HEADERS[1], width: 10 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[2], header: INVENTORY_AUDIT_EXPORT_HEADERS[2], width: 14 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[3], header: INVENTORY_AUDIT_EXPORT_HEADERS[3], width: 42 },
      {
        key: INVENTORY_AUDIT_EXPORT_HEADERS[4],
        header: INVENTORY_AUDIT_EXPORT_HEADERS[4],
        type: Number,
        width: 12,
      },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[5], header: INVENTORY_AUDIT_EXPORT_HEADERS[5], width: 16 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[6], header: INVENTORY_AUDIT_EXPORT_HEADERS[6], width: 12 },
      { key: INVENTORY_AUDIT_EXPORT_HEADERS[7], header: INVENTORY_AUDIT_EXPORT_HEADERS[7], width: 12 },
    ],
    fileName: getInventoryAuditFileName(),
    sheetName: INVENTORY_AUDIT_SHEET_NAME,
  });

  return { rowCount: exportRows.length };
}
