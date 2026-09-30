import { BOOK_TYPE_OPTIONS } from "../../../../packages/shared-domain/src/bookTypes.js";

export function bookTypeInputKey(row) {
  return JSON.stringify([row.title.trim(), (row.subject || "").trim(), (row.brand || "").trim()]);
}

export function changeRegisterRow(row, field, value) {
  // 운영자가 선택한 유형은 제목·과목 등을 보완해도 유지한다.
  return { ...row, [field]: value };
}

export function getBookTypeDecision(row, hint) {
  const current = hint?.key === bookTypeInputKey(row) ? hint : null;
  const suggested = current?.data?.book_type || "";
  const value = row.bookType || suggested;
  const pending = !current || current.status === "loading";
  const manual = Boolean(row.bookType);
  const valid = BOOK_TYPE_OPTIONS.includes(value) && (manual || !pending);
  return { value, suggested, pending, manual, valid, data: current?.data, error: current?.status === "error" };
}

export function bookTypeSubmitFields(row, hint) {
  const decision = getBookTypeDecision(row, hint);
  if (!decision.valid) throw new Error(`「${row.title.trim()}」 유형을 확인해 주세요.`);
  return {
    book_type: decision.value,
    book_type_source: decision.manual ? "manual" : "suggestion",
  };
}
