// CJ 택배 표준 API Developer Guide V3.9.4 §1.2.4 (backend/docs/cj).
// 서적은 20kg 이내: 이형(05)·취급제한(06)은 수거 선택지에서 제외한다.
export const PICKUP_BOX_TYPES = Object.freeze([
  { code: "01", name: "극소", maxCm: 80, maxKg: 2 },
  { code: "02", name: "소", maxCm: 100, maxKg: 5 },
  { code: "03", name: "중", maxCm: 120, maxKg: 10 },
  { code: "04", name: "대1", maxCm: 140, maxKg: 15 },
  { code: "07", name: "대2", maxCm: 160, maxKg: 20 },
]);
export const MAX_PICKUP_BOXES = 5;
export const PICKUP_BOX_GUIDE_URL = "https://www.cjlogistics.com/ko/tool/parcel/reservation-general";
export const PICKUP_BOX_GUIDE = "가로+세로+높이의 합과 무게 중 더 큰 규격을 선택해 주세요. 한 변은 100cm, 한 박스는 160cm·20kg 이내로 포장해 주세요.";

export function pickupBoxLabel(code) {
  const type = PICKUP_BOX_TYPES.find((item) => item.code === code);
  return type ? `${type.name} · ${type.maxCm}cm / ${type.maxKg}kg 이하` : "규격 미선택";
}

export function resizePickupBoxTypes(codes, count) {
  const size = Number.isInteger(Number(count)) ? Math.min(MAX_PICKUP_BOXES, Math.max(0, Number(count))) : 0;
  return Array.from({ length: size }, (_, index) => Array.isArray(codes) ? codes[index] || "" : "");
}

export function validatePickupBoxes(count, codes) {
  if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > MAX_PICKUP_BOXES) {
    return `박스 수는 1~${MAX_PICKUP_BOXES}개로 입력해 주세요. 초과하면 수거 신청을 나눠 주세요.`;
  }
  if (!Array.isArray(codes) || codes.length !== Number(count)
      || codes.some((code) => !PICKUP_BOX_TYPES.some((type) => type.code === code))) {
    return "모든 박스의 CJ 규격을 선택해 주세요.";
  }
  return "";
}
