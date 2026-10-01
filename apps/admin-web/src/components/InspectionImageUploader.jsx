import { useRef, useState } from "react";
import { DETAIL_BUCKET, MAX_IMAGE_MB, uploadImageToBucket } from "../lib/adminImageUpload";

/**
 * 검수 사진 업로드 컴포넌트.
 * - input[type=file multiple] 선택 → Supabase Storage(inspection-images)에 업로드
 * - 성공한 URL을 부모에게 onUploaded로 전달 (기존 inspection_image_urls 배열에 append)
 */
function InspectionImageUploader({ bookId, disabled, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setError("");
    setBusy(true);
    setProgress({ done: 0, total: files.length });

    const uploadedUrls = [];
    const errors = [];
    for (let i = 0; i < files.length; i += 1) {
      try {
        const url = await uploadImageToBucket(DETAIL_BUCKET, files[i], `book-${bookId}`);
        if (url) uploadedUrls.push(url);
      } catch (err) {
        errors.push(err?.message || String(err));
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setBusy(false);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";

    if (uploadedUrls.length > 0 && typeof onUploaded === "function") {
      onUploaded(uploadedUrls);
    }
    if (errors.length > 0) {
      setError(errors.join(" · "));
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={disabled || busy}
          onChange={handleFileChange}
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:font-bold file:text-white file:cursor-pointer disabled:opacity-50"
        />
        {busy ? (
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
            업로드 중 {progress.done}/{progress.total}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs font-bold text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-slate-500">JPG/PNG/WebP/GIF, 한 장당 최대 {MAX_IMAGE_MB}MB. 업로드한 URL이 아래 검수 사진 URL 목록에 자동 추가됩니다.</p>
      )}
    </div>
  );
}

export default InspectionImageUploader;
