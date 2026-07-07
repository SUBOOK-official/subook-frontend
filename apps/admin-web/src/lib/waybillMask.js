// CJ 표준 운송장 마스킹 유틸
// 규격서(표준운송장가이드 1.5인치) 마스킹 규칙 + 샘플 라벨("홍*동", "010-1234-****") 기준.
// - 수화인/송화인 이름: 두 번째 글자 마스킹 (공백 제외 규칙은 단순화 — 대부분 실명 2~4자).
// - 전화번호: 마지막 4자리 마스킹 (하이픈 유지).
// ⚠ CJ 강화 규칙(2번째 글자)과 국토부 권고안(1·3번째 외)이 규격서에 혼재. 샘플 라벨과
//   CJ 강화 규칙 헤드라인을 따라 '2번째 글자'로 구현. CJ 샘플 검증 시 필요하면 조정.

export function maskName(name) {
  const s = String(name ?? "").trim();
  if (s.length <= 1) {
    return s;
  }
  // 첫 글자 + '*' + 세 번째 글자부터 유지 → 홍길동→홍*동, 홍길→홍*, 김수현→김*현
  return s[0] + "*" + s.slice(2);
}

export function maskPhone(phone) {
  const s = String(phone ?? "");
  // 숫자 문자 위치를 모아 마지막 4개를 '*'로. (하이픈/공백 등 포맷은 유지)
  const digitIdx = [];
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] >= "0" && s[i] <= "9") {
      digitIdx.push(i);
    }
  }
  if (digitIdx.length < 4) {
    return s;
  }
  const maskSet = new Set(digitIdx.slice(-4));
  return s
    .split("")
    .map((ch, i) => (maskSet.has(i) ? "*" : ch))
    .join("");
}
