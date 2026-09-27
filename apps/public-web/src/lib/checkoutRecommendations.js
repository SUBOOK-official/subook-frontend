import { normalizeCartGrade } from "./cartItemGroups.js";

export function isCheckoutBookAvailable(book) {
  return Boolean(book && book.status === "on_sale" && book.is_public && book.price != null
    && Number.isFinite(Number(book.price)) && Number(book.price) >= 0);
}

// 조회 시작 이후 추가/삭제된 품목은 현재 목록을 기준으로 유지한다.
export function mergeVerifiedCheckoutItems(current = [], snapshot = [], rows = []) {
  const checked = new Set(snapshot.map((item) => String(item.bookId)));
  const fresh = new Map(rows.map((row) => [String(row.id), row]));
  return current.flatMap((item) => {
    if (!checked.has(String(item.bookId))) return [item];
    const book = fresh.get(String(item.bookId));
    return isCheckoutBookAvailable(book) ? [{ ...item, price: Number(book.price) }] : [];
  });
}

export function getRecommendationOptions(options = []) {
  const unique = new Map();
  for (const option of options) {
    if (option.isSoldOut || option.isPublic === false || option.price == null || !Number.isFinite(Number(option.price)) || Number(option.price) < 0) continue;
    const key = [option.option ?? "", normalizeCartGrade(option.conditionGrade), option.price].join("::");
    if (!unique.has(key)) unique.set(key, option);
  }
  return [...unique.values()];
}

// React Router의 현재 history entry만 갱신한다. 다른 주문으로 이동한 뒤 늦게 저장하지 않는다.
export function persistCheckoutItems(history, entryKey, items) {
  if (!Array.isArray(items) || history.state?.key !== entryKey) return false;
  try {
    history.replaceState({ ...history.state, usr: { ...history.state.usr, items } }, "");
    return true;
  } catch { return false; }
}
