export const REFERRAL_REWARD_AMOUNT = 4000;
export const REFERRAL_MIN_ORDER_AMOUNT = 30000;
export const REFERRAL_EVENT_PATH = "/event/invite";

export function normalizeReferralCode(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : "";
}
