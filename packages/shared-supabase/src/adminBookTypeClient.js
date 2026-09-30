import { supabase } from "./adminSupabaseClient.js";

export async function classifyRegisterBookType(title, subject, brand, client = supabase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const { data, error } = await client.rpc("admin_suggest_book_type", {
      p_title: title.trim(),
      p_subject: subject?.trim() || null,
      p_brand: brand?.trim() || null,
    }).abortSignal(controller.signal);
    if (error) throw error;
    if (!data || typeof data.needs_review !== "boolean") throw new Error("유형 제안을 불러오지 못했습니다.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}
