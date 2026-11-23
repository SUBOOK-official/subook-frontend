// 「일성월심 앱」 화면 안 보기(?view=)의 주소.

/**
 *  - ilseongPath("users", 12)     그 앱 회원의 상세
 *  - ilseongPath("books", 3)      그 학습지의 단계 화면
 *  - ilseongPath("books", "new")  새 학습지 만들기
 */
export function ilseongPath(view, id) {
  if (view === "users" && id) return `/admin/ilseong?view=users&id=${id}`;
  if (view === "books" && id) return `/admin/ilseong?view=books&series=${id}`;
  return view ? `/admin/ilseong?view=${view}` : "/admin/ilseong";
}
