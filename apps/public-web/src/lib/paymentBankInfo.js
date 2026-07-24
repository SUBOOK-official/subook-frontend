// 결제 계좌 정보 — 주문 페이지(결제 직전 사전 노출)와 주문 완료 페이지에서 공유.
// 사업자 등록 미완료로 PG 연동 전이므로 현재는 계좌이체만 가능.
// 사용자가 결제 직전에 어디로 입금할지·예금주·입금 마감을 미리 알 수 있게 한다.

export const BANK_NAME = "카카오뱅크";
// 2026-07-24 사업자 계좌로 변경 (구: 3333-36-3268506 / 박영제 개인)
export const BANK_ACCOUNT = "3333-37-5878066";
export const BANK_HOLDER = "박영제(수북(SUBOOK))";

// 주문 후 입금 마감 시간(시간 단위). 이 시간을 넘기면 주문이 자동 취소된다.
export const PAYMENT_DEADLINE_HOURS = 24;

// 주문번호(예: ORD-2412-0042)에서 숫자만 추출해 마지막 4자리.
export function getOrderTail(orderNumber) {
  if (!orderNumber) return "";
  return String(orderNumber).replace(/\D/g, "").slice(-4);
}

// 추천 입금자명 = "수령인 성함 + 주문번호 숫자 마지막 4자리" (예: 홍길동1234).
// ⚠️ admin 입금확인 모달(AdminOrdersPage)의 '예상 입금자명' 계산과 반드시 동일해야
//    운영자가 통장 내역을 매칭할 수 있다. 정의를 바꾸면 양쪽을 함께 수정할 것.
export function buildDepositorName(recipientName, orderNumber) {
  const name = (recipientName ?? "").toString().trim();
  const tail = getOrderTail(orderNumber);
  if (!name || !tail) return name || tail;
  return `${name}${tail}`;
}
