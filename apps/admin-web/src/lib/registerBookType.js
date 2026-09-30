import { BOOK_TYPE_OPTIONS } from "../../../../packages/shared-domain/src/bookTypes.js";

export function bookTypeInputKey(row) {
  return JSON.stringify([row.title.trim(), (row.subject || "").trim()]);
}

export function changeRegisterRow(row, field, value) {
  const next = { ...row, [field]: value };
  if (["title", "subject", "bookType", "bookTypeReviewNote"].includes(field)) {
    next.bookTypeConfirmed = false;
    next.bookTypeReviewKey = "";
  }
  if (["title", "subject"].includes(field)) {
    next.bookType = "";
    next.bookTypeReviewNote = "";
  }
  if (field === "bookTypeConfirmed") next.bookTypeReviewKey = value ? bookTypeInputKey(next) : "";
  return next;
}

export function getBookTypeDecision(row, hint) {
  const current = hint?.key === bookTypeInputKey(row) ? hint : null;
  const suggested = current?.data?.book_type || "";
  const value = row.bookType || suggested;
  const pending = !current || current.status === "loading";
  const manual = !suggested || value !== suggested;
  const note = (row.bookTypeReviewNote || "").trim();
  const confirmed = row.bookTypeConfirmed === true && row.bookTypeReviewKey === bookTypeInputKey(row);
  const valid = !pending && BOOK_TYPE_OPTIONS.includes(value)
    && (!manual || (confirmed && note.length >= 4 && note.length <= 500));
  return { value, suggested, pending, manual, confirmed, valid, note, data: current?.data, error: current?.status === "error" };
}

export function bookTypeSubmitFields(row, hint) {
  const decision = getBookTypeDecision(row, hint);
  if (!decision.valid) throw new Error(`「${row.title.trim()}」 유형을 확인해 주세요.`);
  return {
    book_type: decision.value,
    book_type_confirmed: decision.manual && decision.confirmed,
    book_type_reviewed_title: decision.manual ? row.title.trim() : null,
    book_type_reviewed_subject: decision.manual ? (row.subject || "").trim() : null,
    book_type_review_note: decision.manual ? decision.note : null,
  };
}
