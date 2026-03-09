const POLICY_CHANGE_DATE = "2026-02-03";

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

export function getSettlementInfo(priceInput, pickupDate) {
  const price = toValidPrice(priceInput);
  if (price === null) {
    return null;
  }

  // Old policy applies only when pickup date is strictly before 2026-02-03.
  const pickupDateOnly = normalizeDateOnly(pickupDate);
  const isLegacyPolicy = pickupDateOnly ? pickupDateOnly < POLICY_CHANGE_DATE : false;
  const isLowPrice = price < 10000;

  let feePercent;
  if (isLegacyPolicy) {
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
