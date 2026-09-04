// OAuth 콜백 URL의 에러 파라미터 파싱 + 사용자 안내 문구 매핑.
//
// GoTrue는 소셜 로그인 실패 시 redirectTo로 에러를 되돌려보낸다:
//   - PKCE flow:     ?error=...&error_code=...&error_description=...
//   - implicit flow: #error=...&error_code=...&error_description=...
// 기존 콜백 페이지는 이를 무시하고 "로그인이 만료되었거나 실패했어요"만 노출했다.
// 여기서 파싱해 상황별 한국어 안내로 바꾼다. 문자열 매칭은 GoTrue 에러 메시지에 대한
// 휴리스틱이라 매칭 실패 시 일반 안내로 자연 강등된다.

export function parseOAuthCallbackError(search, hash) {
  const merged = new URLSearchParams();

  for (const raw of [search, hash]) {
    const trimmed = String(raw || "").replace(/^[#?]/, "");
    if (!trimmed) {
      continue;
    }
    const params = new URLSearchParams(trimmed);
    for (const [key, value] of params) {
      if (!merged.has(key)) {
        merged.append(key, value);
      }
    }
  }

  const error = merged.get("error") || "";
  const errorCode = merged.get("error_code") || "";
  const errorDescription = merged.get("error_description") || "";

  if (!error && !errorCode && !errorDescription) {
    return null;
  }

  return { error, errorCode, errorDescription };
}

const ALREADY_REGISTERED_CODES = new Set([
  "email_exists",
  "user_already_exists",
  "identity_already_exists",
]);

// 콜백 에러의 사유 분류 — 안내 문구(buildOAuthCallbackErrorNotice)와 같은 분기를 쓰되
// GA4 error_reason처럼 기계 판독 가능한 짧은 열거값만 돌려준다.
// already_registered / email_not_provided / user_cancelled / other (에러 없으면 "").
export function classifyOAuthCallbackError(errorInfo) {
  if (!errorInfo) {
    return "";
  }

  const error = (errorInfo.error || "").toLowerCase();
  const code = (errorInfo.errorCode || "").toLowerCase();
  const description = (errorInfo.errorDescription || "").toLowerCase();

  // 1) 이미 다른 수단으로 가입된 이메일 (미인증 이메일 등으로 자동 연결이 불가한 케이스)
  if (
    ALREADY_REGISTERED_CODES.has(code) ||
    /already|registered|exists|linked/.test(description)
  ) {
    return "already_registered";
  }

  // 2) 소셜 계정에서 이메일을 받지 못함 (동의 화면에서 이메일 제공 미동의 등)
  if (description.includes("email") || code.includes("email")) {
    return "email_not_provided";
  }

  // 3) 유저가 소셜 동의 화면에서 취소
  if (error === "access_denied") {
    return "user_cancelled";
  }

  return "other";
}

export function buildOAuthCallbackErrorNotice(errorInfo) {
  if (!errorInfo) {
    return "";
  }

  switch (classifyOAuthCallbackError(errorInfo)) {
    case "already_registered":
      return "이미 가입된 이메일이에요. 처음 가입했던 방법(카카오·Google·이메일)으로 로그인해 주세요.";
    case "email_not_provided":
      return "소셜 계정에서 이메일 정보를 받지 못해 로그인할 수 없었어요. 다시 시도하고 동의 화면에서 이메일 제공에 동의해 주세요.";
    case "user_cancelled":
      return "소셜 로그인이 취소되었어요. 다시 시도해 주세요.";
    default:
      break;
  }

  // 그 외 — 원문 사유를 곁들인 일반 안내
  if (errorInfo.errorDescription) {
    return `소셜 로그인에 실패했어요. (${errorInfo.errorDescription}) 잠시 후 다시 시도하시거나 이메일 로그인으로 계속해 주세요.`;
  }

  return "소셜 로그인에 실패했어요. 잠시 후 다시 시도하시거나 이메일 로그인으로 계속해 주세요.";
}
