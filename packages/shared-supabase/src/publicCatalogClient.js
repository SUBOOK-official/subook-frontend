import { createClient } from "@supabase/supabase-js";

export const CATALOG_UNAVAILABLE_MESSAGE = "교재를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

export function isPublicSupabaseKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (key.startsWith("sb_publishable_") && key !== "sb_publishable_replace_me") return true;
  try {
    const payload = key.split(".")[1];
    return JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))).role === "anon";
  } catch {
    return false;
  }
}

// 공개 카탈로그 전용. 세션을 저장하지 않으며 쓰기 RPC를 노출하지 않는다.
// SDK·네트워크 접근은 웹/앱 공통 shared-supabase 경계 안에서만 수행한다.
export function createPublicCatalogClient({ url, publicKey, fetchImpl = globalThis.fetch, timeoutMs = 10000, retryDelayMs = 350 }) {
  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    origin = parsed.origin;
  } catch {
    return null;
  }
  if (!isPublicSupabaseKey(publicKey)) return null;

  const client = createClient(origin, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });

  async function readRpc(name, args, signal) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let result;
      try {
        result = await client.rpc(name, args).abortSignal(controller.signal);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (!result.error && Array.isArray(result.data)) return result.data;
      // 읽기 요청만 일시적 네트워크/서버 오류에 한 번 재시도한다.
      if (attempt === 1 || (result.status > 0 && result.status < 500 && result.status !== 429)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    throw new Error(CATALOG_UNAVAILABLE_MESSAGE);
  }

  return {
    list: (args, signal) => readRpc("list_public_store_products", args, signal),
    detail: (productId, signal) => {
      if (!/^\d+$/.test(String(productId)) || Number(productId) <= 0) return Promise.reject(new Error("교재를 찾을 수 없습니다."));
      return readRpc("get_public_store_product_detail", { p_product_id: productId }, signal);
    },
  };
}
