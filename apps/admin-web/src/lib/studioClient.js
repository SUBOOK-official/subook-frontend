// 사진 스튜디오(AI) 클라이언트 공용 로직.
// AdminStudioContext(스튜디오 페이지 배치 처리)와 상품 등록 플로우(표지 자동 변환)가
// 같은 전처리·요청 규칙을 쓰도록 여기로 추출했다. — /api/admin/book-studio 서버리스 호출.

export const STUDIO_MAX_IMAGE_SIDE = 1600;
export const STUDIO_MAX_BASE64_LENGTH = 3_000_000;
export const STUDIO_OUTPUT_QUALITY_STEPS = [0.9, 0.82, 0.75, 0.68];
export const STUDIO_REQUEST_TIMEOUT_MS = 240_000;

function getImageDataFromDataUrl(dataUrl) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("이미지 변환 형식이 올바르지 않습니다.");
  }

  const mimeType = dataUrl.slice(5, markerIndex);
  const imageBase64 = dataUrl.slice(markerIndex + marker.length);
  return { mimeType, imageBase64 };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = dataUrl;
  });
}

// 원본 파일 → 리사이즈·압축된 { mimeType, imageBase64 } 요청 페이로드
export async function prepareStudioImagePayload(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);

  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("이미지 크기를 확인할 수 없습니다.");
  }

  const scale = Math.min(1, STUDIO_MAX_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 처리를 시작할 수 없습니다.");
  }

  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  for (const quality of STUDIO_OUTPUT_QUALITY_STEPS) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    const payload = getImageDataFromDataUrl(compressed);
    if (payload.imageBase64.length <= STUDIO_MAX_BASE64_LENGTH) {
      return payload;
    }
  }

  throw new Error("이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해 주세요.");
}

// 스튜디오 생성 요청 → { imageBase64, mimeType } (실패 시 상태·코드·상세를 담은 Error)
export async function requestStudioGeneration(accessToken, payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, STUDIO_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("/api/admin/book-studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (requestError) {
    if (requestError instanceof DOMException && requestError.name === "AbortError") {
      throw new Error(
        `요청 시간이 초과되었습니다. (${Math.floor(STUDIO_REQUEST_TIMEOUT_MS / 1000)}초) 잠시 후 다시 시도해 주세요.`,
      );
    }
    throw requestError;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let responseBody = {};
  try {
    responseBody = await response.json();
  } catch (_parseError) {
    responseBody = {};
  }

  if (!response.ok) {
    const code = String(responseBody.code || "").trim();
    const errorMessage = String(responseBody.error || "AI 사진 생성에 실패했습니다.").trim();
    const detail = String(responseBody.detail || "").trim();
    const statusText = response.status ? `HTTP ${response.status}` : "";

    const segments = [];
    if (statusText) {
      segments.push(statusText);
    }
    if (code) {
      segments.push(code);
    }
    segments.push(errorMessage);
    if (detail) {
      segments.push(detail);
    }

    throw new Error(segments.join(" | "));
  }

  if (!responseBody.imageBase64 || !responseBody.mimeType) {
    const code = String(responseBody.code || "INVALID_STUDIO_RESPONSE").trim();
    const detail = String(responseBody.detail || "").trim();
    const segments = ["AI 사진 생성 결과 형식이 올바르지 않습니다.", code];
    if (detail) {
      segments.push(detail);
    }
    throw new Error(segments.join(" | "));
  }

  return responseBody;
}

// 생성 결과(base64)를 업로드 가능한 File로 변환
export function studioResultToFile(generated, originalName) {
  const binary = window.atob(generated.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const extension = generated.mimeType === "image/webp" ? "webp" : "png";
  const cleanName = String(originalName || "book").replace(/\.[^/.]+$/, "");
  return new File([bytes], `${cleanName}_studio.${extension}`, { type: generated.mimeType });
}
