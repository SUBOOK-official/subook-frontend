import { experimentParams } from './growthExperiments.js';
export const GA_MEASUREMENT_ID = 'G-EMNCLZKPMS';
// 쿠키 형식을 추측하거나 식별자를 새로 만들지 않고 공식 gtag get API를 사용한다.
export async function readGaCheckoutContext({ window = globalThis.window, timeoutMs = 1000 } = {}) {
  if (window?.location?.origin !== 'https://subook.kr' || window.navigator?.globalPrivacyControl === true || typeof window.gtag !== 'function') return null;
  if (new URLSearchParams(window.location.search).get('pg_review_mode') === 'true') return null;
  const get = (field) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try { window.gtag('get', GA_MEASUREMENT_ID, field, (value) => { clearTimeout(timer); resolve(value); }); }
    catch { clearTimeout(timer); resolve(null); }
  });
  const [clientId, sessionId] = await Promise.all([get('client_id'), get('session_id')]);
  if (!/^\d{1,20}\.\d{1,20}$/.test(String(clientId))) return null;
  return { clientId: String(clientId), sessionId: /^\d{1,20}$/.test(String(sessionId)) ? String(sessionId) : null,
    experimentVariant: experimentParams(window.localStorage).guest_checkout_guide_v1 ?? null };
}
