// Supabase 환경변수 누락 시, 화면의 안내 문구만으로는 원인을 알 수 없어
// 콘솔에 누락된 변수명과 해결 방법을 구체적으로 남긴다.
// 환경변수는 dev 서버 시작/빌드 시점에 주입되므로 .env 수정 후에는 재시작이 필요하다.
export function reportMissingSupabaseEnv(clientLabel, { url, anonKey }) {
  const describeEntry = (label, entry) =>
    `- ${label}: ${entry.candidates.join(" 또는 ")} → ${entry.value ? "OK" : "누락"}`;

  const lines = [
    `[shared-supabase] Supabase 환경변수가 없어 ${clientLabel} 클라이언트를 만들지 못했습니다.`,
    describeEntry("URL", url),
    describeEntry("ANON KEY", anonKey),
    "로컬 개발: frontend/.env(단독 클론이면 저장소 루트의 .env)에 값을 채운 뒤 dev 서버를 재시작하세요.",
    "필요한 변수 목록은 frontend/.env.example 참고.",
  ];

  console.error(lines.join("\n"));
}
