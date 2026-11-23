import test from "node:test";
import assert from "node:assert/strict";
import { bookState, homeTodos, pageCounts, sellBlockers, seriesProgress, seriesStatus, setupBody, setupProblem } from "./ilseongGuide.js";

const day = (startPage, endPage) => ({ startPage, endPage });
const ready = { pageCount: 40, days: [day(3, 8), day(9, 14)] };
const noPdf = { pageCount: null, days: [day(null, null)] };
const noRanges = { pageCount: 40, days: [day(3, 8), day(null, null)] };
const series = (books, extra = {}) => ({ id: 1, name: "일성월심", product: { code: "SET" }, subjects: [{ code: "KOR", books }], ...extra });

test("교재 한 권의 준비 상태", () => {
  assert.equal(bookState(ready), "ready");
  assert.equal(bookState(noPdf), "none");
  assert.equal(bookState(noRanges), "ranges");
  assert.equal(bookState({ pageCount: 10, days: [] }), "ranges");
  assert.deepEqual(pageCounts([{ books: [ready, noPdf] }, { books: [noRanges] }]), { total: 3, ready: 1, none: 1, ranges: 1 });
});

test("학습지는 구성 → 교재 PDF → 판매 상품 → 판매 시작 순서로 간다", () => {
  assert.equal(seriesProgress(series([]), []).current, "structure");
  assert.equal(seriesProgress(series([noPdf, noPdf]), []).current, "pages");
  assert.equal(seriesProgress(series([noRanges]), []).current, "pages");
  // 한 권이라도 볼 수 있으면 다음 단계로 넘어간다
  assert.equal(seriesProgress(series([ready, noPdf]), []).current, "store");
  const hidden = [{ product_id: 7, app_product_code: "SET", is_listed: false }];
  assert.equal(seriesProgress(series([ready, noPdf]), hidden).current, "sell");
  const listed = [{ product_id: 7, app_product_code: "SET", is_listed: true }];
  // 팔기 시작한 뒤에는 남은 PDF가 다음 할 일이다
  const selling = seriesProgress(series([ready, noPdf]), listed);
  assert.equal(selling.current, "pages");
  assert.equal(selling.selling, true);
  assert.deepEqual(selling.done, { structure: true, pages: false, store: true, sell: true });
  assert.equal(seriesProgress(series([ready]), listed).current, null);
});

test("다른 학습지에 이은 수북 상품은 세지 않는다", () => {
  const other = [{ product_id: 9, app_product_code: "P2", is_listed: true }];
  const progress = seriesProgress(series([ready]), other);
  assert.equal(progress.current, "store");
  assert.equal(progress.selling, false);
});

test("수북 상품을 아직 읽지 못했으면 판매 단계를 단정하지 않는다", () => {
  const progress = seriesProgress(series([ready]), null);
  assert.equal(progress.unknownStore, true);
  assert.equal(progress.current, null);
  assert.equal(seriesStatus(progress).label, "확인 중");
});

test("목록의 상태 한 줄", () => {
  assert.deepEqual(seriesStatus(seriesProgress(series([noPdf]), [])), { tone: "blue", label: "준비 중", note: "다음 할 일: 2단계 교재 PDF 올리기" });
  const listed = [{ product_id: 7, app_product_code: "SET", is_listed: true }];
  assert.equal(seriesStatus(seriesProgress(series([ready, noPdf, noRanges]), listed)).note, "교재 2권이 아직 앱에서 안 보여요");
  assert.deepEqual(seriesStatus(seriesProgress(series([ready]), listed)), { tone: "green", label: "판매 중", note: "할 일이 없어요" });
});

test("판매를 막는 것: 개발자가 봐야 하는 것과 운영진이 풀 수 있는 것", () => {
  assert.deepEqual(sellBlockers({ sales: { configured: true, guideTemplateReady: true }, stock: { cover: true, onSale: 3 } }), []);
  const blockers = sellBlockers({ sales: { configured: false, guideTemplateReady: false }, stock: { cover: false, onSale: 0 } });
  assert.deepEqual(blockers.map((entry) => [entry.key, entry.dev]), [["server", true], ["guide", true], ["cover", false], ["stock", false]]);
  // 아직 읽지 못한 것은 막는 것으로 치지 않는다
  assert.deepEqual(sellBlockers({ sales: null, stock: null }), []);
});

test("홈의 할 일: 급한 것부터, 학습지마다 한 줄", () => {
  const listed = [{ product_id: 7, app_product_code: "SET", is_listed: true }];
  const todos = homeTodos({
    seriesList: [series([ready, noPdf]), series([], { id: 2, name: "모의고사", product: { code: "P2" } })],
    sales: { configured: true, counts: { failed: 2 }, products: listed },
    system: { checkedAt: 1, ok: true },
    config: { noticeMode: "BLOCK", iosBlockCapture: true, androidBlockCapture: false, iosReviewBuild: "", androidReviewBuild: null },
  });
  assert.deepEqual(todos.map((todo) => todo.key), ["failed", "block", "capture", "series-1", "series-2"]);
  assert.equal(todos[0].action.to, "/admin/ilseong?view=users#orders");
  assert.equal(todos[3].action.to, "/admin/ilseong?view=books&series=1");
  assert.match(todos[4].hint, /1단계 구성 만들기/);
});

test("홈의 할 일: 아무 문제도 없고 다 팔고 있으면 비어 있다", () => {
  const listed = [{ product_id: 7, app_product_code: "SET", is_listed: true }];
  assert.deepEqual(homeTodos({
    seriesList: [series([ready])],
    sales: { configured: true, counts: { failed: 0 }, products: listed },
    system: { checkedAt: 1, ok: true },
    config: { noticeMode: "OFF", iosBlockCapture: true, androidBlockCapture: true },
  }), []);
  // 서버가 점검 결과를 보내지 않거나 문제를 알리면 맨 위에
  assert.equal(homeTodos({ seriesList: [], sales: null, system: { checkedAt: 1, ok: false }, config: null })[0].key, "server");
  assert.equal(homeTodos({ seriesList: [], sales: null, system: { checkedAt: 1, ok: true }, config: null, serverStale: true })[0].key, "server");
  // 점검이 켜져 있지 않은 서버(개발용)는 문제로 치지 않는다
  assert.deepEqual(homeTodos({ seriesList: [], sales: null, system: { checkedAt: null, ok: false }, config: null }), []);
});

test("새 학습지 만들기: 고칠 것과 보낼 값", () => {
  const form = { name: " 파이널 ", subjects: [{ name: "국어", color: "#F5B700" }, { name: " ", color: "#12B886" }], bookCount: "8", dayCount: "7", unitWord: "회", dayWord: "Day", creditRule: "INK" };
  assert.equal(setupProblem(form), null);
  assert.deepEqual(setupBody(form), {
    name: "파이널", unitWord: "회", dayWord: "Day", creditRule: "INK",
    subjects: [{ name: "국어", color: "#F5B700" }], bookCount: 8, dayCount: 7,
  });
  assert.match(setupProblem({ ...form, name: "" }), /학습지 이름/);
  assert.match(setupProblem({ ...form, subjects: [{ name: "" }] }), /과목 이름/);
  assert.match(setupProblem({ ...form, subjects: [{ name: "국어" }, { name: "국어 " }] }), /두 번/);
  assert.match(setupProblem({ ...form, bookCount: "0" }), /교재 수/);
  assert.match(setupProblem({ ...form, dayCount: "61" }), /하루 분량 수/);
  assert.match(setupProblem({ ...form, unitWord: " " }), /부르는 말/);
});
