// 판매내역 엑셀 다운로드 — 운영 구글시트 "판매내역(6/8~)" 탭(식스샵 내보내기 양식)과
// 동일한 열 구조로 생성한다. 시트에 행을 그대로 복사해 붙일 수 있는 것이 목적.
// 자동 기록(DB 트리거 → Apps Script, 20260720134859)과 같은 필드를 채우고 모르는 열은 빈 값.
// 진입점: 주문 관리(AdminOrdersPage) 필터 바 — 현재 필터(검색·상태·기간) 그대로 반영.
import { exportRowsToXlsx } from "./excelFile";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { orderStatusLabel } from "@shared-domain/status";

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ORDERS = 10000;

// 식스샵 주문 내보내기 열 구조 (시트 1행 헤더와 동일, 순서 중요)
const SALES_SHEET_HEADERS = [
  "주문 번호",
  "주문 상태",
  "주문 일시",
  "판매 채널",
  "연동 마켓 ID",
  "연동 마켓 계정 별칭",
  "품목 주문 번호",
  "품목 주문 처리 상태",
  "상품 고유 ID",
  "상품 관리 코드",
  "상품 이름",
  "상품 옵션 정보",
  "품목 관리 코드",
  "상품 추가 옵션 정보",
  "재고 SKU",
  "단일 정가",
  "상품 할인 금액",
  "단일 판매가",
  "구매 수량",
  "상품 총액",
  "배송 방식 이름",
  "배송비 계산 방식",
  "배송비",
  "지역별 배송비",
  "상품 합계 금액",
  "할인 수단1",
  "할인 수단1 - 할인 가격",
  "주문 할인 합계 금액",
  "배송비 할인 금액",
  "주문 금액",
  "결제 상태",
  "결제 완료 금액",
  "환불 총액",
  "결제1 - 결제 수단",
  "결제1 - 결제 금액",
  "결제1 - 결제 일시",
  "결제1 - 환불 금액",
  "결제2 - 결제 수단",
  "결제2 - 결제 금액",
  "결제2 - 결제 일시",
  "결제2 - 환불 금액",
  "회원 여부",
  "회원 등급",
  "주문자명",
  "주문자 이메일",
  "주문자 핸드폰 번호",
  "수령인 이름",
  "수령인 핸드폰 번호",
  "우편번호",
  "주소",
  "상품 위치",
  "정산자명",
];

const NUMBER_HEADERS = new Set([
  "단일 정가",
  "상품 할인 금액",
  "단일 판매가",
  "구매 수량",
  "상품 총액",
  "배송비",
  "지역별 배송비",
  "상품 합계 금액",
  "할인 수단1 - 할인 가격",
  "주문 할인 합계 금액",
  "배송비 할인 금액",
  "주문 금액",
  "결제 완료 금액",
  "환불 총액",
  "결제1 - 결제 금액",
  "결제1 - 환불 금액",
  "결제2 - 결제 금액",
  "결제2 - 환불 금액",
]);

const WIDE_HEADERS = { "상품 이름": 42, 주소: 36, "상품 옵션 정보": 20, "주문 일시": 20, "결제1 - 결제 일시": 20 };

const PAYMENT_METHOD_LABEL = {
  bank_transfer: "무통장 입금",
  card: "카드(토스)",
  toss_pay: "토스페이",
  kakao_pay: "카카오페이",
  naver_pay: "네이버페이",
};

// KST "YYYY-MM-DD HH:mm:ss" — 시트의 주문 일시 표기와 동일 (sv-SE 로케일이 이 형태를 냄)
function formatKstDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function buildSalesRow(order, item) {
  const paidAtIso = order.paid_at ?? order.pg_approved_at ?? null;
  const isPaid = Boolean(paidAtIso) || !["pending", "cancelled"].includes(order.status);

  const row = {};
  SALES_SHEET_HEADERS.forEach((header) => {
    row[header] = "";
  });

  row["주문 번호"] = order.order_number ?? "";
  row["주문 상태"] = orderStatusLabel[order.status] ?? order.status ?? "";
  row["주문 일시"] = formatKstDateTime(order.created_at);
  row["판매 채널"] = "수북 웹";
  row["상품 이름"] = item.title ?? "";
  row["상품 옵션 정보"] = item.option_label ?? "";
  row["단일 판매가"] = item.unit_price ?? "";
  row["구매 수량"] = item.quantity ?? "";
  row["상품 총액"] = item.total_price ?? "";
  row["배송 방식 이름"] = "일반택배";
  row["배송비"] = order.shipping_fee ?? "";
  row["상품 합계 금액"] = order.subtotal ?? "";
  // 포인트(2026-09-02)도 수북 부담 할인 — 시트의 할인 합계에 포함
  row["주문 할인 합계 금액"] =
    (order.discount_amount ?? 0) + (order.coupon_discount_amount ?? 0) + (order.points_used ?? 0);
  row["주문 금액"] = order.total_amount ?? "";
  row["결제 상태"] = isPaid ? "결제 완료" : "입금 대기";
  row["결제 완료 금액"] = isPaid ? order.total_amount ?? "" : "";
  row["결제1 - 결제 수단"] = PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method ?? "";
  row["결제1 - 결제 금액"] = isPaid ? order.total_amount ?? "" : "";
  row["결제1 - 결제 일시"] = formatKstDateTime(paidAtIso);
  // 비회원 주문(user_id null) 지원 (2026-08-03) — gsheet 트리거(notify_gsheet_order_paid)와 동일 기준
  row["회원 여부"] = order.user_id ? "회원" : "비회원";
  row["주문자명"] = order.buyer_name ?? order.shipping_recipient_name ?? "";
  row["주문자 이메일"] = order.buyer_email ?? "";
  row["주문자 핸드폰 번호"] = order.buyer_phone ?? order.shipping_recipient_phone ?? "";
  row["수령인 이름"] = order.shipping_recipient_name ?? "";
  row["수령인 핸드폰 번호"] = order.shipping_recipient_phone ?? "";
  row["우편번호"] = order.shipping_postal_code ?? "";
  row["주소"] = [order.shipping_address_line1, order.shipping_address_line2].filter(Boolean).join(" ");
  row["상품 위치"] = [item.book_location, item.book_serial_number]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" / ");

  return row;
}

function getSalesFileName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `subook-sales-${year}-${month}-${day}.xlsx`;
}

// 현재 필터 조건의 전체 주문을 페이지 순회로 수집해 품목별 1행 XLSX를 만든다.
export async function downloadSalesSheetXlsx({ search, statuses, fromDate, toDate } = {}) {
  const orders = [];
  let offset = 0;

  while (true) {
    const params = { p_limit: EXPORT_PAGE_SIZE, p_offset: offset };
    if (search) params.p_search = search;
    if (statuses && statuses.length > 0) params.p_statuses = statuses;
    if (fromDate) params.p_from_date = fromDate;
    if (toDate) params.p_to_date = toDate;

    const { data, error } = await supabase.rpc("list_admin_orders", params);
    if (error) {
      throw new Error(error.message || "주문 목록을 불러오지 못했습니다.");
    }

    const pageItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    orders.push(...pageItems);

    if (pageItems.length < EXPORT_PAGE_SIZE || orders.length >= EXPORT_MAX_ORDERS) {
      break;
    }
    offset += EXPORT_PAGE_SIZE;
  }

  // 시트처럼 오래된 주문이 위로 오게 정렬 (RPC는 최신순)
  orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const rows = [];
  orders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      rows.push(buildSalesRow(order, item));
    });
  });

  if (rows.length === 0) {
    throw new Error("다운로드할 판매 데이터가 없습니다.");
  }

  await exportRowsToXlsx({
    rows,
    columns: SALES_SHEET_HEADERS.map((header) => ({
      key: header,
      header,
      ...(NUMBER_HEADERS.has(header) ? { type: Number } : {}),
      width: WIDE_HEADERS[header] ?? 14,
    })),
    fileName: getSalesFileName(),
    sheetName: "판매내역",
  });

  return { rowCount: rows.length };
}
