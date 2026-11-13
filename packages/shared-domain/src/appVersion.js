// 수북 앱 버전 안내 기준.
// 웹은 배포 즉시 바뀌지만 앱은 기기에 옛 버전이 남는다. 앱이 켜질 때
// https://subook.kr/app-version.json 을 읽어, 너무 오래된 버전이면 업데이트를 요구한다.
// 파일 원본: apps/public-web/public/app-version.json (웹 배포로 반영)
//   { "android": { "minimum": "0.2.0", "latest": "0.2.0", "storeUrl": "https://play.google.com/..." }, "ios": { ... } }
//   minimum: 이보다 낮으면 사용을 막고 업데이트를 요구한다(앱↔웹 연결 방식이 바뀌어 옛 앱이 동작하지 않을 때만 올린다).
//   latest:  이보다 낮으면 업데이트를 한 번 권한다.
//   storeUrl: 스토어 주소. 비어 있으면 권유는 띄우지 않고, 필수 업데이트 화면에는 버튼 없이 안내만 한다.

export const APP_VERSION_PATH = "/app-version.json";

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(value ?? "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

// a < b → -1, 같음 → 0, a > b → 1. 읽을 수 없는 값이 섞이면 0(같다고 본다).
export function compareAppVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function storeUrlOf(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "market:" || url.protocol === "itms-apps:" ? url.href : null;
  } catch {
    return null;
  }
}

// 반환: { status: "ok" | "optional" | "required", latest, storeUrl }
// 설정을 읽지 못했거나 형식이 다르면 항상 "ok"(앱 사용을 막지 않는다).
export function resolveAppUpdate(config, platform, currentVersion) {
  const entry = config && typeof config === "object" ? config[platform] : null;
  const ok = { status: "ok", latest: null, storeUrl: null };
  if (!entry || typeof entry !== "object" || !parseVersion(currentVersion)) return ok;
  const storeUrl = storeUrlOf(entry.storeUrl);
  const latest = parseVersion(entry.latest) ? String(entry.latest) : null;
  if (parseVersion(entry.minimum) && compareAppVersions(currentVersion, entry.minimum) < 0) {
    return { status: "required", latest, storeUrl };
  }
  if (latest && storeUrl && compareAppVersions(currentVersion, latest) < 0) {
    return { status: "optional", latest, storeUrl };
  }
  return ok;
}
