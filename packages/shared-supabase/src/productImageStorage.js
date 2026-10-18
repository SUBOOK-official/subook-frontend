import { IMAGE_VARIANTS, imageVariantPath } from "../../shared-domain/src/storageImage.js";

// 설치된 storage-js의 upload는 FileOptions.signal을 전달하지 않는다.
// 클라이언트의 공식 global.fetch 경로에서 실제 HTTP 요청에 시간 제한을 건다.
export function fetchWithStorageTimeout(input, init = {}, fetcher = globalThis.fetch) {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (!url.includes("/storage/v1/")) return fetcher(input, init);
  const timeout = AbortSignal.timeout(30000);
  return fetcher(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

export async function storageRequest(run, { attempts = 3, timeoutMs = 45000 } = {}) {
  let error;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([run(controller.signal, attempt), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("사진 저장 요청 시간이 초과되었습니다. 다시 시도해 주세요.")); }, timeoutMs);
      })]);
      if (result?.error) throw result.error;
      return result;
    } catch (caught) {
      error = caught;
      const status = Number(error.statusCode || error.status);
      if (status >= 400 && status < 500 && ![408, 429].includes(status)) break;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally { clearTimeout(timer); }
  }
  throw error;
}

export async function uploadStoredImage(client, bucket, path, body, contentType) {
  return storageRequest(async (_signal, attempt) => {
    const result = await client.storage.from(bucket).upload(path, body, {
      contentType, upsert: false, cacheControl: "31536000",
    });
    // 응답만 유실된 같은 파일의 재시도. 새 파일 경로는 업로드마다 고유하다.
    if (attempt > 0 && (String(result.error?.statusCode) === "409" || result.error?.code === "Duplicate")) return { data: { path }, error: null };
    return result;
  });
}

export async function uploadProductImage(client, bucket, path, original, variants) {
  if (variants.length !== IMAGE_VARIANTS.length || !IMAGE_VARIANTS.every(({ width }) => variants.some((item) => item.width === width && item.blob?.size))) {
    throw new Error("사진 최적화 파일이 준비되지 않았습니다. 다시 시도해 주세요.");
  }
  const paths = variants.map(({ width }) => imageVariantPath(path, width));
  try {
    // 축소본이 모두 저장된 후 원본을 게시한다. 실패한 업로드 URL을 DB에 전달하지 않는다.
    for (const variant of variants) {
      await uploadStoredImage(client, bucket, imageVariantPath(path, variant.width), variant.blob, "image/jpeg");
    }
    await uploadStoredImage(client, bucket, path, original, original.type);
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    await storageRequest(() => client.storage.from(bucket).remove([...paths, path]), { attempts: 1 }).catch(() => {});
    throw error;
  }
}

export async function removeProductImage(client, bucket, path) {
  return storageRequest(() => client.storage.from(bucket).remove([path, ...IMAGE_VARIANTS.map(({ width }) => imageVariantPath(path, width))]));
}
