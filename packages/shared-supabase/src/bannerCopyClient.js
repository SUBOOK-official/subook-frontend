import { createClient } from "@supabase/supabase-js";
import { requestCuratedContent } from "./curatedContentClient.js";

// 서버 전용. 키와 원문은 공개 API 응답에 포함하지 않는다.
export function createBannerCopyStore({ url, key }) {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = (name, args = {}, attempts = 2) => requestCuratedContent(
    (signal) => db.rpc(name, args).abortSignal(signal), { attempts, timeout: 8000 },
  );
  return {
    read: () => rpc("get_public_banner_copies"),
    sources: () => rpc("get_banner_copy_sources"),
    claim: (product, token) => rpc("claim_banner_copy", {
      p_product_id: product.id, p_source_hash: product.source_hash, p_token: token,
    }, 1),
    finish: (product, token, copy) => rpc("finish_banner_copy", {
      p_product_id: product.id, p_source_hash: product.source_hash, p_token: token, p_copy: copy,
    }, 1),
    release: (product, token) => requestCuratedContent((signal) => db.from("banner_copy_cache")
      .update({ lease_token: null, locked_until: null }).eq("product_id", product.id)
      .eq("lease_token", token).abortSignal(signal), { attempts: 1, timeout: 8000 }),
  };
}
