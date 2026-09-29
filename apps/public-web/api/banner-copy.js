import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { bannerCopyHash, generateBannerCopy } from "../../../packages/shared-domain/src/bannerCopyGeneration.js";
export const config = { maxDuration: 120 };
const checked = (result) => { if (result.error) throw new Error("BANNER_DATABASE_ERROR"); return result.data; };
function authorized(header, secret) {
  if (!secret) return false;
  const actual = Buffer.from(String(header || ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const refresh = req.query?.refresh === "1";
  if (refresh && !authorized(req.headers.authorization, process.env.CRON_SECRET)) return res.status(401).json({ error: "Unauthorized" });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_PUBLIC_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLIC_ANON_KEY;
  if (!url || !serviceKey || !anonKey || (refresh && !process.env.OPENAI_API_KEY)) return res.status(503).json({ error: "Banner copy configuration missing" });
  try {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const publicClient = createClient(url, anonKey, options);
    const db = createClient(url, serviceKey, options);
    // Use exactly the same public recommendation order as the storefront. Never accept caller-provided product IDs.
    const rows = checked(await publicClient.rpc("list_public_store_products", {
      p_subjects: null, p_book_types: null, p_brands: null, p_years: null,
      p_condition_grades: null, p_search: null, p_sort: "recommended", p_limit: 13, p_offset: 0,
    }));
    const products = Array.isArray(rows) ? rows : rows?.products;
    if (!Array.isArray(products)) throw new Error("INVALID_CATALOG_RESULT");
    const ids = products.slice(0, 13).map((product) => product.id).filter(Boolean);
    if (!ids.length) return res.status(200).json({ copies: [], generated: 0 });
    if (!refresh) {
      const copies = checked(await db.from("banner_copy_cache").select("product_id,copy").in("product_id", ids).not("copy", "is", null));
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
      return res.status(200).json({ copies });
    }
    const sources = checked(await db.from("products").select("id,title,subject,brand,book_type,ai_summary").in("id", ids));
    let generated = 0;
    let failed = 0;
    // At most three paid calls at once; the database lease also protects overlapping cron runs.
    for (let start = 0; start < sources.length; start += 3) {
      await Promise.all(sources.slice(start, start + 3).map(async (product) => {
        const token = randomUUID();
        const hash = bannerCopyHash(product);
        const claimed = checked(await db.rpc("claim_banner_copy", { p_product_id: product.id, p_source_hash: hash, p_token: token }));
        if (!claimed) return;
        try {
          const copy = await generateBannerCopy(product, { apiKey: process.env.OPENAI_API_KEY });
          const saved = checked(await db.from("banner_copy_cache").update({
            copy, source_hash: hash, generated_at: new Date().toISOString(),
            lease_token: null, locked_until: null, next_attempt_at: null,
          }).eq("product_id", product.id).eq("lease_token", token).select("product_id"));
          if (saved.length) generated += 1;
        } catch {
          failed += 1;
          // Keep any old copy and the one-hour retry cooldown. No immediate paid retries.
          await db.from("banner_copy_cache").update({ lease_token: null, locked_until: null })
            .eq("product_id", product.id).eq("lease_token", token);
        }
      }));
    }
    return res.status(failed ? 502 : 200).json({ generated, failed });
  } catch {
    return res.status(503).json({ error: "Banner copy temporarily unavailable" });
  }
}
