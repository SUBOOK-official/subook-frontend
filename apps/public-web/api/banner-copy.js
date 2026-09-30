import { randomUUID, timingSafeEqual } from "node:crypto";
import { generateBannerCopy } from "../../../packages/shared-domain/src/bannerCopyGeneration.js";
import { createBannerCopyStore } from "../../../packages/shared-supabase/src/bannerCopyClient.js";

export const config = { maxDuration: 180 };
function authorized(header, secret) {
  if (!secret) return false;
  const actual = Buffer.from(String(header || ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createBannerCopyHandler({ env = process.env, createStore = createBannerCopyStore, generate = generateBannerCopy, now = Date.now } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const error = (code, message) => res.status(code).json({ error: message, code });
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return error(405, "Method not allowed");
    }
    const refresh = req.query?.refresh === "1";
    if (refresh && !authorized(req.headers?.authorization, env.CRON_SECRET)) return error(401, "Unauthorized");
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_PUBLIC_URL;
    const key = refresh ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLIC_ANON_KEY;
    if (!url || !key || (refresh && !env.GEMINI_API_KEY)) return error(503, "Banner copy temporarily unavailable");
    try {
      const store = createStore({ url, key });
      if (!refresh) {
        const copies = await store.read();
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
        return res.status(200).json({ copies });
      }
      const startedAt = now();
      const sources = (await store.sources()).slice(0, 13);
      let generated = 0;
      let failed = 0;
      let skipped = 0;
      // 인스턴스 간 중복은 DB 잠금, 같은 실행의 동시 유료 요청은 최대 3개로 제한한다.
      for (let start = 0; start < sources.length; start += 3) {
        if (now() - startedAt > 110000) { skipped += sources.length - start; break; }
        await Promise.all(sources.slice(start, start + 3).map(async (product) => {
          const token = randomUUID();
          try {
            if (!await store.claim(product, token)) { skipped += 1; return; }
            const copy = await generate(product, { apiKey: env.GEMINI_API_KEY });
            if (await store.finish(product, token, copy)) generated += 1;
            else skipped += 1;
          } catch {
            failed += 1;
            // 실패한 원문은 1시간 대기. 기존 캐시는 보존하며 원문이 같은 경우만 공개한다.
            try { await store.release(product, token); } catch { /* DB lease가 만료되어 회복한다. */ }
          }
        }));
      }
      return res.status(failed ? 502 : 200).json({ generated, failed, skipped });
    } catch {
      return error(503, "Banner copy temporarily unavailable");
    }
  };
}
export default createBannerCopyHandler();
