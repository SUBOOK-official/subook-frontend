import { createClient } from "@supabase/supabase-js";
import { reportMissingSupabaseEnv } from "./envDiagnostics";
import {
  APP_BRIDGE_GLOBAL,
  APP_MESSAGE,
  APP_READY_EVENT,
  SUBOOK_APP_UA_TOKEN,
  getSupabaseAuthStorageKey,
} from "../../shared-domain/src/appBridge.js";

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

if (!isSupabaseConfigured) {
  reportMissingSupabaseEnv("public", {
    url: {
      value: supabaseUrl,
      candidates: ["VITE_SUPABASE_PUBLIC_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ADMIN_URL"],
    },
    anonKey: {
      value: supabaseAnonKey,
      candidates: [
        "VITE_SUPABASE_PUBLIC_ANON_KEY",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_SUPABASE_ADMIN_ANON_KEY",
      ],
    },
  });
}

// 수북 앱 안 웹 화면(WebView)에서 열린 경우.
// 로그인 세션의 주인은 앱이다. 앱이 같은 저장 키로 세션을 넣어 주고,
// 웹에서 로그인·로그아웃·토큰 갱신이 일어나면 그 결과를 앱에 그대로 알린다.
// 웹이 스스로 토큰을 주기 갱신하지 않아 앱과 갱신 토큰이 엇갈리지 않게 한다.
// 판별은 앱이 붙이는 User-Agent 표식으로 한다. Android WebView는 페이지 시작 전
// 스크립트 주입이 보장되지 않아 전역 객체만으로는 놓칠 수 있다.
export const isSubookAppWebView =
  typeof window !== "undefined" &&
  Boolean(window.ReactNativeWebView) &&
  (Boolean(window[APP_BRIDGE_GLOBAL]) || String(window.navigator?.userAgent ?? "").includes(SUBOOK_APP_UA_TOKEN));

const APP_READY_TIMEOUT_MS = 2500;

// 앱이 세션·주문 정보를 넣어 줄 때까지 기다린다. 이미 들어와 있으면 바로 끝난다.
// 일반 브라우저에서는 즉시 null.
export const subookAppReady = !isSubookAppWebView
  ? Promise.resolve(null)
  : new Promise((resolve) => {
      const finish = () => resolve(window[APP_BRIDGE_GLOBAL] ?? null);
      if (window[APP_BRIDGE_GLOBAL]) {
        finish();
        return;
      }
      window.addEventListener(APP_READY_EVENT, finish, { once: true });
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: APP_MESSAGE.READY }));
      } catch {
        // 앱 연결이 없으면 아래 제한 시간 뒤 웹 화면만 계속 동작한다.
      }
      window.setTimeout(finish, APP_READY_TIMEOUT_MS);
    });

const appSessionStorageKey = isSubookAppWebView ? getSupabaseAuthStorageKey(supabaseUrl) : null;

function postSessionToApp(payload) {
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: APP_MESSAGE.AUTH, ...payload }));
  } catch {
    // 앱 연결이 없으면 웹 화면만 계속 동작한다.
  }
}

const appAuthStorage = {
  // 앱이 최신 세션을 넣은 뒤에 읽는다(지난번 웹 화면에 남은 세션을 쓰지 않게).
  async getItem(key) {
    await subookAppReady;
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
    if (key === appSessionStorageKey) postSessionToApp({ event: "set", session: value });
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    if (key === appSessionStorageKey) postSessionToApp({ event: "remove" });
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: !isSubookAppWebView,
        detectSessionInUrl: true,
        persistSession: true,
        storage: isSubookAppWebView ? appAuthStorage : publicAuthStorage,
      },
    })
  : null;
