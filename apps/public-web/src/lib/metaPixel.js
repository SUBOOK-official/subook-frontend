export const META_PIXEL_ID = "27962792746720705";

// 운영 주소에서만 실행한다. preview 빌드는 PROD여도 vercel.app 주소이므로 제외된다.
export function isMetaTrackingAllowed(location = globalThis.window?.location, navigator = globalThis.navigator) {
  return location?.origin === "https://subook.kr" && navigator?.globalPrivacyControl !== true;
}

export function installMetaPixel({ production, window: browserWindow = globalThis.window, document = globalThis.document } = {}) {
  if (!production || !isMetaTrackingAllowed(browserWindow?.location, browserWindow?.navigator) || !document) return false;
  if (browserWindow.fbq) return false;
  const fbq = function () {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  };
  browserWindow.fbq = fbq;
  if (!browserWindow._fbq) browserWindow._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", META_PIXEL_ID);
  // 이후 SPA 이동은 Meta SDK가 자동 수집한다. 라우트별 PageView를 추가하지 않는다.
  fbq("track", "PageView");
  return true;
}

export function readMetaCheckoutCookies(cookie = globalThis.document?.cookie ?? "") {
  const result = { fbp: null, fbc: null };
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== "_fbp" && name !== "_fbc") continue;
    try {
      const value = decodeURIComponent(rest.join("="));
      // 실제 발급된 쿠키만 전달한다. 없는 광고 클릭 ID를 만들지 않는다.
      if (/^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]{1,450}$/.test(value)) result[name.slice(1)] = value;
    } catch { /* 잘못된 쿠키는 제외한다. */ }
  }
  return result;
}
