import { useCallback, useEffect, useRef, useState } from "react";
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

// 검색창용 — 입력은 바로 보여주고, 주소(조회 조건)에는 잠깐 모았다가 반영한다.
// '적용' 버튼 없이 입력을 멈추면 조회되고, 주소가 밖에서 바뀌면(통합 검색·뒤로가기) 입력칸도 따라간다.
//   const [input, setInput] = useDebouncedSearch(list.q, (q) => updateList({ q }));
export function useDebouncedSearch(committed, commit, delay = 250) {
  const [input, setInput] = useState(committed);
  const pushedRef = useRef(committed);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // 내가 방금 반영한 값이 아닐 때만 입력칸을 덮어쓴다 (입력 중인 글자를 지우지 않기 위해).
  useEffect(() => {
    if (committed !== pushedRef.current) {
      pushedRef.current = committed;
      setInput(committed);
    }
  }, [committed]);

  useEffect(() => {
    const next = input.trim();
    if (next === committed) return undefined;
    const timer = setTimeout(() => {
      pushedRef.current = next;
      commitRef.current(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [input, committed, delay]);

  return [input, setInput];
}
