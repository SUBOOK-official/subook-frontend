import { PROMOTION_IMAGE_MAX_BYTES } from "../../../../packages/shared-domain/src/sitePromotions.js";

export const PROMOTION_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 600 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function promotionImageDimensions(width, height, { placement = "home_hero", mobile = false } = {}) {
  if (!(width > 0 && height > 0)) throw new Error("이미지 크기를 확인할 수 없습니다.");
  const maxWidth = placement === "home_popup" ? 1200 : mobile ? 1280 : 3200;
  const scale = Math.min(1, maxWidth / width, 2000 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatImageBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// Canvas는 첫 프레임만 그리므로 움직이는 WebP/APNG는 원본을 보존한다.
// https://developers.google.com/speed/webp/docs/riff_container
// https://www.w3.org/TR/png-3/#acTL-chunk
async function isAnimated(file) {
  if (file.type === "image/webp") {
    const bytes = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    return bytes.length >= 21 && String.fromCharCode(...bytes.slice(12, 16)) === "VP8X" && (bytes[20] & 2) !== 0;
  }
  if (file.type !== "image/png") return false;
  let offset = 8;
  for (let chunks = 0; offset + 12 <= file.size && chunks < 512; chunks += 1) {
    const header = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
    const type = String.fromCharCode(...header.slice(4, 8));
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += new DataView(header.buffer).getUint32(0) + 12;
  }
  if (offset + 12 <= file.size) throw new Error("이미지 정보를 읽지 못했습니다. 다른 이미지로 다시 시도해 주세요.");
  return false;
}

async function decodeImage(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("이미지를 읽지 못했습니다. 정상적인 JPG·PNG·WebP 파일을 선택해 주세요."); }
}

function encode(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob?.size ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다. 다른 이미지로 다시 시도해 주세요.")), "image/webp", quality);
  });
}

// 브라우저 안에서 변환한 파일만 업로드한다. 비율·투명 배경을 유지하고 확대/크롭하지 않는다.
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
export async function preparePromotionImage(file, options = {}) {
  if (!TYPES[file?.type]) throw new Error("JPG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  if (!file.size) throw new Error("빈 이미지 파일은 업로드할 수 없습니다.");
  if (file.size > PROMOTION_SOURCE_MAX_BYTES) throw new Error("원본 이미지는 25MB 이하로 선택해 주세요.");
  const animated = await isAnimated(file);
  const bitmap = await decodeImage(file);
  let canvas;
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    let { width, height } = promotionImageDimensions(originalWidth, originalHeight, options);
    const resized = width !== originalWidth || height !== originalHeight;
    const result = (output, resultWidth, resultHeight) => ({
      file: output, originalBytes: file.size, outputBytes: output.size,
      width: resultWidth, height: resultHeight, originalWidth, originalHeight,
      format: TYPES[output.type].toUpperCase(), optimized: output !== file, animated,
      savedPercent: Math.max(0, Math.round((1 - output.size / file.size) * 100)),
    });
    if (animated) {
      if (file.size > PROMOTION_IMAGE_MAX_BYTES) throw new Error("움직이는 이미지는 자동 압축하지 않습니다. 5MB 이하 파일을 선택해 주세요.");
      return result(file, originalWidth, originalHeight);
    }
    // 이미 작은 WebP는 손실 압축을 반복하지 않는다.
    if (!resized && file.type === "image/webp" && file.size <= TARGET_BYTES) return result(file, width, height);
    canvas = document.createElement("canvas");
    let best;
    let bestWidth;
    let bestHeight;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지 변환을 시작하지 못했습니다. 브라우저를 새로고침해 주세요.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.88, 0.82, 0.76]) {
        const blob = await encode(canvas, quality);
        if (!TYPES[blob.type]) throw new Error("이 브라우저에서 이미지 변환을 지원하지 않습니다.");
        if (!best || blob.size < best.size) { best = blob; bestWidth = width; bestHeight = height; }
        // WebP 미지원 브라우저의 PNG 폴백은 투명도를 보존하며, quality 재시도는 무의미하다.
        if (blob.size <= TARGET_BYTES || blob.type !== "image/webp") break;
      }
      // 목표 용량보다 글자 선명도를 우선. 저장 한도에 들어오면 해상도를 더 줄이지 않는다.
      if (best.size <= PROMOTION_IMAGE_MAX_BYTES) break;
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    if (!resized && file.size <= best.size && file.size <= PROMOTION_IMAGE_MAX_BYTES) return result(file, originalWidth, originalHeight);
    if (best.size > PROMOTION_IMAGE_MAX_BYTES) throw new Error("자동 압축 후에도 이미지가 너무 큽니다. 더 작은 원본을 선택해 주세요.");
    const name = (file.name || "promotion").replace(/\.[^/.]+$/, "");
    const output = new File([best], `${name}.${TYPES[best.type]}`, { type: best.type, lastModified: file.lastModified });
    return result(output, bestWidth, bestHeight);
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
