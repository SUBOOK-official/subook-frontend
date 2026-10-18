import { IMAGE_VARIANTS } from "./storageImage.js";

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const timer = setTimeout(() => finish(new Error("사진을 읽는 시간이 초과되었습니다. 다시 시도해 주세요.")), 30000);
    function finish(error) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve(image);
    }
    image.onload = () => finish();
    image.onerror = () => finish(new Error("사진을 읽을 수 없습니다. 다른 JPG·PNG 사진으로 다시 시도해 주세요."));
    image.src = url;
  });
}

export function imageVariantDimensions(width, height, targetWidth) {
  if (!(width > 0 && height > 0)) throw new Error("사진 크기를 확인할 수 없습니다.");
  const scale = Math.min(1, targetWidth / width, 16000 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// 브라우저에서 한 번 디코딩하고 세 크기를 만든다. 비율·EXIF 방향을 보존하고
// JPEG의 투명 영역은 흰색으로 채운다. 원본보다 크게 확대하지 않는다.
export async function createImageVariants(file) {
  const source = await decodeImage(file);
  const results = [];
  for (const variant of IMAGE_VARIANTS) {
    const size = imageVariantDimensions(source.naturalWidth, source.naturalHeight, variant.width);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서는 사진을 처리할 수 없습니다. 최신 브라우저로 다시 시도해 주세요.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => {
      if (result?.size && result.type === "image/jpeg") resolve(result);
      else reject(new Error("사진 최적화에 실패했습니다. 다른 사진으로 다시 시도해 주세요."));
    }, "image/jpeg", variant.quality / 100));
    canvas.width = 0;
    canvas.height = 0;
    results.push({ ...variant, blob });
  }
  return results;
}
