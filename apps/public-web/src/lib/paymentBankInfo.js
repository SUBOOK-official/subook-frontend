// 결제 계좌 정보 — 주문 페이지(결제 직전 사전 노출)와 주문 완료 페이지에서 공유.
// 사업자 등록 미완료로 PG 연동 전이므로 현재는 계좌이체만 가능.
// 사용자가 결제 직전에 어디로 입금할지·예금주·입금 마감을 미리 알 수 있게 한다.

export const BANK_NAME = "카카오뱅크";
export const BANK_ACCOUNT = "3333-36-3268506";
export const BANK_HOLDER = "박영제";

// 주문 후 입금 마감 시간(시간 단위). 이 시간을 넘기면 주문이 자동 취소된다.
export const PAYMENT_DEADLINE_HOURS = 24;
