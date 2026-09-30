// 상품 카테고리(과목/브랜드/유형) canonical 선택지 — 스토어 필터와 동일 축.
// 등록 위저드(/admin/register)와 상품 수정 모달이 공유한다.
// 유형은 shared-domain과 등록 서버의 허용값을 공유한다.
export { BOOK_TYPE_OPTIONS } from "@shared-domain/bookTypes";

export const SUBJECT_OPTIONS = ["국어", "수학", "영어", "과학", "사회", "한국사", "기타"];

export const BRAND_OPTIONS = [
  "시대인재",
  "강남대성",
  "대성마이맥",
  "이투스",
  "EBS",
  "메가스터디",
  "이감",
  "상상국어평가연구소",
  "전일학원",
  "기타",
];

// 유형에 EBS는 없음 — 브랜드와 중복이라 제외 (2026-07-13 정책, 스토어 필터와 동일)
