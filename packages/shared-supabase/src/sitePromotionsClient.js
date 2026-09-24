import { PROMOTION_IMAGE_BUCKET, PROMOTION_IMAGE_MAX_BYTES, validatePromotion } from "../../shared-domain/src/sitePromotions.js";

const FIELDS = "id,placement,title,image_url,mobile_image_url,alt_text,link_url,is_enabled,sort_order,starts_at,ends_at,updated_at";

async function request(run, { attempts = 2, timeout = 10000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([
        run(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("요청 시간이 초과되었습니다. 다시 시도해 주세요."));
          }, timeout);
        }),
      ]);
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      lastError = error;
      // 권한/검증 오류를 자동 재시도하지 않는다.
      if (error.code === "42501" || (typeof error.code === "string" && error.code.startsWith("23"))) break;
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export async function listPromotions(client, { publishedOnly = false } = {}) {
  if (!client) throw new Error("서비스 연결을 확인해 주세요.");
  return request((signal) => {
    let query = client.from("site_promotions").select(FIELDS).order("sort_order").order("id");
    // 관리자 세션으로 고객 사이트를 열어도 초안이 노출되지 않는다.
    if (publishedOnly) query = query.eq("is_enabled", true);
    return query.abortSignal(signal);
  });
}

export async function savePromotion(client, row, previousUpdatedAt = null) {
  const validation = validatePromotion(row);
  if (validation) throw new Error(validation);
  const { id, placement, title, image_url, mobile_image_url, alt_text, link_url, is_enabled, sort_order, starts_at, ends_at } = row;
  const payload = { placement, title: title.trim(), image_url, mobile_image_url: mobile_image_url || null, alt_text: alt_text.trim(), link_url: link_url || null, is_enabled, sort_order, starts_at: starts_at || null, ends_at: ends_at || null };
  const saved = await request((signal) => {
    const query = previousUpdatedAt
      ? client.from("site_promotions").update(payload).eq("id", id).eq("updated_at", previousUpdatedAt)
      : client.from("site_promotions").insert({ ...payload, id });
    return query.select(FIELDS).maybeSingle().abortSignal(signal);
  }, { attempts: 1 }); // 결과가 불확실한 쓰기는 목록 확인 후 사용자가 재시도한다.
  if (!saved) throw new Error("다른 관리자가 변경했거나 항목이 삭제되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.");
  return saved;
}

export async function deletePromotion(client, row) {
  const deleted = await request((signal) => client.from("site_promotions").delete()
    .eq("id", row.id).eq("updated_at", row.updated_at).select("id").maybeSingle().abortSignal(signal), { attempts: 1 });
  if (!deleted) throw new Error("다른 관리자가 변경했습니다. 목록을 새로고침해 주세요.");
}

export async function uploadPromotionImage(client, file) {
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!extensions[file?.type]) throw new Error("JPG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  if (file.size > PROMOTION_IMAGE_MAX_BYTES) throw new Error("이미지는 5MB 이하로 업로드해 주세요.");
  // 브라우저에서 실제 이미지인지 확인. SVG/위장 파일·빈 파일의 저장을 방지한다.
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  const path = `${crypto.randomUUID()}.${extensions[file.type]}`;
  const bucket = client.storage.from(PROMOTION_IMAGE_BUCKET);
  // upload SDK에는 AbortSignal 인수가 없어 응답 대기 시간을 제한한다.
  // 재시도는 동일한 신규 UUID 경로에 upsert하여 중복 파일을 만들지 않는다.
  await request(() => bucket.upload(path, file, { contentType: file.type, upsert: true, cacheControl: "31536000" }), { timeout: 30000 });
  return bucket.getPublicUrl(path).data.publicUrl;
}
