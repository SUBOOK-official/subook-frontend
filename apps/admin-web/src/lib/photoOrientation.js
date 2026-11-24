// 실물 사진은 생성형 AI로 회전시키지 않는다. 가로 사진의 픽셀 위치만 시계 방향 90도 이동한다.
// 촬영 규칙: 교재 윗부분이 사진 왼쪽. 세로/정사각 사진은 원본 File을 그대로 반환한다.
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform

// 회전 결과의 저장 형식은 원본을 따른다.
// - PNG·GIF(무손실 원본): PNG 그대로. 같은 무손실끼리라 용량이 불어나지 않는다.
// - 그 밖(JPG·WebP 사진): JPEG. PNG로 보관하던 때는 1~2MB 사진이 10배 안팎으로 불어나
//   15MB 한도에 걸리고 업로드가 느렸다(2026-11-24 변경).
export const ROTATED_JPEG_QUALITY = 0.95;
const LOSSLESS_SOURCE_TYPES = ["image/png", "image/gif"];

export async function rotateLandscapePhoto(file) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error("실물 사진을 읽지 못했습니다."));
      source.src = sourceUrl;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("실물 사진 크기를 확인할 수 없습니다.");
    if (width <= height) return file;

    const outputType = LOSSLESS_SOURCE_TYPES.includes(file.type) ? "image/png" : "image/jpeg";
    const canvas = document.createElement("canvas");
    canvas.width = height;
    canvas.height = width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("실물 사진 회전을 시작할 수 없습니다.");
    if (outputType === "image/jpeg") {
      // JPEG에는 투명도가 없다. 투명한 WebP가 검게 변하지 않도록 흰 바탕을 먼저 칠한다.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    // x' = height - y, y' = x. 확대/축소·크롭·보간 없이 폭과 높이만 맞바꾼다.
    context.imageSmoothingEnabled = false;
    context.setTransform(0, 1, -1, 0, height, 0);
    context.drawImage(image, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("회전한 실물 사진을 저장하지 못했습니다.")),
        outputType,
        ROTATED_JPEG_QUALITY,
      );
    });
    // 브라우저가 요청한 형식으로 저장하지 못하면 PNG를 돌려준다. 실제 형식에 확장자를 맞춘다.
    const type = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const name = String(file.name || "cover").replace(/\.[^/.]+$/, "");
    return new File([blob], `${name}_portrait.${type === "image/jpeg" ? "jpg" : "png"}`, { type, lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
