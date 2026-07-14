// 회원탈퇴 사유 선택지 — value는 집계용 고정 키(DB member_withdrawal_reasons.reason_category),
// label은 화면 문구. 문구를 바꿔도 value는 유지해야 과거 데이터와 이어서 집계된다.
// public-web(탈퇴 설문)과 admin-web(통계 화면)이 공유한다.
export const WITHDRAWAL_REASON_CATEGORIES = [
  { value: "exam_finished", label: "수험 생활이 끝나서 / 더 이상 교재가 필요 없어서" },
  { value: "book_not_found", label: "원하는 교재(비매품 등)를 찾기 어려워서" },
  { value: "price", label: "가격이 비싸서 / 다른 곳이 더 저렴해서" },
  { value: "condition_mismatch", label: "교재 상태가 기대와 달라서" },
  { value: "shipping_issue", label: "배송이 느리거나 문제가 있어서" },
  { value: "settlement_fee", label: "판매(위탁) 정산·수수료가 아쉬워서" },
  { value: "other_service", label: "다른 중고거래 서비스를 써서" },
  { value: "other", label: "기타 (직접 입력)" },
];

export function getWithdrawalReasonLabel(categoryValue) {
  return (
    WITHDRAWAL_REASON_CATEGORIES.find((option) => option.value === categoryValue)?.label ?? null
  );
}
