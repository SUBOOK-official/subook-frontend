export const PROMOTION_PLACEMENTS = { home_hero: "홈 상단 배너", home_popup: "홈 팝업" };
export const PROMOTION_IMAGE_BUCKET = "site-promotions";
export const PROMOTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHUSEOK_PROMOTION_ID = "7dc09884-a380-4062-8099-0438aab03105";

// 내부 경로 또는 HTTPS만 허용. 프로토콜 상대 URL·제어 문자·역슬래시 우회 차단.
export function isPromotionUrl(value) {
  if (typeof value !== "string" || /[\s\\]/u.test(value)
    || Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function activePromotions(rows, now = Date.now()) {
  return rows.filter((row) => row.is_enabled && isPromotionUrl(row.image_url)
    && (!row.starts_at || Date.parse(row.starts_at) <= now)
    && (!row.ends_at || now < Date.parse(row.ends_at)))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function promotionStatus(row, now = Date.now()) {
  if (!row.is_enabled) return "비노출";
  if (row.ends_at && Date.parse(row.ends_at) <= now) return "종료";
  if (row.starts_at && Date.parse(row.starts_at) > now) return "예약";
  return "노출 중";
}

// 운영자의 OS 시간대와 관계없이 한국시간. 종료 입력은 해당 분의 마지막까지 포함한다.
export function toKstInput(value, inclusiveEnd = false) {
  if (!value) return "";
  const time = Date.parse(value) - (inclusiveEnd ? 60000 : 0);
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 16) : "";
}

export function fromKstInput(value, inclusiveEnd = false) {
  if (!value) return null;
  const time = Date.parse(`${value}:00+09:00`);
  if (!Number.isFinite(time) || toKstInput(new Date(time).toISOString()) !== value) throw new Error("노출 일시를 확인해 주세요.");
  return new Date(time + (inclusiveEnd ? 60000 : 0)).toISOString();
}

export function validatePromotion(row) {
  if (!PROMOTION_PLACEMENTS[row.placement]) return "노출 위치를 선택해 주세요.";
  if (!row.title?.trim() || row.title.length > 100) return "관리 제목을 100자 이내로 입력해 주세요.";
  if (!row.alt_text?.trim() || row.alt_text.length > 1000) return "이미지 설명을 1,000자 이내로 입력해 주세요.";
  if (!isPromotionUrl(row.image_url)) return "기본 이미지를 등록해 주세요.";
  if (row.mobile_image_url && !isPromotionUrl(row.mobile_image_url)) return "모바일 이미지 주소를 확인해 주세요.";
  if (row.link_url && !isPromotionUrl(row.link_url)) return "연결 주소는 /로 시작하는 내부 경로나 https:// 주소를 입력해 주세요.";
  if (!Number.isInteger(row.sort_order) || row.sort_order < 0 || row.sort_order > 9999) return "노출 순서는 0~9999 사이의 정수로 입력해 주세요.";
  if ([row.starts_at, row.ends_at].some((v) => v && !Number.isFinite(Date.parse(v)))) return "노출 일시를 확인해 주세요.";
  if (row.starts_at && row.ends_at && Date.parse(row.ends_at) <= Date.parse(row.starts_at)) return "종료 일시는 시작 일시 이후여야 합니다.";
  return "";
}

export function promotionDismissKey(id) {
  // 이관 전 닫은 추석 팝업을 같은 세션에 다시 띄우지 않는다.
  return id === CHUSEOK_PROMOTION_ID
    ? "subook.public.popup-banner.dismissed.chuseok-2026"
    : `subook.public.popup-banner.dismissed.${id}`;
}
