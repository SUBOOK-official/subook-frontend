// 「일성월심 앱」 › 학습지 화면의 계산. 화면 없이 시험할 수 있게 여기에 둔다.
//
// 학습지 구성은 앱 서버가 가진다(앱 저장소 docs/adr/0039): 학습지 → 과목 → 교재 → Day.
// 몇 개인지, 무엇이라 부르는지(과목·주차·Day), 이름을 운영진이 이 화면에서 정한다.

/** 과목 색으로 고르기 좋은 색. 앱의 흰 바탕에서 글자·막대로 읽히는 진하기다. */
export const SUBJECT_COLORS = ["#F5B700", "#12B886", "#7C5CFC", "#3182F6", "#E8590C", "#E64980", "#0CA678", "#4C6EF5", "#868E96"];

/** 부르는 말 + 번호. 영문으로 시작하는 말은 앞에("Day 3"), 그 밖은 뒤에("3주차") 붙인다(앱 서버와 같은 규칙). */
export function numberedLabel(word, no) {
  const w = String(word || "").trim();
  if (!w) return String(no);
  return /^[A-Za-z]/.test(w) ? `${w} ${no}` : `${no}${w}`;
}

/** 이름에서 그 말에 붙은 번호를 읽는다("3주차" → 3, "Day 12" → 12). 모양이 다르면 null. */
function numberOf(label, word) {
  const w = String(word || "").trim();
  const text = String(label || "").trim();
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = /^[A-Za-z]/.test(w) ? new RegExp(`^${escaped}\\s*(\\d{1,4})$`).exec(text) : new RegExp(`^(\\d{1,4})${escaped}$`).exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * 새로 만들 것들의 기본 이름. 있던 이름 가운데 가장 큰 번호 다음부터 잇는다.
 * 있던 이름에 번호가 하나도 없으면 개수 다음 번호부터 센다.
 */
export function nextLabels(existing, word, count) {
  const numbers = (existing || []).map((label) => numberOf(label, word)).filter((n) => n !== null);
  const start = numbers.length > 0 ? Math.max(...numbers) + 1 : (existing || []).length + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => numberedLabel(word, start + i));
}

/** 줄마다 하나씩 적은 이름을 목록으로(빈 줄은 뺀다). */
export function parseLabelLines(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** 이름 목록에서 고쳐야 할 것. 없으면 null. */
export function labelsProblem(labels, { max = 60, maxLength = 30, taken = [] } = {}) {
  if (labels.length === 0) return "이름을 한 줄에 하나씩 적어 주세요.";
  if (labels.length > max) return `한 번에 ${max}개까지 만들 수 있어요.`;
  const long = labels.find((label) => label.length > maxLength);
  if (long) return `이름은 ${maxLength}자까지 쓸 수 있어요: ${long.slice(0, 12)}…`;
  const seen = new Set(taken);
  for (const label of labels) {
    if (seen.has(label)) return `같은 이름이 이미 있어요: ${label}`;
    seen.add(label);
  }
  return null;
}

/** 구성 전체에서 교재 번호로 교재·과목·학습지를 찾는다. */
export function findBook(seriesList, bookId) {
  for (const series of seriesList || []) {
    for (const subject of series.subjects) {
      const book = subject.books.find((entry) => entry.id === bookId);
      if (book) return { series, subject, book };
    }
  }
  return null;
}

/** 목록에서 한 칸을 위(-1)나 아래(+1)로 옮긴 새 목록. 옮길 수 없으면 null. */
export function moved(list, index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** 교재를 지울 수 없는 까닭. 지울 수 있으면 null. */
export function bookDeleteBlock(book) {
  if (book.owners > 0) return `회원 ${book.owners.toLocaleString("ko-KR")}명에게 등록된 교재라 지울 수 없어요.`;
  if (book.sold) return "이 학습지가 팔렸거나 미리 등록돼 있어 지울 수 없어요.";
  if (book.days.some((day) => day.completed)) return "학생의 학습 기록이 있어 지울 수 없어요.";
  return null;
}
