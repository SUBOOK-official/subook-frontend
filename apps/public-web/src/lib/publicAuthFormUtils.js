const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasLetterPattern = /[A-Za-z]/;
const hasNumberPattern = /\d/;
// 특수문자는 ASCII 기호만 인정 — [^A-Za-z0-9]로 두면 한글이 특수문자로 집계돼
// 한글 섞인 비밀번호가 '강함'으로 표시되는 버그가 있었다.
const hasSpecialCharacterPattern = /[!-/:-@[-`{-~]/;
// 비밀번호 허용 문자 = 출력 가능한 ASCII(영문·숫자·특수문자). 한글·공백·이모지 등 금지.
// IME로 입력한 한글 비밀번호는 기기·브라우저별 인코딩이 갈려 로그인 실패의 원인이 된다.
const allowedPasswordPattern = /^[!-~]*$/;

export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export function isValidEmailFormat(value) {
  return emailPattern.test(normalizeEmail(value));
}

export function sanitizePhoneNumber(value) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatPhoneNumber(value) {
  const digits = sanitizePhoneNumber(value);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function hasValidPhoneNumber(value) {
  const digits = sanitizePhoneNumber(value);
  return digits.length === 10 || digits.length === 11;
}

// 한국 휴대전화 정규식 (010/011/016/017/018/019). 픽업·주문 안내 SMS용으로
// 일반 지역번호(02 등)는 거부한다. 010이면 11자리, 그 외는 10자리만 허용.
export function isValidKoreanMobile(value) {
  const digits = sanitizePhoneNumber(value);
  if (digits.length === 11) {
    return digits.startsWith("010");
  }
  if (digits.length === 10) {
    return /^01[16789]/.test(digits);
  }
  return false;
}

export function hasOnlyAllowedPasswordCharacters(password) {
  return allowedPasswordPattern.test(password ?? "");
}

export function getPasswordStrengthState(password) {
  const normalizedPassword = password ?? "";
  // 필수 3개(length, letter, number)는 회원가입 조건과 일치 — hasRequiredPasswordConditions와
  // 동일 룰. 4번째(특수문자)는 권장 강도용으로만 분리.
  const rules = [
    { key: "length", label: "8자 이상", required: true, satisfied: normalizedPassword.length >= 8 },
    { key: "letter", label: "영문 포함", required: true, satisfied: hasLetterPattern.test(normalizedPassword) },
    { key: "number", label: "숫자 포함", required: true, satisfied: hasNumberPattern.test(normalizedPassword) },
    {
      key: "special",
      label: "특수문자 포함",
      required: false,
      satisfied: hasSpecialCharacterPattern.test(normalizedPassword),
    },
  ];
  const satisfiedCount = rules.filter((rule) => rule.satisfied).length;
  // 한글·공백 등 허용 외 문자 — 강도와 무관하게 '사용 불가'로 강등해 즉시 보이게 한다.
  const hasDisallowedCharacters = !hasOnlyAllowedPasswordCharacters(normalizedPassword);

  let label;
  let tone;
  if (satisfiedCount <= 1) {
    label = normalizedPassword ? "약함" : "미입력";
    tone = normalizedPassword ? "danger" : "muted";
  } else if (satisfiedCount <= 3) {
    label = "보통";
    tone = "warning";
  } else {
    label = "강함";
    tone = "success";
  }

  if (hasDisallowedCharacters) {
    label = "사용 불가";
    tone = "danger";
  }

  return {
    rules,
    satisfiedCount,
    label,
    tone,
    hasDisallowedCharacters,
  };
}

export function hasRequiredPasswordConditions(password) {
  const normalizedPassword = password ?? "";
  return (
    normalizedPassword.length >= 8 &&
    hasLetterPattern.test(normalizedPassword) &&
    hasNumberPattern.test(normalizedPassword) &&
    hasOnlyAllowedPasswordCharacters(normalizedPassword)
  );
}
