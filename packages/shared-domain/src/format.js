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

/**
 * 어드민 목록 화면 PII 마스킹 — 화면 캡처/공유 사고에 대비해 기본은 마스킹,
 * 상세 모달 등 사용자가 명시적으로 본 행에서만 풀스트링을 노출하는 패턴 권장.
 * 이메일: 앞 2-3자 + ***@도메인 (도메인은 보존해야 운영 식별 가능)
 */
export function maskEmail(email) {
  if (!email) return "-";
  if (isPlaceholderEmail(email)) return "(이메일 미등록)";
  const raw = String(email);
  const atIdx = raw.indexOf("@");
  if (atIdx <= 0) return raw;
  const local = raw.slice(0, atIdx);
  const domain = raw.slice(atIdx);
  if (local.length <= 2) return `${local[0] ?? "*"}*${domain}`;
  if (local.length <= 4) return `${local.slice(0, 2)}**${domain}`;
  return `${local.slice(0, 3)}***${domain}`;
}

/**
 * 전화번호 마스킹 — 한국 휴대폰 패턴 010-1234-5678 → 010-****-5678
 * (앞자리 + 끝 4자리는 유지해 운영 식별성 보존)
 */
export function maskPhone(phone) {
  if (!phone) return "-";
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "*".repeat(Math.max(1, digits.length));
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}
