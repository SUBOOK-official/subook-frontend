import test from "node:test";
import assert from "node:assert/strict";
import {
  bookDeleteBlock,
  creditRuleText,
  findBook,
  labelsProblem,
  moved,
  neededPages,
  nextLabels,
  numberedLabel,
  parseLabelLines,
} from "./ilseongCatalog.js";

const book = (id, label, extra = {}) => ({ id, label, owners: 0, sold: false, pageCount: null, days: [{ id: id * 10, completed: false }], ...extra });
const ilseong = {
  id: 1,
  name: "일성월심",
  subjects: [
    { code: "KOR", books: [book(1, "1주차", { pageCount: 40 }), book(2, "2주차")] },
    { code: "SCI", books: [book(3, "1주차")] },
  ],
};

test("부르는 말에 번호를 붙인다: 영문은 앞에, 그 밖은 뒤에", () => {
  assert.equal(numberedLabel("주차", 3), "3주차");
  assert.equal(numberedLabel("강", 12), "12강");
  assert.equal(numberedLabel("Day", 3), "Day 3");
  assert.equal(numberedLabel("Unit", 1), "Unit 1");
  assert.equal(numberedLabel("", 2), "2");
});

test("새 이름은 있던 이름의 가장 큰 번호 다음부터 잇는다", () => {
  assert.deepEqual(nextLabels(["1주차", "2주차", "8주차"], "주차", 2), ["9주차", "10주차"]);
  assert.deepEqual(nextLabels([], "주차", 3), ["1주차", "2주차", "3주차"]);
  assert.deepEqual(nextLabels(["Day 1", "Day 2"], "Day", 1), ["Day 3"]);
  // 번호가 없는 이름만 있으면 개수 다음부터
  assert.deepEqual(nextLabels(["도입", "마무리"], "강", 2), ["3강", "4강"]);
  // 말이 다른 이름은 번호로 세지 않는다
  assert.deepEqual(nextLabels(["1주차", "파이널 9회"], "주차", 1), ["2주차"]);
});

test("이름 목록: 줄마다 하나, 빈 줄은 빼고, 고쳐야 할 것을 알려 준다", () => {
  assert.deepEqual(parseLabelLines(" 1회 \n\n2회\r\n 실전 마무리 "), ["1회", "2회", "실전 마무리"]);
  assert.equal(labelsProblem(["9주차", "10주차"], { taken: ["1주차"] }), null);
  assert.match(labelsProblem([]), /한 줄에 하나씩/);
  assert.match(labelsProblem(["1주차"], { taken: ["1주차"] }), /같은 이름이 이미 있어요/);
  assert.match(labelsProblem(["가", "가"]), /같은 이름이 이미 있어요/);
  assert.match(labelsProblem(["가".repeat(31)]), /30자까지/);
  assert.match(labelsProblem(Array.from({ length: 61 }, (_, i) => `${i}회`)), /60개까지/);
});

test("크레딧 기준을 한 줄로", () => {
  assert.equal(creditRuleText({ rule: "INK", perDay: 100, inkRatio: 70, inkMin: 0.5 }), "그날 쪽의 70% 이상에 필기하면 100 크레딧");
  assert.equal(creditRuleText({ rule: "TAP", perDay: 1500 }), "완료하면 1,500 크레딧");
  assert.equal(creditRuleText({ rule: "NONE", perDay: 100 }), "크레딧 없음");
  // 앱 서버와 같은 올림
  assert.equal(neededPages(6, 70), 5);
  assert.equal(neededPages(4, 70), 3);
  assert.equal(neededPages(1, 10), 1);
});

test("구성에서 교재를 찾고 순서를 옮긴다", () => {
  assert.equal(findBook([ilseong], 3).subject.code, "SCI");
  assert.equal(findBook([ilseong], 99), null);
  assert.deepEqual(moved(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moved(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.equal(moved(["a", "b"], 0, -1), null);
  assert.equal(moved(["a", "b"], 1, 1), null);
});

test("교재를 지울 수 없는 까닭", () => {
  assert.equal(bookDeleteBlock(book(1, "1주차")), null);
  assert.match(bookDeleteBlock(book(1, "1주차", { owners: 1234 })), /회원 1,234명에게 등록된/);
  assert.match(bookDeleteBlock(book(1, "1주차", { sold: true })), /팔렸거나 미리 등록/);
  assert.match(bookDeleteBlock(book(1, "1주차", { days: [{ id: 1, completed: true }] })), /학습 기록/);
});
