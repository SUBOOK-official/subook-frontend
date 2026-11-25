// 학습지 표지 — 표지는 학습지 하나에 한 장이다(앱 저장소 docs/adr/0060).
// 여기에는 화면 없이 되는 계산만 둔다. 고른 파일을 올릴 JPEG로 바꾸는 일은 ilseongCoverImage.js(브라우저 전용)가 한다.

/** 올릴 때 긴 쪽을 이만큼까지 줄인다. 책장에 작게 보이는 그림이라 이보다 클 까닭이 없다. */
export const COVER_LONG_SIDE = 1600;
/** 앱 서버가 받는 가장 작은 크기(짧은 쪽). */
export const COVER_MIN_SIDE = 300;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** 그림을 올릴 크기로 줄인다. 너무 작으면 보여 줄 문구를 담아 던진다. */
export function fitCoverSize(width, height) {
  if (!(width > 0 && height > 0)) throw new Error("그림 크기를 읽지 못했어요.");
  if (Math.min(width, height) < COVER_MIN_SIDE) {
    throw new Error(`그림이 너무 작아요(${width}×${height}px). 짧은 쪽이 ${COVER_MIN_SIDE}px 이상인 그림을 골라 주세요.`);
  }
  const scale = Math.min(1, COVER_LONG_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
