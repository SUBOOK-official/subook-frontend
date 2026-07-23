// 책 편집 공용 비즈니스 규칙 — R2 IA 개편에서 추출.
// 같은 책을 편집하는 화면이 두 곳(수거 상세 워크스페이스 / 상품 마스터 모달)이라
// 규칙이 한쪽에만 반영되는 드리프트 사고가 실제로 있었다(가격 잠금, 2026-07-16 수정).
// 책 편집 규칙을 새로 만들면 반드시 여기 두고 양쪽에서 import할 것.

// 정산완료/폐기 책은 셀러 정산액·이력의 근거라 가격 변경 금지
export const PRICE_LOCKED_BOOK_STATUSES = ["settled", "discarded"];
export const PRICE_LOCKED_MESSAGE = "정산완료/폐기된 책의 가격은 변경할 수 없습니다.";

export function isBookPriceLocked(book) {
  return PRICE_LOCKED_BOOK_STATUSES.includes(book?.status);
}

// 등급도 같은 이유로 정산완료/폐기 후 변경 금지 (판매 시점 등급이 이력의 근거).
// 2026-07-23: A+ 폐지 계획 보류(중고 수거 증가)로 재고탭에서 권별 등급 수정 지원.
export const GRADE_LOCKED_MESSAGE = "정산완료/폐기된 책의 등급은 변경할 수 없습니다.";
// 어드민에서 부여 가능한 등급 (DISCARD는 검수 판정 전용 — 여기서 선택 불가)
export const EDITABLE_BOOK_GRADES = ["S", "A_PLUS", "A"];

export function isBookGradeLocked(book) {
  return PRICE_LOCKED_BOOK_STATUSES.includes(book?.status);
}
