import { normalizeReferralCode, REFERRAL_EVENT_PATH } from "../../../../packages/shared-domain/src/referral.js";

const storageKey = "subook.signup-referral.v1";
let memoryCode = "";

function browserStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export function rememberSignupReferral(value, storage = browserStorage()) {
  const code = normalizeReferralCode(value);
  if (!code) return "";
  memoryCode = code;
  try { storage?.setItem(storageKey, code); } catch { /* 저장소 제한 시 현재 탭 메모리 사용 */ }
  return code;
}

export function getSignupReferralCode(search = globalThis.location?.search ?? "", storage = browserStorage()) {
  const fromUrl = normalizeReferralCode(new URLSearchParams(search).get("ref"));
  if (fromUrl) return rememberSignupReferral(fromUrl, storage);
  try { return normalizeReferralCode(storage?.getItem(storageKey)) || memoryCode; } catch { return memoryCode; }
}

export function clearSignupReferral(storage = browserStorage()) {
  memoryCode = "";
  try { storage?.removeItem(storageKey); } catch { /* 저장소 사용 불가 */ }
}

export function referralSignupPath(code) {
  return `/signup?ref=${encodeURIComponent(code)}`;
}

export function referralReturnPath(code) {
  return `${REFERRAL_EVENT_PATH}?ref=${encodeURIComponent(code)}`;
}
