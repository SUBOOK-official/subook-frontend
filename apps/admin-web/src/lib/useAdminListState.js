import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";

// URL을 단일 상태로 사용해 새로고침·뒤로가기·같은 페이지 링크를 모두 지원한다.
export function useAdminListState(defaults) {
  const [params, setParams] = useSearchParams();
  const pending = useRef(params);
  pending.current = params;
  const state = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const raw = params.get(key);
    if (typeof fallback === "number") return [key, raw && /^\d+$/.test(raw) ? Math.max(1, Number(raw)) : fallback];
    return [key, raw ?? fallback];
  }));
  const update = useCallback((values, { replace = true, resetPage = true } = {}) => {
    const next = new URLSearchParams(pending.current);
    {
      for (const [key, value] of Object.entries(values)) {
        if (value === "" || value == null) next.delete(key);
        else next.set(key, String(value));
      }
      if (resetPage && !("page" in values)) next.delete("page");
      pending.current = next;
    }
    setParams(next, { replace });
  }, [setParams]);
  return [state, update];
}
