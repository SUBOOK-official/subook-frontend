// 별도 상세 사진이 없을 때만 실물 표지 원본을 사용한다. AI 표지를 원본으로 대체하지 않는다.
export function getRegistrationDetailUrls(item) {
  const details = Array.isArray(item?.detailUrls) ? item.detailUrls.filter(Boolean) : [];
  if (details.length > 0) return details;
  return item?.originalCoverUrl ? [item.originalCoverUrl] : [];
}
