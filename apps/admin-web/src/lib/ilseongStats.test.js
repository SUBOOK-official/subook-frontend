import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATS_PERIOD,
  STATS_PERIODS,
  barPercent,
  formatStatsDay,
  formatStudyTime,
  maxOf,
  newestFirst,
  percentOf,
  studentSteps,
  weekdayLabel,
} from "./ilseongStats.js";

test("고르는 기간은 앱 서버가 받는 7–90일 안이고 기본은 30일이다", () => {
  assert.deepEqual(STATS_PERIODS, [7, 30, 90]);
  assert.equal(STATS_PERIODS.includes(DEFAULT_STATS_PERIOD), true);
  assert.equal(DEFAULT_STATS_PERIOD, 30);
});

test("공부 시간: 초를 몇 시간 몇 분으로", () => {
  assert.equal(formatStudyTime(812400), "225시간 40분");
  assert.equal(formatStudyTime(812340), "225시간 39분");
  assert.equal(formatStudyTime(43200), "12시간");
  assert.equal(formatStudyTime(2400), "40분");
  assert.equal(formatStudyTime(3600), "1시간");
  assert.equal(formatStudyTime(3660), "1시간 1분");
  // 초는 버린다. 1분이 안 되면 0분이라고 하지 않는다
  assert.equal(formatStudyTime(119), "1분");
  assert.equal(formatStudyTime(59), "1분 미만");
  assert.equal(formatStudyTime(1), "1분 미만");
  // 천 시간이 넘으면 자릿점을 찍는다
  assert.equal(formatStudyTime(1234 * 3600 + 5 * 60), "1,234시간 5분");
});

test("공부 시간: 없는 값·이상한 값은 0분", () => {
  assert.equal(formatStudyTime(0), "0분");
  assert.equal(formatStudyTime(undefined), "0분");
  assert.equal(formatStudyTime(null), "0분");
  assert.equal(formatStudyTime(-30), "0분");
  assert.equal(formatStudyTime("이상한 값"), "0분");
  assert.equal(formatStudyTime("120"), "2분");
});

test("몇 %: 나눌 값이 0이면 견주지 않는다", () => {
  assert.equal(percentOf(95, 120), 79);
  assert.equal(percentOf(80, 95), 84);
  assert.equal(percentOf(61, 80), 76);
  assert.equal(percentOf(0, 120), 0);
  assert.equal(percentOf(120, 120), 100);
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(2, 3), 67);
  assert.equal(percentOf(5, 0), null);
  assert.equal(percentOf(0, 0), null);
  assert.equal(percentOf(5, undefined), null);
  assert.equal(percentOf(undefined, 10), 0);
});

test("가입 → 교재 등록 → 필기 → 완료: 단계마다 학생 수와 앞 단계의 몇 %", () => {
  const steps = studentSteps({ users: 120, registered: 95, wrote: 80, completed: 61 });
  assert.deepEqual(steps.map((step) => step.label), ["가입한 학생", "교재를 등록한 학생", "필기를 한 학생", "완료를 기록한 학생"]);
  assert.deepEqual(steps.map((step) => step.count), [120, 95, 80, 61]);
  assert.deepEqual(steps.map((step) => step.share), [null, 79, 84, 76]);
});

test("단계: 아직 아무도 없거나 값이 빠져 있어도 깨지지 않는다", () => {
  assert.deepEqual(studentSteps({ users: 0, registered: 0, wrote: 0, completed: 0 }).map((step) => [step.count, step.share]), [
    [0, null], [0, null], [0, null], [0, null],
  ]);
  assert.deepEqual(studentSteps(undefined).map((step) => step.count), [0, 0, 0, 0]);
  assert.deepEqual(studentSteps({ users: 10 }).map((step) => step.share), [null, 0, null, null]);
  // 노트에만 필기한 학생이 있으면 앞 단계보다 많을 수 있다. 받은 숫자 그대로 둔다
  assert.equal(studentSteps({ users: 10, registered: 4, wrote: 5, completed: 2 })[2].share, 125);
});

test("날짜와 요일: 달력의 날짜 그대로 읽는다", () => {
  assert.equal(weekdayLabel("2026-11-24"), "화");
  assert.equal(weekdayLabel("2026-11-22"), "일");
  assert.equal(weekdayLabel("2026-11-28"), "토");
  assert.equal(weekdayLabel("2026-10-26"), "월");
  assert.equal(formatStatsDay("2026-11-24"), "11월 24일 (화)");
  assert.equal(formatStatsDay("2026-01-05"), "1월 5일 (월)");
  // 윤년
  assert.equal(formatStatsDay("2028-02-29"), "2월 29일 (화)");
});

test("날짜 모양이 아니면 요일을 지어내지 않는다", () => {
  assert.equal(weekdayLabel("2026-02-31"), "");
  assert.equal(weekdayLabel("2026-11-24T00:00:00Z"), "");
  assert.equal(weekdayLabel(undefined), "");
  assert.equal(formatStatsDay("어제"), "어제");
  assert.equal(formatStatsDay(null), "");
  assert.equal(formatStatsDay("2026-13-01"), "2026-13-01");
});

test("날짜별 줄은 최근 날짜부터 보여 준다(받은 목록은 건드리지 않는다)", () => {
  const daily = [{ date: "2026-10-26" }, { date: "2026-11-24" }, { date: "2026-11-01" }];
  assert.deepEqual(newestFirst(daily).map((row) => row.date), ["2026-11-24", "2026-11-01", "2026-10-26"]);
  assert.deepEqual(daily.map((row) => row.date), ["2026-10-26", "2026-11-24", "2026-11-01"]);
  assert.deepEqual(newestFirst(undefined), []);
  assert.deepEqual(newestFirst([]), []);
});

test("막대 길이: 기간에서 가장 큰 날을 꽉 채운다", () => {
  const daily = [{ activeUsers: 12 }, { activeUsers: 48 }, { activeUsers: 0 }, {}];
  assert.equal(maxOf(daily, "activeUsers"), 48);
  assert.equal(maxOf([], "activeUsers"), 0);
  assert.equal(maxOf(undefined, "activeUsers"), 0);
  assert.equal(barPercent(48, 48), 100);
  assert.equal(barPercent(12, 48), 25);
  assert.equal(barPercent(0, 48), 0);
  // 아주 작은 값도 막대가 보이게 한다
  assert.equal(barPercent(1, 400), 4);
  // 모두 0인 기간, 기준보다 큰 값
  assert.equal(barPercent(0, 0), 0);
  assert.equal(barPercent(5, 0), 0);
  assert.equal(barPercent(60, 48), 100);
});
