const ATTRIBUTION_STORAGE_KEY = "subook:order-attribution:v1";
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "dclid", "fbclid"];
const OPERATIONAL_REFERRER_DOMAINS = [
  "subook.kr",
  "accounts.google.com",
  "accounts.google.co.kr",
  "accounts.kakao.com",
  "kauth.kakao.com",
  "nicepay.co.kr",
  "supabase.co",
];

function trimText(value, maxLength = 200) {
  const text = [...String(value ?? "").trim()]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
  return text ? text.slice(0, maxLength) : null;
}

function normalizeHostname(value) {
  const hostname = trimText(value, 253)?.toLowerCase().replace(/^www\./, "") ?? null;
  return hostname || null;
}

function hostnameMatches(hostname, domain) {
  return hostname === domain || hostname?.endsWith(`.${domain}`);
}

function parseReferrerHostname(referrer) {
  if (!referrer) return null;
  try {
    return normalizeHostname(new URL(referrer).hostname);
  } catch {
    return null;
  }
}

function classifyReferrer(hostname) {
  if (!hostname) return null;
  if (hostnameMatches(hostname, "google.com") || hostnameMatches(hostname, "google.co.kr")) {
    return { source: "google", medium: "organic", sourcePlatform: "search" };
  }
  if (hostnameMatches(hostname, "naver.com")) {
    return { source: "naver", medium: "organic", sourcePlatform: "search" };
  }
  if (hostnameMatches(hostname, "daum.net") || hostnameMatches(hostname, "daum.com")) {
    return { source: "daum", medium: "organic", sourcePlatform: "search" };
  }
  if (hostnameMatches(hostname, "bing.com")) {
    return { source: "bing", medium: "organic", sourcePlatform: "search" };
  }
  if (hostnameMatches(hostname, "instagram.com")) {
    return { source: "instagram", medium: "social", sourcePlatform: "social" };
  }
  if (hostnameMatches(hostname, "facebook.com")) {
    return { source: "facebook", medium: "social", sourcePlatform: "social" };
  }
  if (hostnameMatches(hostname, "threads.net") || hostnameMatches(hostname, "threads.com")) {
    return { source: "threads", medium: "social", sourcePlatform: "social" };
  }
  return { source: hostname, medium: "referral", sourcePlatform: "referral" };
}

function buildTouch({ location, referrer, now }) {
  const params = new URLSearchParams(location?.search ?? "");
  const clickIdTypes = CLICK_ID_KEYS.filter((key) => trimText(params.get(key), 500));
  const hasGoogleClick = clickIdTypes.some((key) => ["gclid", "gbraid", "wbraid", "dclid"].includes(key));
  const hasMetaClick = clickIdTypes.includes("fbclid");
  const referrerHost = parseReferrerHostname(referrer);
  const currentHost = normalizeHostname(location?.hostname);
  const isSameSiteReferrer = Boolean(
    referrerHost && currentHost && (hostnameMatches(referrerHost, currentHost) || hostnameMatches(currentHost, referrerHost)),
  );
  const isOperationalReferrer = OPERATIONAL_REFERRER_DOMAINS.some((domain) =>
    hostnameMatches(referrerHost, domain),
  );
  const storedReferrerHost =
    referrerHost && !isSameSiteReferrer && !isOperationalReferrer ? referrerHost : null;

  const utmSource = trimText(params.get("utm_source"), 100)?.toLowerCase() ?? null;
  const utmMedium = trimText(params.get("utm_medium"), 100)?.toLowerCase() ?? null;
  const utmCampaign = trimText(params.get("utm_campaign"), 200);
  const utmCampaignId = trimText(params.get("utm_id"), 200);
  const utmContent = trimText(params.get("utm_content"), 200);
  const utmTerm = trimText(params.get("utm_term"), 200);
  const utmSourcePlatform = trimText(params.get("utm_source_platform"), 100)?.toLowerCase() ?? null;
  const hasCampaignParams = Boolean(
    utmSource || utmMedium || utmCampaign || utmCampaignId || utmContent || utmTerm || utmSourcePlatform,
  );

  let source = null;
  let medium = null;
  let sourcePlatform = utmSourcePlatform;
  let meaningful = false;

  if (hasCampaignParams) {
    source = utmSource ?? (hasGoogleClick ? "google" : hasMetaClick ? "meta" : "unknown");
    medium = utmMedium ?? (hasGoogleClick ? "cpc" : hasMetaClick ? "paid_social" : "unknown");
    sourcePlatform ??= hasGoogleClick ? "google_ads" : hasMetaClick ? "meta" : "manual";
    meaningful = true;
  } else if (hasGoogleClick) {
    source = "google";
    medium = "cpc";
    sourcePlatform = "google_ads";
    meaningful = true;
  } else if (hasMetaClick) {
    source = "meta";
    medium = "paid_social";
    sourcePlatform = "meta";
    meaningful = true;
  } else if (referrerHost && !isSameSiteReferrer && !isOperationalReferrer) {
    const classified = classifyReferrer(referrerHost);
    source = classified.source;
    medium = classified.medium;
    sourcePlatform = classified.sourcePlatform;
    meaningful = true;
  } else {
    source = "(direct)";
    medium = "(none)";
    sourcePlatform = "direct";
  }

  return {
    touch: {
      source,
      medium,
      ...(utmCampaign ? { campaign: utmCampaign } : {}),
      ...(utmCampaignId ? { campaign_id: utmCampaignId } : {}),
      ...(utmContent ? { content: utmContent } : {}),
      ...(utmTerm ? { term: utmTerm } : {}),
      ...(sourcePlatform ? { source_platform: sourcePlatform } : {}),
      ...(clickIdTypes.length > 0 ? { click_id_types: clickIdTypes } : {}),
      ...(storedReferrerHost ? { referrer_host: storedReferrerHost } : {}),
      landing_path: trimText(location?.pathname, 500) ?? "/",
      captured_at: new Date(now).toISOString(),
    },
    meaningful,
  };
}

function parseStoredAttribution(storage, now) {
  try {
    const parsed = JSON.parse(storage?.getItem(ATTRIBUTION_STORAGE_KEY) ?? "null");
    if (!parsed || parsed.version !== 1 || !parsed.first_touch || !parsed.last_touch) return null;
    if (!Number.isFinite(parsed.expires_at) || parsed.expires_at <= now) {
      storage?.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isOrderAttributionAllowed({ production, location, navigator }) {
  return Boolean(
    production &&
      location?.origin === "https://subook.kr" &&
      navigator?.globalPrivacyControl !== true,
  );
}

function captureOrderAttribution({
  production = false,
  location = globalThis.window?.location,
  document = globalThis.document,
  navigator = globalThis.navigator,
  storage = globalThis.window?.localStorage,
  now = Date.now(),
} = {}) {
  if (!isOrderAttributionAllowed({ production, location, navigator }) || !storage) return null;

  try {
    const current = parseStoredAttribution(storage, now);
    const { touch, meaningful } = buildTouch({ location, referrer: document?.referrer, now });
    const next = current
      ? {
          ...current,
          last_touch: meaningful ? touch : current.last_touch,
          updated_at: meaningful ? now : current.updated_at,
          expires_at: meaningful ? now + ATTRIBUTION_TTL_MS : current.expires_at,
        }
      : {
          version: 1,
          first_touch: touch,
          last_touch: touch,
          updated_at: now,
          expires_at: now + ATTRIBUTION_TTL_MS,
        };
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function readOrderAttribution({
  storage = globalThis.window?.localStorage,
  now = Date.now(),
} = {}) {
  if (!storage) return null;
  const stored = parseStoredAttribution(storage, now);
  if (!stored) return null;
  return {
    version: 1,
    first_touch: stored.first_touch,
    last_touch: stored.last_touch,
  };
}

function getOrderAttributionAnalyticsParams(attribution = readOrderAttribution()) {
  const first = attribution?.first_touch;
  const last = attribution?.last_touch;
  if (!first || !last) return {};
  return {
    attribution_source: trimText(last.source, 100),
    attribution_medium: trimText(last.medium, 100),
    ...(last.campaign ? { attribution_campaign: trimText(last.campaign, 100) } : {}),
    first_touch_source: trimText(first.source, 100),
    first_touch_medium: trimText(first.medium, 100),
    ...(last.click_id_types?.length
      ? { attribution_click_id_types: last.click_id_types.join(",") }
      : {}),
  };
}

function applyOrderAttributionAnalyticsContext({
  attribution = readOrderAttribution(),
  gtag = globalThis.window?.gtag,
} = {}) {
  const params = getOrderAttributionAnalyticsParams(attribution);
  if (typeof gtag !== "function" || Object.keys(params).length === 0) return false;
  try {
    // Google tag의 set 명령은 이 페이지에서 뒤이어 발생하는 page_view·행동 이벤트에
    // 수북의 대체 유입 파라미터를 공통으로 붙인다.
    gtag("set", params);
    return true;
  } catch {
    return false;
  }
}

export {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  applyOrderAttributionAnalyticsContext,
  captureOrderAttribution,
  getOrderAttributionAnalyticsParams,
  isOrderAttributionAllowed,
  readOrderAttribution,
};
