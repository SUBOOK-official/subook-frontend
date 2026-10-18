// 저장된 원본 URL은 유지하고, 업로드 때 미리 만든 파일을 직접 제공한다.
// 이 경로 규칙은 backfill-product-images.mjs와 봇 프리렌더에서도 사용한다.
export const IMAGE_VARIANT_PREFIX = "__variants/v1/";
export const PRODUCT_IMAGE_BUCKETS = ["product-covers", "inspection-images"];
export const IMAGE_VARIANTS = [
  { width: 400, quality: 82 },
  { width: 900, quality: 88 },
  { width: 1600, quality: 93 },
];
const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/";
const LEGACY_RENDER_SEGMENT = "/storage/v1/render/image/public/";

export function imageVariantPath(path, width) {
  if (!IMAGE_VARIANTS.some((variant) => variant.width === width)) throw new Error("지원하지 않는 이미지 크기입니다.");
  return `${IMAGE_VARIANT_PREFIX}${path}.${width}.jpg`;
}

function parseStorageImage(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !/\.supabase\.(co|in)$/.test(url.hostname)) return null;
    url.pathname = url.pathname.replace(LEGACY_RENDER_SEGMENT, PUBLIC_OBJECT_SEGMENT);
    if (!url.pathname.startsWith(PUBLIC_OBJECT_SEGMENT)) return null;
    const [bucket, ...parts] = url.pathname.slice(PUBLIC_OBJECT_SEGMENT.length).split("/");
    if (!parts.join("/")) return null;
    for (const key of ["width", "height", "quality", "resize", "format"]) url.searchParams.delete(key);
    return { url, bucket, path: parts.join("/") };
  } catch { return null; }
}

export function getStoredImageUrl(value, width = 400) {
  const parsed = parseStorageImage(value);
  if (!parsed) return value;
  const { url, bucket, path } = parsed;
  // 후기 사진은 이미 업로드 전 1600px로 최적화된다. 기타 버킷도 유료 변환하지 않는다.
  if (PRODUCT_IMAGE_BUCKETS.includes(bucket) && !path.startsWith(IMAGE_VARIANT_PREFIX)) {
    const size = IMAGE_VARIANTS.find((variant) => variant.width >= width)?.width ?? 1600;
    url.pathname = `${PUBLIC_OBJECT_SEGMENT}${bucket}/${imageVariantPath(path, size)}`;
  }
  return url.href;
}

// 기존 import 호환. 더 이상 Supabase render/image 요청을 생성하지 않는다.
export function toSupabaseRenderUrl(value, { width = 400 } = {}) { return getStoredImageUrl(value, width); }
export function getThumbnailImageUrl(value) { return getStoredImageUrl(value, 400); }
export function getDetailImageUrl(value) { return getStoredImageUrl(value, 900); }
export function getZoomImageUrl(value) { return getStoredImageUrl(value, 1600); }

export function getOriginalImageUrl(value) {
  const parsed = parseStorageImage(value);
  if (!parsed || !PRODUCT_IMAGE_BUCKETS.includes(parsed.bucket) || !parsed.path.startsWith(IMAGE_VARIANT_PREFIX)) return value;
  const path = parsed.path.slice(IMAGE_VARIANT_PREFIX.length).replace(/\.(400|900|1600)\.jpg$/, "");
  if (path === parsed.path.slice(IMAGE_VARIANT_PREFIX.length)) return value;
  parsed.url.pathname = `${PUBLIC_OBJECT_SEGMENT}${parsed.bucket}/${path}`;
  return parsed.url.href;
}

// 이전 관리자 탭에서 올라온 원본 등 미생성 파일도 1회 원본으로 복구한다.
// React onError가 placeholder로 전환하기 전에 처리하며 원본 오류는 기존 핸들러로 넘긴다.
export function installStorageImageFallback(target = globalThis.window) {
  if (!target || target.__subookImageFallback) return;
  target.__subookImageFallback = true;
  target.addEventListener("error", (event) => {
    const image = event.target;
    if (image?.tagName !== "IMG") return;
    const current = image.currentSrc || image.src;
    const original = getOriginalImageUrl(current);
    if (original === current) return;
    event.stopImmediatePropagation();
    image.removeAttribute("srcset");
    image.src = original;
  }, true);
}
