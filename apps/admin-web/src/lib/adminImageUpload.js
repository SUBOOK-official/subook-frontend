// 어드민 이미지 업로드 공용 헬퍼.
// AdminProductRegisterPage의 업로드 규칙(버킷/타입/용량)과 동일 — 상품 수정 모달 등
// 등록 위저드 밖에서도 같은 정책으로 업로드하기 위해 분리.
import { supabase } from "@shared-supabase/adminSupabaseClient";

export const COVER_BUCKET = "product-covers";
export const DETAIL_BUCKET = "inspection-images";
// 상세페이지 사진 최대 장수. 공개 상세페이지 그리드가 최대 2장까지만 노출하므로
// (PublicProductDetailPage DetailPhotoSection) 업로드도 동일하게 제한한다.
export const MAX_DETAIL_PHOTOS = 2;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function sanitizeFileName(name) {
  return String(name || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

export async function uploadImageToBucket(bucket, file, prefix = "edit") {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("JPG/PNG/WebP/GIF만 업로드 가능합니다.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("이미지는 15MB 이하여야 합니다.");
  }
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
