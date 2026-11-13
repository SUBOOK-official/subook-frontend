// 사이트 내 알림(member_notifications.ref_url) 이동 경로 검증.
//
// 알림 링크는 서버가 만든 사이트 내부 경로만 쓴다 (/mypage#orders, /store/123 등).
// 그 외 값(javascript: 스킴, 외부 주소, //host, 제어문자·역슬래시가 섞인 경로)은
// 알림 데이터가 오염됐을 때 스크립트 실행·피싱 이동으로 이어지므로 이동하지 않는다.

// 제어문자(0~31, 127) 여부 — 정규식 리터럴 대신 charCode로 검사 (lint no-control-regex)
function hasControlChar(value) {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

/** 안전한 내부 경로면 그대로, 아니면 null을 돌려준다. */
export function resolveNotificationPath(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // 브라우저는 탭·개행을 URL에서 지우고 역슬래시를 슬래시로 읽는다 — "/\host" → "//host"
  if (value.includes("\\") || hasControlChar(value)) return null;
  return value;
}
