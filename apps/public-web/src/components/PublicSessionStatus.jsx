// 이전에는 로그인 상태에서 PublicPageFrame이 utility-replacement 영역에 렌더링했지만
// PublicSiteHeader가 단일 경로로 인증 상태 UI를 모두 담당하도록 통합됨 (2026-05-19).
// 호환을 위해 컴포넌트 자체는 유지하되 항상 null을 반환한다.
function PublicSessionStatus() {
  return null;
}

export default PublicSessionStatus;
