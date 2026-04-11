import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_ADMIN_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ADMIN_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function shouldDetectAdminSessionInUrl(url, params) {
  if (url.pathname !== "/auth/reset-password") {
    return false;
  }

  const type = params.type || "";
  const isResetLike = type === "recovery" || type === "invite";

  if (params.error || params.error_code || params.error_description) {
    return isResetLike;
  }

  if (params.access_token || params.refresh_token || params.code) {
    return isResetLike;
  }

  return false;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: shouldDetectAdminSessionInUrl,
      },
    })
  : null;
