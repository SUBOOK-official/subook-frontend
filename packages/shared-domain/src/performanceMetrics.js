const DAY_MS = 86_400_000;
export const PERFORMANCE_MAX_DAYS = 366;
export const PERFORMANCE_PRESETS = [
  { key: "today", label: "오늘", days: 1 },
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "month", label: "이번 달" },
];

export function koreaToday(now = new Date()) {
  return new Date(new Date(now).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function validatePerformanceRange(from, to, today = koreaToday()) {
  for (const date of [from, to]) {
    if (typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return "시작일과 종료일을 입력해주세요.";
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return "올바른 날짜를 입력해주세요.";
  }
  if (from > to) return "시작일은 종료일보다 늦을 수 없습니다.";
  if (to > today) return "오늘 이후 날짜는 조회할 수 없습니다.";
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > PERFORMANCE_MAX_DAYS) return "한 번에 최대 366일까지 조회할 수 있습니다.";
  return "";
}

export function performanceRange(preset = "7d", today = koreaToday()) {
  const item = PERFORMANCE_PRESETS.find((entry) => entry.key === preset) ?? PERFORMANCE_PRESETS[1];
  return { from: item.key === "month" ? `${today.slice(0, 7)}-01` : shiftDate(today, 1 - item.days), to: today };
}

export function previousPerformanceRange({ from, to }) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  return { from: shiftDate(from, -days), to: shiftDate(from, -1) };
}

export function metricRatio(numerator, denominator, multiplier = 1) {
  if (numerator == null || denominator == null || !Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) return null;
  return Number(numerator) / Number(denominator) * multiplier;
}

export function metricChange(current, previous, percentagePoints = false) {
  if (current == null || previous == null) return null;
  if (percentagePoints) return { value: current - previous, unit: "%p" };
  if (previous === 0) return current === 0 ? { value: 0, unit: "%" } : null;
  return { value: (current - previous) / Math.abs(previous) * 100, unit: "%" };
}

export function formatPerformanceValue(value, format = "count") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (format === "percent") return `${number.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
  if (format === "money") return `${Math.round(number).toLocaleString("ko-KR")}원`;
  return number.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function mergePerformanceDaily(sales = [], ga = null, meta = null) {
  const gaDates = new Map((ga?.daily ?? []).map((row) => [row.date, row]));
  const metaDates = new Map((meta?.daily ?? []).map((row) => [row.date, row]));
  return sales.map((row) => {
    const traffic = gaDates.get(row.date);
    const ads = metaDates.get(row.date);
    return {
      ...row,
      visitors: ga?.status === "ready" ? traffic?.visitors ?? 0 : null,
      cvr: ga?.status === "ready" ? traffic?.cvr ?? null : null,
      spend: meta?.status === "ready" ? ads?.spend ?? 0 : null,
      cpa: meta?.status === "ready" ? ads?.cpa ?? null : null,
      roas: meta?.status === "ready" ? ads?.roas ?? null : null,
    };
  });
}
