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
