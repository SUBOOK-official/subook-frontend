import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";

export async function checkIsAdminUser() {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  const { data, error } = await supabase.rpc("is_admin_user");
  if (error) {
    return false;
  }

  return Boolean(data);
}
