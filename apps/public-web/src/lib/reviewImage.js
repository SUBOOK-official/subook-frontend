// 후기 사진 업로드 전 클라이언트 리사이즈 (브라우저 전용).
// 휴대폰 원본(3~8MB)을 그대로 올리면 버킷 5MB 상한에 걸리고 목록 로딩도 느려져서
// 긴 변 1600px·JPEG 0.85로 줄여 올린다 (보통 200~400KB).

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.85;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 읽을 수 없어요. JPG·PNG 파일인지 확인해 주세요."));
    };
    image.src = objectUrl;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF 회전을 브라우저가 반영하도록 요청 (미지원 브라우저는 무시)
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 폴백: <img> 디코딩
    }
  }
  return loadImageElement(file);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("이미지 변환에 실패했어요."));
        }
      },
      type,
      quality,
    );
  });
}

export async function resizeReviewImage(
  file,
  { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = {},
) {
  if (!file || typeof document === "undefined") {
    throw new Error("이미지를 처리할 수 없어요.");
  }

  const source = await decodeImage(file);
  const sourceWidth = source.naturalWidth ?? source.width;
  const sourceHeight = source.naturalHeight ?? source.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("이미지 크기를 읽을 수 없어요.");
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 변환을 지원하지 않는 브라우저예요.");
  }
  // PNG 투명 영역은 흰 배경으로 — JPEG 변환 시 검게 나오는 것 방지
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);

  if (typeof source.close === "function") {
    source.close();
  }

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return { blob, width: targetWidth, height: targetHeight };
}
