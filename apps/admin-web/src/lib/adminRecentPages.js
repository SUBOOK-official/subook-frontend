// 통합 검색의 "최근 방문" — 이 브라우저에만 저장한다 (메뉴 주소만, 검색어·개인정보 없음).
const STORAGE_KEY = "subook.admin.recentPages";
const MAX_RECENT = 5;

export function readRecentAdminPages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

// 방금 연 메뉴를 맨 앞으로. 저장이 막힌 브라우저에서는 조용히 넘어간다.
export function rememberAdminPage(to) {
  if (!to || to === "/admin") return;
  try {
    const next = [to, ...readRecentAdminPages().filter((item) => item !== to)].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 차단 */
  }
}
