import test from "node:test";
import assert from "node:assert/strict";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  pushAudience,
  pushBody,
  pushConfirmMessage,
  pushDevicesLabel,
  pushProblem,
  pushResultMessage,
  pushTargetLabel,
} from "./ilseongPush.js";

test("알림 글자 수 한도는 앱 서버와 같다", () => {
  assert.equal(PUSH_TITLE_MAX, 40);
  assert.equal(PUSH_BODY_MAX, 200);
});

test("보내기 전에 고칠 것: 제목과 내용이 있어야 하고 한도를 넘지 않아야 한다", () => {
  assert.equal(pushProblem({ title: "4주차 해설을 고쳤어요", body: "앱을 다시 열어 주세요." }), null);
  assert.match(pushProblem({ title: "", body: "내용" }), /제목/);
  assert.match(pushProblem({ title: "   ", body: "내용" }), /제목/);
  assert.match(pushProblem({ title: "제목", body: " \n " }), /내용/);
  assert.match(pushProblem({ title: undefined, body: undefined }), /제목/);
  assert.equal(pushProblem({ title: "가".repeat(40), body: "나".repeat(200) }), null);
  assert.match(pushProblem({ title: "가".repeat(41), body: "내용" }), /40자/);
  assert.match(pushProblem({ title: "제목", body: "나".repeat(201) }), /200자/);
  // 앞뒤 공백은 떼고 센다
  assert.equal(pushProblem({ title: ` ${"가".repeat(40)} `, body: "내용" }), null);
});

test("앱 서버에 보낼 본문: 앞뒤 공백을 떼고, 학습지를 고르지 않았으면 모든 학생", () => {
  assert.deepEqual(pushBody({ title: " 제목 ", body: " 내용\n둘째 줄 ", seriesId: null }), { title: "제목", body: "내용\n둘째 줄", seriesId: null });
  assert.deepEqual(pushBody({ title: "제목", body: "내용", seriesId: 3 }), { title: "제목", body: "내용", seriesId: 3 });
  assert.equal(pushBody({ title: "제목", body: "내용", seriesId: "3" }).seriesId, 3);
  assert.equal(pushBody({ title: "제목", body: "내용", seriesId: "" }).seriesId, null);
  assert.equal(pushBody({ title: "제목", body: "내용", seriesId: undefined }).seriesId, null);
  assert.equal(pushBody({ title: "제목", body: "내용", seriesId: "new" }).seriesId, null);
});

test("받는 학생을 읽는 말로", () => {
  assert.equal(pushAudience(null), "모든 학생");
  assert.equal(pushAudience(""), "모든 학생");
  assert.equal(pushAudience("일성월심"), "일성월심 교재를 등록한 학생");
  const list = [{ id: 1, name: "일성월심" }, { id: 2, name: "파이널" }];
  assert.equal(pushTargetLabel({ seriesId: null, seriesName: null }, list), "모든 학생");
  assert.equal(pushTargetLabel({ seriesId: 2, seriesName: "파이널 모의고사" }, list), "파이널 모의고사");
  // 앱 서버가 이름을 주지 않으면 학습지 목록에서 찾고, 거기에도 없으면 지운 것이다
  assert.equal(pushTargetLabel({ seriesId: 2, seriesName: null }, list), "파이널");
  assert.equal(pushTargetLabel({ seriesId: 9, seriesName: null }, list), "지운 학습지");
  assert.equal(pushTargetLabel({ seriesId: 9 }, undefined), "지운 학습지");
});

test("알림을 받을 수 있는 기기: 안드로이드는 한 대라도 있을 때만 말한다", () => {
  assert.equal(pushDevicesLabel({ ios: 120, android: 0 }), "아이폰·아이패드 120대");
  assert.equal(pushDevicesLabel({ ios: 1234, android: 7 }), "아이폰·아이패드 1,234대, 안드로이드 7대");
  assert.equal(pushDevicesLabel({ ios: 0, android: 0 }), "아이폰·아이패드 0대");
  assert.equal(pushDevicesLabel(undefined), "아이폰·아이패드 0대");
});

test("보내기 전 확인 글: 받는 학생, 바로 간다는 것, 되돌릴 수 없다는 것", () => {
  const message = pushConfirmMessage({ audience: "모든 학생", title: " 4주차 해설을 고쳤어요 ", body: "앱을 다시 열어 주세요." });
  assert.match(message, /^받는 학생: 모든 학생\n/);
  assert.match(message, /제목: 4주차 해설을 고쳤어요\n내용: 앱을 다시 열어 주세요\./);
  assert.match(message, /바로 가요/);
  assert.match(message, /되돌릴 수 없어요/);
});

test("보낸 뒤의 한 줄: 보낸 수, 못 보낸 수, 안드로이드", () => {
  assert.equal(pushResultMessage({ id: 1, targets: 120, sent: 120, failed: 0, skipped: 0 }), "120대에 보냈어요");
  assert.equal(pushResultMessage({ targets: 120, sent: 118, failed: 2, skipped: 0 }), "118대에 보냈어요 · 2대는 보내지 못했어요");
  assert.equal(
    pushResultMessage({ targets: 123, sent: 118, failed: 2, skipped: 3 }),
    "118대에 보냈어요 · 2대는 보내지 못했어요 · 안드로이드 3대에는 아직 보낼 수 없어요",
  );
  assert.equal(pushResultMessage({ targets: 3, sent: 0, failed: 0, skipped: 3 }), "0대에 보냈어요 · 안드로이드 3대에는 아직 보낼 수 없어요");
  // 받을 기기가 하나도 없었을 때
  assert.equal(pushResultMessage({ targets: 0, sent: 0, failed: 0, skipped: 0 }), "알림을 받을 수 있는 기기가 없어서 보내지 못했어요");
  assert.equal(pushResultMessage(undefined), "알림을 받을 수 있는 기기가 없어서 보내지 못했어요");
});
