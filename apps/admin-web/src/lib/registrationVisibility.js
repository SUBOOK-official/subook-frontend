// 공개 요청 체크값 대신 DB가 확인한 실제 공개 결과만 표시한다.
export function registrationVisibilityLabel(result) {
  const { created_books: total, published_books: published, unpublished_books: hidden } = result || {};
  if (![total, published, hidden].every(value => Number.isInteger(value) && value >= 0)
    || published + hidden !== total) return "공개 상태 확인 필요";
  return `스토어 공개 ${published}권 · 비공개 ${hidden}권`;
}
