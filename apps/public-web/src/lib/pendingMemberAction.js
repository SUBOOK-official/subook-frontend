// 비회원이 게이트(로그인 유도)로 막힌 행동(담기/바로구매/찜)을 로그인 후 이어서 실행하기 위해
// 의도와 파라미터를 저장한다. OAuth 로그인은 전체 페이지 리로드라 React navigation state로는
// 살아남지 못하므로 sessionStorage를 사용한다. 소비(실행) 즉시 비운다. 탭을 닫으면 자동 소멸.
const KEY = "subook.public.pending-member-action.v1";

export function setPendingMemberAction(action) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(action));
  } catch {
    /* private mode / quota — 무시 */
  }
}

export function readPendingMemberAction() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingMemberAction() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
