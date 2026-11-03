// 개별 위치가 없으면 현재 기본 위치를 쓴다. 기본값을 행에 복사하지 않아야
// 첫 행·나중에 추가한 행·복원한 초안 모두 같은 규칙으로 표시하고 제출할 수 있다.
export function getRegisterLocation(location, batchLocation) {
  const individual = String(location ?? "");
  return individual.trim() ? individual : String(batchLocation ?? "");
}
