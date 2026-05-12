export function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "미입력";
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) {
    return "미입력";
  }

  return `${numericAmount.toLocaleString("ko-KR")}원`;
}

/**
 * OAuth로 가입한 회원이 이메일 제공을 거부한 경우 placeholder 이메일이 채워짐.
 * (예: <uuid>@oauth.subook.local) — 실제 발송 가능한 주소가 아니므로 알림 발송 skip 필요.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "@oauth.subook.local";

export function isPlaceholderEmail(email) {
  if (!email) return false;
  return String(email).toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

/**
 * UI 표시용: placeholder 이메일은 "(미등록)"으로 마스킹.
 */
export function formatDisplayEmail(email) {
  if (!email) return "(미등록)";
  if (isPlaceholderEmail(email)) return "(이메일 미등록)";
  return String(email);
}
