export const STORE_DETAIL_SUBJECTS = {
  사회: ["한국지리", "세계지리", "동아시아사", "세계사", "생활과윤리", "윤리와사상", "사회문화", "정치와법", "경제"],
  과학: ["물리학", "화학", "생명과학", "지구과학", "통합과학"],
};
const aliases = {
  한국지리: ["한국지리", "한지"], 세계지리: ["세계지리", "세지"],
  동아시아사: ["동아시아사", "동아시아역사", "동사"], 세계사: ["세계사"],
  생활과윤리: ["생활과윤리", "생윤"], 윤리와사상: ["윤리와사상", "윤사"],
  사회문화: ["사회문화", "사문"], 정치와법: ["정치와법", "정법"], 경제: ["경제"],
  물리학: ["물리학", "물리"], 화학: ["화학"], 생명과학: ["생명과학", "생물"],
  지구과학: ["지구과학"], 통합과학: ["통합과학"],
};
export function normalizeDetailSubjectText(value) {
  return String(value || "").normalize("NFKC").replace(/[^가-힣a-z0-9]/gi, "").toLowerCase();
}
export function matchesDetailSubjects(product, selected = []) {
  if (!selected.length) return true;
  const text = normalizeDetailSubjectText(product.title);
  return selected.some((subject) => (aliases[subject] || []).some((term) => text.includes(term)));
}
