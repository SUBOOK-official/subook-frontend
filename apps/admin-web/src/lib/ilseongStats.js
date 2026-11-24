// 「일성월심 앱」 › 통계 화면의 계산과 표기. 화면 없이 시험할 수 있게 여기에 둔다.
//
// 숫자는 앱 서버가 세어 준다(GET /api/admin/stats?days=7|30|90). 여기서는 그 숫자를
// 운영자가 읽는 말(몇 시간 몇 분, 앞 단계의 몇 %, 요일)로 바꾸기만 한다.

/** 고를 수 있는 기간(일). 앱 서버가 받는 범위(7–90) 안의 값이다. */
export const STATS_PERIODS = [7, 30, 90];
export const DEFAULT_STATS_PERIOD = 30;

/** 가입 → 교재 등록 → 필기 → 완료. key는 앱 서버가 주는 값의 이름이다. */
export const STUDENT_STEPS = [
  { key: "users", label: "가입한 학생" },
  { key: "registered", label: "교재를 등록한 학생" },
  { key: "wrote", label: "필기를 한 학생" },
  { key: "completed", label: "완료를 기록한 학생" },
];

/** 셀 수 있는 값만 남긴다(없는 값·음수·숫자가 아닌 값은 0). */
function countOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** 초 → "225시간 40분" / "3시간" / "40분". 1분이 안 되면 "1분 미만", 없으면 "0분". */
export function formatStudyTime(seconds) {
  const total = countOf(seconds);
  if (total === 0) return "0분";
  const minutes = Math.floor(total / 60);
  if (minutes === 0) return "1분 미만";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  const hoursText = `${hours.toLocaleString("ko-KR")}시간`;
  return rest === 0 ? hoursText : `${hoursText} ${rest}분`;
}

/** part가 whole의 몇 %인지(반올림한 정수). whole이 0이면 견줄 것이 없으니 null. */
export function percentOf(part, whole) {
  const base = countOf(whole);
  if (base === 0) return null;
  return Math.round((countOf(part) / base) * 100);
}

/**
 * 단계마다 학생 수와 "앞 단계의 몇 %"(share).
 * 첫 단계와, 앞 단계가 0명인 단계는 share가 null이다.
 * 노트에만 필기한 학생처럼 앞 단계를 거치지 않은 학생도 세기 때문에 100을 넘을 수 있다. 받은 숫자 그대로 보여 준다.
 */
export function studentSteps(funnel) {
  return STUDENT_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    count: countOf(funnel?.[step.key]),
    share: index === 0 ? null : percentOf(funnel?.[step.key], funnel?.[STUDENT_STEPS[index - 1].key]),
  }));
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-24" 모양의 학습 날짜를 읽는다. 시각이 아니라 달력의 날짜라서 시간대와 관계없다. */
function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2026-02-31처럼 없는 날짜는 받지 않는다
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { month, day, weekday: WEEKDAYS[date.getUTCDay()] };
}

/** "2026-11-24" → "화". 날짜 모양이 아니면 빈 글자. */
export function weekdayLabel(value) {
  return parseDay(value)?.weekday ?? "";
}

/** "2026-11-24" → "11월 24일 (화)". 날짜 모양이 아니면 받은 그대로. */
export function formatStatsDay(value) {
  const day = parseDay(value);
  return day ? `${day.month}월 ${day.day}일 (${day.weekday})` : String(value ?? "");
}

/** 날짜별 줄을 최근 날짜부터. 앱 서버는 오래된 날짜부터 준다. */
export function newestFirst(daily) {
  return [...(daily ?? [])].sort((a, b) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
}

/** 줄들에서 그 값의 가장 큰 것(막대 길이의 기준). 줄이 없으면 0. */
export function maxOf(rows, key) {
  return (rows ?? []).reduce((top, row) => Math.max(top, countOf(row?.[key])), 0);
}

/** 막대 길이(%): 기간에서 가장 큰 값을 100으로 본다. 값이 있으면 너무 가늘어 안 보이지 않게 4는 준다. */
export function barPercent(value, max) {
  const top = countOf(max);
  const mine = countOf(value);
  if (top === 0 || mine === 0) return 0;
  return Math.max(4, Math.min(100, Math.round((mine / top) * 100)));
}
