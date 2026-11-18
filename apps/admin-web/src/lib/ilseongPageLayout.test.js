import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEEK_LAYOUT,
  continueDayRange,
  dayPagesLabel,
  layoutDayRanges,
  layoutPageCount,
  pageNumbersLabel,
  parseWeekLayout,
  planSubjectUpload,
} from "./ilseongPageLayout.js";

const days = (count) => Array.from({ length: count }, (_, index) => ({ dayNo: index + 1, startPage: null, endPage: null }));
const book = (week, pageCount = null) => ({ id: 100 + week, week, title: `통합과학 ${week}주차`, pageCount, days: days(7) });

test("기본 구성은 도입 2쪽 + DAY 7개 = 40쪽", () => {
  const layout = parseWeekLayout(DEFAULT_WEEK_LAYOUT, 7);
  assert.deepEqual(layout, { intro: 2, days: [6, 6, 6, 6, 6, 4, 4] });
  assert.equal(layoutPageCount(layout), 40);
});

test("구성 글: 쉼표·띄어쓰기 어느 쪽으로 나눠도 읽고, 빈 글은 '올리지 않음'이다", () => {
  assert.deepEqual(parseWeekLayout("2 6,6 ,6  6\t6,4,4", 7), { intro: 2, days: [6, 6, 6, 6, 6, 4, 4] });
  assert.equal(parseWeekLayout("", 7), null);
  assert.equal(parseWeekLayout("  , ", 7), null);
  // 도입이 없는 주차(0쪽)는 된다
  assert.deepEqual(parseWeekLayout("0,1,1,1,1,1,1,1", 7).intro, 0);
});

test("구성 글이 틀리면 고칠 곳을 알려 준다", () => {
  assert.throws(() => parseWeekLayout("2, 6, 6", 7), /숫자 8개\(도입, DAY 1–7\)/);
  assert.throws(() => parseWeekLayout("2, 6, 6, 6, 6, 6, 4, 4, 4", 7), /숫자 8개/);
  assert.throws(() => parseWeekLayout("2, 여섯, 6, 6, 6, 6, 4, 4", 7), /숫자만/);
  assert.throws(() => parseWeekLayout("2, 6.5, 6, 6, 6, 6, 4, 4", 7), /숫자만/);
  assert.throws(() => parseWeekLayout("2, -6, 6, 6, 6, 6, 4, 4", 7), /숫자만/);
  assert.throws(() => parseWeekLayout("2, 0, 6, 6, 6, 6, 4, 4", 7), /1쪽 이상/);
  assert.throws(() => parseWeekLayout("2, 6000, 6, 6, 6, 6, 4, 4", 7), /숫자만/);
});

test("DAY별 쪽 범위: 도입 다음 쪽부터 이어서, DAY 순서대로", () => {
  const layout = parseWeekLayout(DEFAULT_WEEK_LAYOUT, 7);
  const shuffled = { ...book(1), days: [...days(7)].reverse() };
  assert.deepEqual(layoutDayRanges(shuffled, layout), [
    { dayNo: 1, startPage: 3, endPage: 8 },
    { dayNo: 2, startPage: 9, endPage: 14 },
    { dayNo: 3, startPage: 15, endPage: 20 },
    { dayNo: 4, startPage: 21, endPage: 26 },
    { dayNo: 5, startPage: 27, endPage: 32 },
    { dayNo: 6, startPage: 33, endPage: 36 },
    { dayNo: 7, startPage: 37, endPage: 40 },
  ]);
  // 도입이 없으면 1쪽부터
  assert.equal(layoutDayRanges(book(1), parseWeekLayout("0,5,5,5,5,5,5,5", 7))[0].startPage, 1);
});

test("과목 전체 올리기: 주차마다 이어 붙인 PDF의 몇 쪽부터인지 정한다", () => {
  const weeks = [1, 2, 3].map((week) => book(week));
  const plan = planSubjectUpload(weeks, [DEFAULT_WEEK_LAYOUT, DEFAULT_WEEK_LAYOUT, DEFAULT_WEEK_LAYOUT]);
  assert.equal(plan.problem, null);
  assert.equal(plan.total, 120);
  assert.deepEqual(plan.plans.map((p) => [p.book.week, p.first, p.pages]), [[1, 1, 40], [2, 41, 40], [3, 81, 40]]);
});

test("과목 전체 올리기: 칸을 비운 주차는 건너뛰고 그다음 주차가 이어 받는다", () => {
  const weeks = [1, 2, 3].map((week) => book(week));
  const plan = planSubjectUpload(weeks, [DEFAULT_WEEK_LAYOUT, "", "2,6,6,6,6,6,6,6"]);
  assert.equal(plan.problem, null);
  assert.deepEqual(plan.plans.map((p) => [p.book.week, p.first, p.pages]), [[1, 1, 40], [3, 41, 44]]);
  assert.equal(plan.total, 84);
  assert.equal(plan.parsed[1].layout, null);
  assert.equal(plan.parsed[1].problem, null);
});

test("과목 전체 올리기: 한 주차라도 구성이 틀리면 그 까닭을 알려 준다", () => {
  const weeks = [1, 2].map((week) => book(week));
  const plan = planSubjectUpload(weeks, [DEFAULT_WEEK_LAYOUT, "2, 6"]);
  assert.match(plan.problem, /숫자 8개/);
  assert.match(plan.parsed[1].problem, /숫자 8개/);
  assert.equal(plan.parsed[0].problem, null);
  // 아무 주차도 고르지 않았으면 올릴 것이 없다
  assert.deepEqual(planSubjectUpload(weeks, ["", ""]).plans, []);
  assert.equal(planSubjectUpload(weeks, ["", ""]).total, 0);
});

test("목록의 DAY별 쪽 칸", () => {
  assert.equal(dayPagesLabel(days(7)), null);
  assert.equal(dayPagesLabel([]), null);
  assert.equal(
    dayPagesLabel([{ dayNo: 1, startPage: 3, endPage: 8 }, { dayNo: 2, startPage: null, endPage: null }, { dayNo: 3, startPage: 15, endPage: 20 }]),
    "1: 3–8 · 3: 15–20",
  );
});

test("이미지가 없는 쪽 안내는 열 개까지만 늘어놓는다", () => {
  assert.equal(pageNumbersLabel([3, 7]), "3, 7쪽");
  assert.equal(pageNumbersLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "1, 2, 3, 4, 5, 6, 7, 8, 9, 10 등 12쪽");
});

test("이어 채우기: 앞 DAY 끝 다음 쪽부터 같은 쪽 수로", () => {
  assert.deepEqual(continueDayRange({ start: "3", end: "8" }), { start: "9", end: "14" });
  // 앞 DAY의 시작이 비어 있으면 한 쪽짜리로
  assert.deepEqual(continueDayRange({ start: "", end: "8" }), { start: "9", end: "9" });
  assert.equal(continueDayRange({ start: "3", end: "" }), null);
  assert.equal(continueDayRange(undefined), null);
});
