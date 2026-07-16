// 제주·도서산간 배송 추가비 판정 — 서버 get_remote_area_surcharge(SQL)와 미러.
// ⚠ 범위를 수정하면 반드시 백엔드 함수와 세트로 (마이그레이션
//    20260716062728_remote_area_shipping_surcharge.sql 참고).
// 현재는 확실한 범위만: 제주(63000–63644) + 울릉·독도(40200–40240).
// 기타 도서 지역은 CJ 공식 도서산간 우편번호 목록 확보 후 RANGES에 추가.
export const REMOTE_AREA_SURCHARGE = 5000;

const REMOTE_AREA_RANGES = [
  { from: 63000, to: 63644, label: "제주" },
  { from: 40200, to: 40240, label: "울릉·독도" },
];

export function getRemoteAreaInfo(postalCode) {
  const digits = String(postalCode ?? "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  const code = Number(digits);
  if (!Number.isFinite(code)) {
    return null;
  }
  const matched = REMOTE_AREA_RANGES.find((range) => code >= range.from && code <= range.to);
  return matched ? { label: matched.label, surcharge: REMOTE_AREA_SURCHARGE } : null;
}

export function getRemoteAreaSurcharge(postalCode) {
  return getRemoteAreaInfo(postalCode)?.surcharge ?? 0;
}
