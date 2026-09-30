import { supabase } from "@shared-supabase/publicSupabaseClient";
const cache = new Map();
export function loadProductCardSummary(id) {
  const key = String(id);
  if (!cache.has(key)) {
    const request = (async () => {
      if (!supabase) return "";
      const { data, error } = await supabase.from("products").select("ai_summary").eq("id", id).maybeSingle();
      if (error) throw error;
      return String(data?.ai_summary || "").replace(/<[^>]*>/g, " ").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
    })().catch((error) => { cache.delete(key); throw error; });
    cache.set(key, request);
  }
  return cache.get(key);
}
