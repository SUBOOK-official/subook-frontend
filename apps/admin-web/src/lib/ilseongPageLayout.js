// 교재 쪽 구성 계산 — 한 과목의 모든 교재를 PDF로 한 번에 올릴 때, 어느 쪽부터 어느 쪽까지가 어느 교재인지,
// 그 교재 안에서 하루 분량마다 몇 쪽부터 몇 쪽까지인지를 정한다. 화면 없이 계산만 한다.
// 교재마다 하루 분량의 수가 다를 수 있다(학습지 구성은 운영진이 정한다).

/** 일성월심 한 주차의 기본 구성(도입 2쪽, DAY 1–5 6쪽씩, DAY 6·7 4쪽씩 = 40쪽). */
export const DEFAULT_WEEK_LAYOUT = "2, 6, 6, 6, 6, 6, 4, 4";

/** 하루 분량이 7개인 교재는 일성월심의 기본 구성을 채워 둔다. 그 밖은 비워 두고 직접 적게 한다. */
export function defaultLayoutText(dayCount) {
  return dayCount === 7 ? DEFAULT_WEEK_LAYOUT : "";
}

/**
 * "2, 6, 6, 6, 6, 6, 4, 4" → { intro, days }. 빈 칸은 그 주차를 올리지 않는다는 뜻(null).
 * 잘못 쓰면 보여 줄 문구를 담아 던진다.
 */
export function parseWeekLayout(text, dayCount) {
  const parts = String(text || "").split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => !/^\d{1,3}$/.test(part))) throw new Error("숫자만 쉼표로 나눠 적어 주세요");
  const numbers = parts.map(Number);
  if (numbers.length !== dayCount + 1) throw new Error(`숫자 ${dayCount + 1}개(도입 1개 + 하루 분량 ${dayCount}개)를 적어 주세요`);
  if (numbers.slice(1).some((pages) => pages < 1)) throw new Error("하루 분량마다 1쪽 이상이어야 해요");
  return { intro: numbers[0], days: numbers.slice(1) };
}

export function layoutPageCount(layout) {
  return layout.intro + layout.days.reduce((sum, pages) => sum + pages, 0);
}

/** 구성을 DAY별 시작·끝 쪽으로 바꾼다(도입 다음 쪽부터 이어서). */
export function layoutDayRanges(book, layout) {
  let next = layout.intro + 1;
  return [...book.days]
    .sort((a, b) => a.dayNo - b.dayNo)
    .map((day, index) => {
      const startPage = next;
      next += layout.days[index];
      return { dayNo: day.dayNo, startPage, endPage: next - 1 };
    });
}

/**
 * 교재마다의 해설 쪽 수를 읽는다. 빈 글 → 해설 없음, 숫자 하나 → 모든 교재에 같은 쪽 수, 교재 수만큼 → 교재마다.
 * @param count 올릴 교재 수
 */
export function parseAnswerCounts(text, count) {
  const parts = String(text || "").split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return Array(count).fill(0);
  if (parts.some((part) => !/^\d{1,3}$/.test(part))) throw new Error("해설 쪽 수는 숫자만 쉼표로 나눠 적어 주세요");
  const numbers = parts.map(Number);
  if (numbers.length === 1) return Array(count).fill(numbers[0]);
  if (numbers.length !== count) throw new Error(`해설 쪽 수는 숫자 하나(모든 교재에 같게)나 ${count}개(올릴 교재마다 하나씩)를 적어 주세요`);
  return numbers;
}

/**
 * 주차별 구성 글을 읽어, 이어 붙인 PDF의 어느 쪽부터가 어느 주차인지 정한다.
 * 해설이 있으면 교재의 쪽 = 본문 쪽 + 해설 쪽이고, 해설은 본문 바로 뒤에 놓인다(앱 저장소 docs/adr/0045).
 * @param weeks        주차 순서대로 놓은 교재
 * @param layoutTexts  주차마다의 구성 글(빈 글이면 그 주차는 건너뛴다)
 * @param answers      { text: 교재마다의 해설 쪽 수 글, atEnd: 해설이 PDF 맨 뒤에 모여 있는가(아니면 교재마다 본문 뒤) }
 * @returns {{ parsed: {layout: object|null, problem: string|null}[], problem: string|null, total: number,
 *            plans: {book: object, layout: object, first: number, bodyPages: number,
 *                    answerFirst: number|null, answerPages: number, pages: number}[] }}
 *          first = 본문 첫 쪽이 PDF의 몇 쪽인가, answerFirst = 해설 첫 쪽이 PDF의 몇 쪽인가, pages = 그 교재의 쪽 수(본문 + 해설)
 */
export function planSubjectUpload(weeks, layoutTexts, answers = { text: "", atEnd: false }) {
  const parsed = weeks.map((book, index) => {
    try {
      return { layout: parseWeekLayout(layoutTexts[index], book.days.length), problem: null };
    } catch (error) {
      return { layout: null, problem: error instanceof Error ? error.message : "구성을 읽지 못했어요" };
    }
  });
  const included = parsed.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.layout);
  let problem = parsed.find((entry) => entry.problem)?.problem ?? null;
  let counts = Array(included.length).fill(0);
  try {
    counts = parseAnswerCounts(answers.text, included.length);
  } catch (error) {
    problem = problem ?? (error instanceof Error ? error.message : "해설 쪽 수를 읽지 못했어요");
  }
  const plans = [];
  let cursor = 1;
  included.forEach(({ entry, index }, order) => {
    const bodyPages = layoutPageCount(entry.layout);
    const answerPages = counts[order];
    const plan = { book: weeks[index], layout: entry.layout, first: cursor, bodyPages, answerFirst: null, answerPages, pages: bodyPages + answerPages };
    cursor += bodyPages;
    if (!answers.atEnd && answerPages > 0) {
      plan.answerFirst = cursor;
      cursor += answerPages;
    }
    plans.push(plan);
  });
  if (answers.atEnd) {
    plans.forEach((plan) => {
      if (plan.answerPages === 0) return;
      plan.answerFirst = cursor;
      cursor += plan.answerPages;
    });
  }
  return { parsed, problem, plans, total: cursor - 1 };
}

/** 교재의 k번째 쪽(1부터)이 이어 붙인 PDF의 몇 쪽인가. 본문 다음에 해설이 온다. */
export function sourcePageOf(plan, k) {
  return k <= plan.bodyPages ? plan.first + k - 1 : plan.answerFirst + (k - plan.bodyPages - 1);
}

/** 해설이 시작하는 쪽(교재 안에서). 해설이 없으면 null. */
export function answerStartOf(plan) {
  return plan.answerPages > 0 ? plan.bodyPages + 1 : null;
}

/** "1주차 1–40쪽 + 해설 41–52쪽"처럼, PDF의 어느 쪽이 어느 교재로 가는지 한 줄로. */
export function planLabel(plan) {
  const body = `${plan.book.label} ${plan.first}–${plan.first + plan.bodyPages - 1}쪽`;
  return plan.answerPages > 0 ? `${body} + 해설 ${plan.answerFirst}–${plan.answerFirst + plan.answerPages - 1}쪽` : body;
}

/** 교재 목록의 "DAY별 쪽" 칸. 정한 DAY가 없으면 null. */
export function dayPagesLabel(days) {
  const set = (days || []).filter((day) => day.startPage !== null && day.startPage !== undefined);
  if (set.length === 0) return null;
  return set.map((day) => `${day.dayNo}: ${day.startPage}–${day.endPage}`).join(" · ");
}

/** 쪽 번호를 열 개까지만 늘어놓는다(이미지가 없는 쪽 안내). */
export function pageNumbersLabel(list) {
  const head = list.slice(0, 10).join(", ");
  return list.length > 10 ? `${head} 등 ${list.length}쪽` : `${head}쪽`;
}

/**
 * 한 주차 편집 창에서 "이어 채우기": 앞 DAY 끝 다음 쪽부터, 앞 DAY와 같은 쪽 수로.
 * 앞 DAY의 끝 쪽이 비어 있으면 null.
 * @param previous { start: string, end: string }  입력 칸의 글자 그대로
 */
export function continueDayRange(previous) {
  if (!previous || previous.end === "") return null;
  const span = previous.start === "" ? 0 : Number(previous.end) - Number(previous.start);
  const start = Number(previous.end) + 1;
  return { start: String(start), end: String(start + span) };
}
