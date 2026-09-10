const POLICY_CHANGE_DATE = "2026-02-03";
export const PICKUP_FEE_POLICY_VERSION = "2026-09";
export const PICKUP_FEE_POLICY = Object.freeze({ standardPercent: 45, lowPricePercent: 50, priceThreshold: 10000 });
export const PICKUP_FEE_POLICY_NOTICE = "변경된 수수료는 정책 시행 후 새로 접수한 수거 건부터 적용됩니다. 이전에 접수한 수거 건은 입고·판매·정산 시점과 관계없이 기존 요율을 유지합니다.";

function normalizeDateOnly(dateInput) {
  if (!dateInput) {
    return null;
  }

  const raw = String(dateInput).trim();
  const candidate = raw.length >= 10 ? raw.slice(0, 10) : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toValidPrice(priceInput) {
  if (priceInput === null || priceInput === undefined || priceInput === "") {
    return null;
  }

  const numericPrice = Number(priceInput);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return null;
  }

  return Math.trunc(numericPrice);
}

export function getSettlementInfo(priceInput, pickupDate, feePolicyVersion = null) {
  const price = toValidPrice(priceInput);
  if (price === null) {
    return null;
  }

  // Old policy applies only when pickup date is strictly before 2026-02-03.
  const pickupDateOnly = normalizeDateOnly(pickupDate);
  const isNewPolicy = feePolicyVersion === PICKUP_FEE_POLICY_VERSION;
  const isLegacyPolicy = !isNewPolicy && (pickupDateOnly ? pickupDateOnly < POLICY_CHANGE_DATE : false);
  const isLowPrice = price < PICKUP_FEE_POLICY.priceThreshold;

  let feePercent;
  if (isNewPolicy) {
    feePercent = isLowPrice ? PICKUP_FEE_POLICY.lowPricePercent : PICKUP_FEE_POLICY.standardPercent;
  } else if (isLegacyPolicy) {
    feePercent = isLowPrice ? 35 : 30;
  } else {
    feePercent = isLowPrice ? 45 : 40;
  }

  const netAmount = Math.floor(price * ((100 - feePercent) / 100));

  return {
    netAmount,
    feePercent,
    policyDate: pickupDateOnly,
    isLegacyPolicy,
  };
}
