import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { IlseongAdminError, createIlseongAdminClient } from "./ilseongAdminClient";

// 「일성월심 앱」 화면이 쓰는 연결.
//  - callIlseongSalesApi: 수북 관리자 API(/api/admin/ilseong-app-codes) — 판매 연결, 앱 서버 로그인 입장권
//  - ilseongAdmin:        앱 서버의 관리 API(/api/admin/**)를 직원 로그인 토큰으로 직접 부른다
//  - useIlseongData:      앱 서버에서 읽어 오는 화면용 훅

function storageOf(name) {
  try {
    return typeof window === "undefined" ? null : window[name];
  } catch {
    return null;
  }
}

export async function callIlseongSalesApi({ method = "POST", payload = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 필요합니다.");
  const url = method === "GET" ? "/api/admin/ilseong-app-codes?action=overview" : "/api/admin/ilseong-app-codes";
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      body: method === "GET" ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new Error("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error || `요청에 실패했습니다. (${response.status})`);
  }
  return result;
}

export const ilseongAdmin = createIlseongAdminClient({
  getStaffId: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  },
  requestTicket: async () => {
    try {
      return await callIlseongSalesApi({ payload: { action: "admin_ticket" } });
    } catch (error) {
      throw new IlseongAdminError(0, "TICKET_FAILED", error?.message || "앱 서버에 로그인할 정보를 받지 못했어요.");
    }
  },
  sessionStore: storageOf("sessionStorage"),
  deviceStore: storageOf("localStorage"),
});

// 수북 관리자에서 로그아웃하면 앱 서버 로그인도 이 탭에서 지운다
supabase?.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") ilseongAdmin.clear();
});

/**
 * 앱 서버에서 읽어 오기. path가 바뀌면 다시 읽는다(path가 없으면 읽지 않는다).
 *  - keepPrevious: 다시 읽는 동안 앞서 받은 것을 그대로 보여 준다(검색어를 바꿀 때)
 *  - refreshMs:    이 간격으로 조용히 다시 읽는다
 * 다시 읽다 실패하면 앞서 받은 것은 남기고 error만 채운다. 그래서 오류 화면은 data가 없을 때만 보여 준다.
 */
export function useIlseongData(path, { keepPrevious = false, refreshMs = 0 } = {}) {
  const [state, setState] = useState({ path, data: undefined, error: null, loading: Boolean(path) });
  const turn = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!path) return;
    const mine = ++turn.current;
    if (!quiet) setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await ilseongAdmin.request("GET", path);
      if (mine === turn.current) setState({ path, data, error: null, loading: false });
    } catch (error) {
      if (mine === turn.current) setState((prev) => ({ ...prev, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    if (!path) {
      turn.current += 1;
      setState({ path, data: undefined, error: null, loading: false });
      return undefined;
    }
    if (!keepPrevious) setState({ path, data: undefined, error: null, loading: true });
    void load();
    return () => {
      turn.current += 1;
    };
  }, [path, keepPrevious, load]);

  useEffect(() => {
    if (!path || !refreshMs) return undefined;
    const timer = window.setInterval(() => void load({ quiet: true }), refreshMs);
    return () => window.clearInterval(timer);
  }, [path, refreshMs, load]);

  /** 저장한 뒤 서버가 돌려준 값으로 바로 바꿔 넣는다. */
  const setData = useCallback((data) => {
    turn.current += 1;
    setState({ path, data, error: null, loading: false });
  }, [path]);

  // path가 막 바뀐 그 한 번의 그리기에는 앞 path의 값이 state에 남아 있다. keepPrevious가 아니면 그 값을 내보내지 않는다.
  const stale = state.path !== path && !keepPrevious;
  return {
    data: stale ? undefined : state.data,
    error: stale ? null : state.error,
    loading: stale ? Boolean(path) : state.loading,
    reload: load,
    setData,
  };
}
