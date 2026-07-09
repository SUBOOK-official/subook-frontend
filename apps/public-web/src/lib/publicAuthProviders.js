// 로그인 수단(auth provider) 안내 유틸.
//
// 계정 정책(2026-07-10 확정): 인증된 동일 이메일 = 1인 1계정.
// Supabase가 같은(인증된) 이메일의 소셜/이메일 로그인을 한 계정에 자동 연결하므로,
// 남는 혼란 케이스는 "소셜로만 가입한 사람이 비밀번호 로그인/재가입을 시도"하는 상황이다.
// get_member_auth_providers RPC(provider 목록만 반환, PII 노출 X) 결과를 안내 문구로 바꾼다.

const PROVIDER_LABELS = {
  kakao: "카카오",
  google: "Google",
  email: "이메일",
};

export function normalizeProviders(rawProviders) {
  if (!Array.isArray(rawProviders)) {
    return [];
  }
  return [
    ...new Set(
      rawProviders.filter((provider) => typeof provider === "string" && provider),
    ),
  ];
}

export function getSocialProviderLabels(providers) {
  return normalizeProviders(providers)
    .filter((provider) => provider !== "email")
    .map((provider) => PROVIDER_LABELS[provider] ?? provider);
}

// 소셜 identity만 있고 이메일(비밀번호) identity가 없는 계정 = 비밀번호 로그인 불가 계정.
export function isSocialOnlyAccount(providers) {
  const normalized = normalizeProviders(providers);
  return normalized.length > 0 && !normalized.includes("email");
}

export function buildSocialOnlyLoginMessage(providers) {
  const labels = getSocialProviderLabels(providers);
  if (!labels.length) {
    return "";
  }
  const joined = labels.join(" 또는 ");
  const buttons = labels.map((label) => `'${label}로 시작하기'`).join(" 또는 ");
  return `이 이메일은 ${joined} 로그인으로 가입된 계정이에요. 위의 ${buttons} 버튼으로 로그인해 주세요.`;
}

export function buildSocialDuplicateSignupMessage(providers) {
  const labels = getSocialProviderLabels(providers);
  if (!labels.length) {
    return "";
  }
  return `이미 ${labels.join(" 또는 ")} 로그인으로 가입된 이메일이에요.`;
}
