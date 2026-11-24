// 「일성월심 앱」 화면에서 쓰는 표기. 앱 서버가 주는 값(상태·로그인 수단·기록 종류)을 운영자가 읽는 말로 바꾼다.

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parse(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = parse(value);
  return date ? dateFormat.format(date) : "—";
}

export function formatDateTime(value) {
  const date = parse(value);
  return date ? dateTimeFormat.format(date) : "—";
}

/** 초 단위 시각(서버 점검 결과). 0이나 빈 값이면 "없음". */
export function formatEpochSeconds(seconds) {
  return seconds ? formatDateTime(new Date(seconds * 1000).toISOString()) : "없음";
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

/**
 * 한 과목에서 열린 교재를 한 줄로. 앱 서버가 준 summary(예: "1–8주차", "1주차, 파이널 1회 외 2")를 쓰고,
 * 없으면(예전 서버) 순서 번호로 만든다.
 */
export function booksLabel(book) {
  if (book?.summary) return book.summary;
  return weeksLabel(book?.weeks);
}

/** 1, 2, 3, 5 → "1–3, 5주차". 8주 전체면 "1–8주차". */
export function weeksLabel(weeks) {
  const sorted = [...(weeks || [])].sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return `${parts.join(", ")}주차`;
}

// tone: IlseongUi의 Badge 색
export const CODE_STATUS = {
  ISSUED: { label: "등록 전", tone: "blue" },
  REDEEMED: { label: "등록됨", tone: "green" },
  REVOKED: { label: "거둠", tone: "red" },
};

const PROVIDERS = {
  SUBOOK: "수북 계정",
  KAKAO: "카카오",
  APPLE: "애플",
  GOOGLE: "구글",
  SUBOOK_STAFF: "수북 관리자",
  REVIEW: "스토어 심사용",
  DEV: "개발용",
};

export function providersLabel(providers) {
  const list = (providers || []).map((p) => PROVIDERS[p] ?? p);
  return list.length ? list.join(", ") : "—";
}

const PLATFORMS = { IOS: "iPhone·iPad", ANDROID: "안드로이드", WEB: "웹" };

export const platformLabel = (platform) => PLATFORMS[platform] ?? platform;

const ACTIONS = {
  USER_GRANT: "교재 직접 등록",
  MEMBER_PREGRANT: "교재 미리 등록",
  MEMBER_PREGRANT_CANCEL: "미리 등록 취소",
  CODE_REVOKE: "등록 거두기",
  DEVICE_UNLINK: "기기 해제",
  BOOK_UPDATE: "교재 쪽 설정",
  PAGES_UPLOAD: "쪽 이미지 올리기",
  APP_CONFIG_UPDATE: "앱 설정",
  SERIES_CREATE: "학습지 만들기",
  SERIES_UPDATE: "학습지 설정",
  SERIES_DELETE: "학습지 지우기",
  SERIES_ORDER: "학습지 순서",
  SUBJECT_CREATE: "과목 만들기",
  SUBJECT_UPDATE: "과목 이름·색",
  SUBJECT_DELETE: "과목 지우기",
  SUBJECT_ORDER: "과목 순서",
  BOOK_CREATE: "교재 만들기",
  BOOK_STRUCTURE: "교재 이름·구성",
  BOOK_ORDER: "교재 순서",
  BOOK_DELETE: "교재 지우기",
  // 예전 기록(앱 상품을 따로 만들던 때, 코드 화면이 있던 때)
  PRODUCT_CREATE: "앱 상품 만들기",
  PRODUCT_UPDATE: "앱 상품 고치기",
  CODE_BATCH_ISSUE: "코드 만들기",
  CODE_BATCH_REVOKE: "묶음 폐기",
};

export const actionLabel = (action) => ACTIONS[action] ?? action;

const TARGET_KINDS = { code: "등록", batch: "묶음", book: "교재", series: "학습지", subject: "과목", product: "앱 상품" };

/**
 * 관리 기록의 대상("user:12/device:3", "book:5", "app-config", "member:수북 회원 UUID")
 * → 보여 줄 말과, 앱 회원이면 그 번호, 수북 회원이면 그 UUID(아직 앱에 로그인하지 않은 회원에게 미리 등록한 기록).
 * @returns {{ text: string, userId: number|null, memberRef: string|null }}
 */
export function actionTarget(target) {
  const text = String(target || "");
  const user = /^user:(\d+)/.exec(text);
  if (user) return { text: `${user[1]}번 회원`, userId: Number(user[1]), memberRef: null };
  const member = /^member:([0-9a-f-]{36})$/.exec(text);
  if (member) return { text: "수북 회원", userId: null, memberRef: member[1] };
  if (text === "app-config") return { text: "앱 설정", userId: null, memberRef: null };
  const [kind, id] = text.split(":");
  if (text === "series") return { text: "학습지", userId: null, memberRef: null };
  // 과목·상품은 번호가 아니라 코드(KOR, P1)로 가리킨다
  const suffix = kind === "subject" || kind === "product" ? "" : "번";
  return { text: TARGET_KINDS[kind] && id ? `${TARGET_KINDS[kind]} ${id}${suffix}` : text, userId: null, memberRef: null };
}

/** 1.0.2 같은 버전을 숫자 묶음으로. 견줄 수 없으면 null. */
function versionParts(value) {
  const text = String(value ?? "").trim();
  return /^\d+(\.\d+){0,2}$/.test(text) ? text.split(".").map(Number) : null;
}

/** a가 b보다 높은 버전인가(b가 비었거나 읽을 수 없으면 가장 낮은 것으로 본다). */
export function isHigherVersion(a, b) {
  const x = versionParts(a);
  if (!x) return false;
  const y = versionParts(b);
  if (!y) return true;
  for (let i = 0; i < 3; i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * 앱 설정을 저장하기 전에 한 번 더 물어야 하는 변경(학생이 앱을 못 쓰게 되거나 교재 보호가 풀리는 것).
 * @param saved  서버에 저장돼 있는 설정
 * @param next   { noticeMode, iosMinVersion, androidMinVersion, iosBlockCapture, androidBlockCapture }
 * @returns {{ risks: string[], minVersionRaised: boolean }}
 */
export function appConfigRisks(saved, next) {
  const risks = [];
  if (next.noticeMode === "BLOCK" && saved.noticeMode !== "BLOCK") risks.push("모든 학생이 앱을 쓸 수 없게 돼요(점검 중).");
  const iosRaised = isHigherVersion(next.iosMinVersion, saved.iosMinVersion);
  const androidRaised = isHigherVersion(next.androidMinVersion, saved.androidMinVersion);
  if (iosRaised) risks.push(`아이폰·아이패드: ${String(next.iosMinVersion).trim()}보다 낮은 앱은 쓸 수 없게 돼요.`);
  if (androidRaised) risks.push(`안드로이드: ${String(next.androidMinVersion).trim()}보다 낮은 앱은 쓸 수 없게 돼요.`);
  if (!next.iosBlockCapture && saved.iosBlockCapture) risks.push("아이폰·아이패드에서 교재 화면을 캡처·녹화할 수 있게 돼요.");
  if (!next.androidBlockCapture && saved.androidBlockCapture) risks.push("안드로이드에서 교재 화면을 캡처·녹화할 수 있게 돼요.");
  return { risks, minVersionRaised: iosRaised || androidRaised };
}

/**
 * 화면이 부른 주소가 앱 서버에 아직 없을 때(앱 서버가 예전 판이면 404, 앱 서버가 붙이는 오류 이름이 없다)
 * 운영자가 읽을 말로 바꾼다. 그 밖의 오류는 받은 그대로 돌려준다.
 */
export function olderServerError(error) {
  if (!error) return null;
  if (error.status !== 404 || error.code) return error;
  return new Error("앱 서버에 아직 이 기능이 없어요. 개발자에게 알려 주세요.");
}

/** 서버 점검 결과가 오래됐는지. 점검은 5분마다 돈다. */
export function serverCheckAge(checkedAtSeconds, nowMs = Date.now()) {
  const minutes = Math.max(0, Math.round((nowMs / 1000 - checkedAtSeconds) / 60));
  return { minutes, stale: minutes > 15 };
}
