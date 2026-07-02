// Supabase Storage 이미지 최적화 유틸
// -----------------------------------------------------------------------------
// 저장된 커버/검수 사진 URL은 대부분 `/storage/v1/object/public/…` 원본이다.
// 이 원본은 (1) 풀사이즈(최대 2MB+)이고 (2) 응답 헤더가 `Cache-Control: no-cache`라
// 브라우저가 캐시하지 않는다. 그래서 홈 그리드처럼 수십 장을 한 번에 받으면
// 호스트당 동시연결 한도(6개)에 걸려 일부가 늦게 오고, 새로고침마다 전부 재다운로드되어
// "썸네일이 랜덤하게 잘 떴다 안 떴다" 하는 현상이 생긴다.
//
// Supabase는 이미지 변환 엔드포인트를 제공한다(Pro 플랜, 이 프로젝트에서 활성 확인):
//   `/storage/v1/render/image/public/…?width=&quality=`
// 변환 결과는 브라우저 Accept에 따라 WebP로 자동 협상되어 2MB → 수 KB로 줄고,
// 응답 헤더가 `Cache-Control: max-age=3600`이라 CDN·브라우저에 캐시된다.
// 렌더 시점에 원본 URL을 이 변환 URL로 바꿔 가볍고 안정적으로 받게 한다.
//
// 원본을 그대로 둬야 하는 값(목업 SVG data URI, 스토리지 밖 외부 URL, 빈 값/비문자열)은
// 절대 건드리지 않는다.

const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/";
const RENDER_IMAGE_SEGMENT = "/storage/v1/render/image/public/";

// Supabase 공개 객체 URL을 리사이즈·WebP 변환 URL로 바꾼다.
// 스토리지 공개 객체가 아니면(외부 URL·data URI·빈 값·비문자열) 원본을 그대로 반환한다.
export function toSupabaseRenderUrl(url, { width, height, quality = 70, resize } = {}) {
  if (typeof url !== "string") {
    return url;
  }

  const trimmed = url.trim();
  if (!trimmed || !trimmed.includes(PUBLIC_OBJECT_SEGMENT)) {
    return url;
  }

  const [pathPart, existingQuery = ""] = trimmed
    .replace(PUBLIC_OBJECT_SEGMENT, RENDER_IMAGE_SEGMENT)
    .split("?", 2);

  const params = new URLSearchParams(existingQuery);
  if (Number.isFinite(width) && width > 0) {
    params.set("width", String(Math.round(width)));
  }
  if (Number.isFinite(height) && height > 0) {
    params.set("height", String(Math.round(height)));
  }
  if (Number.isFinite(quality) && quality > 0) {
    params.set("quality", String(Math.round(quality)));
  }
  if (resize) {
    params.set("resize", resize);
  }

  const queryString = params.toString();
  return queryString ? `${pathPart}?${queryString}` : pathPart;
}

// 카드/장바구니/주문/마이페이지 등 작은 썸네일용 (그리드 대표 이미지·검수 사진 미리보기).
export function getThumbnailImageUrl(url) {
  return toSupabaseRenderUrl(url, { width: 400, quality: 70 });
}

// 상품 상세 대표 이미지용 (본문에 크게 표시되는 첫 화면 LCP 이미지).
export function getDetailImageUrl(url) {
  return toSupabaseRenderUrl(url, { width: 900, quality: 80 });
}

// 라이트박스 확대 열람용 (스크래치 등 상태를 크게 확인 — 고품질).
export function getZoomImageUrl(url) {
  return toSupabaseRenderUrl(url, { width: 1600, quality: 85 });
}
