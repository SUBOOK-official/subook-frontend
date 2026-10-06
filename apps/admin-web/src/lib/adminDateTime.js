const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toKstInput(value) {
  if (!value) return "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time + KST_OFFSET_MS).toISOString().slice(0, 16) : "";
}

export function fromKstInput(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("한국시간 날짜와 시간을 확인해 주세요.");
  const parsed = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(parsed.getTime()) || toKstInput(parsed) !== value) throw new Error("올바른 날짜와 시간을 입력해 주세요.");
  return parsed.toISOString();
}

export function kstDateBounds(from, to) {
  return {
    from: from ? fromKstInput(`${from}T00:00`) : null,
    to: to ? new Date(new Date(fromKstInput(`${to}T00:00`)).getTime() + 86400000).toISOString() : null,
  };
}

export function couponAvailability(coupon, now = Date.now()) {
  if (!coupon.is_active) return "발급 중지";
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() <= now) return "만료";
  if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now) return "예정";
  if (coupon.total_quantity != null && Number(coupon.issued_count) >= Number(coupon.total_quantity)) return "발급 소진";
  return "발급 가능";
}
