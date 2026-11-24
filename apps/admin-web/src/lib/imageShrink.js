// 한 장당 용량 한도를 넘는 사진만 JPEG로 다시 저장한다. 한도 이하 파일에는 쓰지 않는다(원본 유지).
// 고해상도 원본이나 큰 PNG처럼 한도를 넘는 사진이 등록 단계에서 막히지 않게 하는 안전망이다.
// (가로 사진 회전본은 photoOrientation이 처음부터 JPEG로 저장하므로 보통 여기까지 오지 않는다.)
// 화질을 먼저 낮추고, 그래도 넘으면 크기를 줄인다. 보통 첫 단계(원본 크기·화질 0.95)에서 끝난다.
export const SHRINK_STEPS = [
  { scale: 1, quality: 0.95 },
  { scale: 1, quality: 0.9 },
  { scale: 1, quality: 0.82 },
  { scale: 0.75, quality: 0.9 },
  { scale: 0.5, quality: 0.9 },
  { scale: 0.35, quality: 0.85 },
];

// render(step)이 돌려준 결과 중 한도 안에 드는 첫 번째를 고른다. 모두 넘으면 null.
export async function encodeWithinLimit(render, maxBytes) {
  for (const step of SHRINK_STEPS) {
    const blob = await render(step);
    if (blob?.size && blob.size <= maxBytes) return blob;
  }
  return null;
}

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("사진을 읽을 수 없습니다. 다른 사진으로 다시 시도해 주세요."));
    };
    image.src = url;
  });
}

// 투명 영역은 흰색으로 채운다. 브라우저가 감당 못 하는 크기면 null을 돌려 다음 단계로 넘긴다.
function renderJpeg(image, { scale, quality }) {
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  try {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      resolve(blob?.type === "image/jpeg" ? blob : null);
    }, "image/jpeg", quality);
  });
}

export async function shrinkImageToLimit(file, maxBytes) {
  const image = await decodeImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("사진 크기를 확인할 수 없습니다.");
  const blob = await encodeWithinLimit((step) => renderJpeg(image, step), maxBytes);
  if (!blob) throw new Error("사진 용량을 줄이지 못했습니다. 더 작은 사진으로 다시 시도해 주세요.");
  const name = String(file.name || "image").replace(/\.[^/.]+$/, "");
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
