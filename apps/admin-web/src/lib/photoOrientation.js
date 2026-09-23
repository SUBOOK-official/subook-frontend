// 실물 사진은 생성형 AI로 회전시키지 않는다. 가로 사진의 픽셀 위치만 시계 방향 90도 이동한다.
// 촬영 규칙: 교재 윗부분이 사진 왼쪽. 세로/정사각 사진은 원본 File을 그대로 반환한다.
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform
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

    const canvas = document.createElement("canvas");
    canvas.width = height;
    canvas.height = width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("실물 사진 회전을 시작할 수 없습니다.");
    // x' = height - y, y' = x. 확대/축소·크롭·보간 없이 폭과 높이만 맞바꾼다.
    context.imageSmoothingEnabled = false;
    context.setTransform(0, 1, -1, 0, height, 0);
    context.drawImage(image, 0, 0);
    // JPEG 재압축에 의한 글자 손실을 피하기 위해 회전 결과를 PNG로 보관한다.
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("회전한 실물 사진을 저장하지 못했습니다.")), "image/png");
    });
    const name = String(file.name || "cover").replace(/\.[^/.]+$/, "");
    return new File([blob], `${name}_portrait.png`, { type: "image/png", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
