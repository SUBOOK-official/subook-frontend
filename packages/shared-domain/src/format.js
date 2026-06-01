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

function isPlaceholderEmail(email) {
  if (!email) return false;
  return String(email).toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
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

/**
 * 이름 마스킹 — 목록 화면용. 가운데 글자를 가려 식별 가능성을 낮추되 첫/끝 글자는 보존.
 * 한국 이름 기준: 2글자=끝글자(홍길→홍*), 3글자+=가운데 전부(홍길동→홍*동, 남궁민수→남**수).
 * 1글자는 그대로. 공백 포함 이름(외국식)은 각 토큰을 같은 규칙으로 처리.
 * 상세 모달 등 명시적으로 본 행에서는 풀네임을 쓰고, 목록에서만 이걸 쓴다.
 */
export function maskName(name) {
  if (!name) return "-";
  const raw = String(name).trim();
  if (!raw) return "-";

  const maskToken = (token) => {
    const chars = Array.from(token);
    if (chars.length <= 1) return token;
    if (chars.length === 2) return `${chars[0]}*`;
    return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
  };

  return raw
    .split(/\s+/)
    .map(maskToken)
    .join(" ");
}
