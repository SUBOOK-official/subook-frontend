import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_PUBLIC_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_ADMIN_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLIC_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ADMIN_ANON_KEY;
const publicAuthPersistencePreferenceKey = "subook.public.auth.persist";

function hasWindowStorage() {
  return typeof window !== "undefined" && window.localStorage && window.sessionStorage;
}

function clearPublicAuthStorageKey(storageKey) {
  if (!hasWindowStorage()) {
    return;
  }

  window.localStorage.removeItem(storageKey);
  window.sessionStorage.removeItem(storageKey);
}

export function getPublicAuthSessionPersistence() {
  if (!hasWindowStorage()) {
    return false;
  }

  return window.localStorage.getItem(publicAuthPersistencePreferenceKey) === "true";
}

export function setPublicAuthSessionPersistence(shouldPersist) {
  if (!hasWindowStorage()) {
    return;
  }

  window.localStorage.setItem(publicAuthPersistencePreferenceKey, shouldPersist ? "true" : "false");
}

const publicAuthStorage = {
  getItem(key) {
    if (!hasWindowStorage()) {
      return null;
    }

    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key, value) {
    if (!hasWindowStorage()) {
      return;
    }

    clearPublicAuthStorageKey(key);

    if (getPublicAuthSessionPersistence()) {
      window.localStorage.setItem(key, value);
      return;
    }

    window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
    clearPublicAuthStorageKey(key);
  },
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: publicAuthStorage,
      },
    })
  : null;
