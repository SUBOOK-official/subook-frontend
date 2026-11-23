import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_STATUS,
  actionLabel,
  actionTarget,
  appConfigRisks,
  formatCount,
  formatDate,
  formatDateTime,
  formatEpochSeconds,
  isHigherVersion,
  platformLabel,
  providersLabel,
  serverCheckAge,
  booksLabel,
  weeksLabel,
} from "./ilseongFormat.js";

test("날짜는 한국 시간으로 보여 준다", () => {
  // 2026-11-18 15:30 UTC = 한국 11-19 00:30
  assert.equal(formatDate("2026-11-18T15:30:00Z"), "2026년 11월 19일");
  assert.match(formatDateTime("2026-11-18T15:30:00Z"), /^11\. 19\. 00:30$/);
  assert.equal(formatDate(null), "—");
  assert.equal(formatDateTime("이상한 값"), "—");
  assert.equal(formatEpochSeconds(0), "없음");
  assert.equal(formatEpochSeconds(undefined), "없음");
  assert.match(formatEpochSeconds(1795015800), /^\d+\. \d+\. \d{2}:\d{2}$/);
  assert.equal(formatCount(12345), "12,345");
  assert.equal(formatCount(undefined), "0");
});

test("주차 묶음: 이어진 주차는 범위로 줄인다", () => {
  assert.equal(weeksLabel([1, 2, 3, 4, 5, 6, 7, 8]), "1–8주차");
  assert.equal(weeksLabel([3, 1, 2, 5]), "1–3, 5주차");
  assert.equal(weeksLabel([4]), "4주차");
  assert.equal(weeksLabel([1, 3, 5]), "1, 3, 5주차");
  // 앱 서버가 준 한 줄(summary)이 있으면 그것을 쓴다(이름을 자유롭게 붙일 수 있어 번호로 만들 수 없다)
  assert.equal(booksLabel({ weeks: [1, 2], summary: "1주차, 파이널 1회" }), "1주차, 파이널 1회");
  assert.equal(booksLabel({ weeks: [1, 2, 3] }), "1–3주차");
});

test("앱 서버가 주는 값을 운영자가 읽는 말로 바꾼다", () => {
  assert.equal(CODE_STATUS.REDEEMED.label, "등록됨");
  assert.equal(providersLabel(["SUBOOK"]), "수북 계정");
  assert.equal(providersLabel(["KAKAO", "APPLE"]), "카카오, 애플");
  assert.equal(providersLabel(["SUBOOK_STAFF"]), "수북 관리자");
  // 모르는 값은 그대로, 없으면 줄표
  assert.equal(providersLabel(["NAVER"]), "NAVER");
  assert.equal(providersLabel([]), "—");
  assert.equal(platformLabel("IOS"), "iPhone·iPad");
  assert.equal(platformLabel("TV"), "TV");
  assert.equal(actionLabel("USER_GRANT"), "교재 직접 등록");
  assert.equal(actionLabel("MEMBER_PREGRANT"), "교재 미리 등록");
  assert.equal(actionLabel("MEMBER_PREGRANT_CANCEL"), "미리 등록 취소");
  assert.equal(actionLabel("BOOK_CREATE"), "교재 만들기");
  assert.equal(actionLabel("PRODUCT_UPDATE"), "앱 상품 고치기");
  assert.equal(actionLabel("CODE_REVOKE"), "등록 거두기");
  assert.equal(actionLabel("SOMETHING_NEW"), "SOMETHING_NEW");
});

test("관리 기록의 대상: 회원이면 그 번호를 함께 준다", () => {
  assert.deepEqual(actionTarget("user:12/device:3"), { text: "12번 회원", userId: 12, memberRef: null });
  assert.deepEqual(actionTarget("user:7/code:41"), { text: "7번 회원", userId: 7, memberRef: null });
  assert.deepEqual(actionTarget("book:5"), { text: "교재 5번", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("batch:9"), { text: "묶음 9번", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("code:33"), { text: "등록 33번", userId: null, memberRef: null });
  // 학습지 구성·상품 기록: 과목과 상품은 번호가 아니라 코드로 가리킨다
  assert.deepEqual(actionTarget("series:2"), { text: "학습지 2번", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("subject:S3"), { text: "과목 S3", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("product:P1"), { text: "앱 상품 P1", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("series"), { text: "학습지", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("app-config"), { text: "앱 설정", userId: null, memberRef: null });
  assert.deepEqual(actionTarget("something"), { text: "something", userId: null, memberRef: null });
  // 아직 앱에 로그인하지 않은 수북 회원에게 미리 등록한 기록: 수북 회원 화면으로 잇는다
  assert.deepEqual(actionTarget("member:7a2d5b84-0000-4000-8000-0000000000aa"), {
    text: "수북 회원",
    userId: null,
    memberRef: "7a2d5b84-0000-4000-8000-0000000000aa",
  });
  assert.equal(actionTarget("member:not-a-uuid").memberRef, null);
});

test("버전 견주기: 자리마다 숫자로 견준다", () => {
  assert.equal(isHigherVersion("1.0.2", "1.0.1"), true);
  assert.equal(isHigherVersion("1.0.10", "1.0.9"), true);
  assert.equal(isHigherVersion("1.1", "1.0.9"), true);
  assert.equal(isHigherVersion("2", "1.9.9"), true);
  assert.equal(isHigherVersion("1.0.1", "1.0.1"), false);
  assert.equal(isHigherVersion("1.0", "1.0.0"), false);
  assert.equal(isHigherVersion("1.0.0", "1.0.1"), false);
  // 저장된 값이 없으면 무엇을 넣어도 올리는 것이다
  assert.equal(isHigherVersion("1.0.0", null), true);
  assert.equal(isHigherVersion(" 1.0.0 ", ""), true);
  // 비우거나 버전 모양이 아니면 올리는 것이 아니다(모양 검사는 앱 서버가 한다)
  assert.equal(isHigherVersion("", "1.0.0"), false);
  assert.equal(isHigherVersion("v2", "1.0.0"), false);
  assert.equal(isHigherVersion("1.0.0.1", "1.0.0"), false);
});

const SAVED = { noticeMode: "OFF", iosMinVersion: "1.0.0", androidMinVersion: null, iosBlockCapture: true, androidBlockCapture: true };

test("앱 설정: 학생이 앱을 못 쓰게 되거나 교재 보호가 풀리는 변경만 다시 묻는다", () => {
  assert.deepEqual(appConfigRisks(SAVED, { ...SAVED, androidMinVersion: "" }), { risks: [], minVersionRaised: false });
  // 공지를 알림으로 바꾸거나 최소 버전을 낮추는 것은 묻지 않는다
  assert.deepEqual(appConfigRisks(SAVED, { ...SAVED, noticeMode: "INFO", iosMinVersion: "0.9" }).risks, []);

  const block = appConfigRisks(SAVED, { ...SAVED, noticeMode: "BLOCK" });
  assert.equal(block.risks.length, 1);
  assert.match(block.risks[0], /점검 중/);
  // 이미 점검 중이었으면 다시 묻지 않는다
  assert.deepEqual(appConfigRisks({ ...SAVED, noticeMode: "BLOCK" }, { ...SAVED, noticeMode: "BLOCK" }).risks, []);

  const raised = appConfigRisks(SAVED, { ...SAVED, iosMinVersion: "1.0.2", androidMinVersion: " 1.0.0 " });
  assert.equal(raised.minVersionRaised, true);
  assert.deepEqual(raised.risks, [
    "아이폰·아이패드: 1.0.2보다 낮은 앱은 쓸 수 없게 돼요.",
    "안드로이드: 1.0.0보다 낮은 앱은 쓸 수 없게 돼요.",
  ]);

  const capture = appConfigRisks(SAVED, { ...SAVED, iosBlockCapture: false, androidBlockCapture: false });
  assert.equal(capture.risks.length, 2);
  assert.equal(capture.minVersionRaised, false);
  // 꺼져 있던 것을 켜는 것은 묻지 않는다
  assert.deepEqual(appConfigRisks({ ...SAVED, iosBlockCapture: false }, SAVED).risks, []);
});

test("서버 점검 결과는 15분 넘게 오지 않으면 멈춘 것으로 본다", () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(serverCheckAge(now / 1000 - 4 * 60, now), { minutes: 4, stale: false });
  assert.deepEqual(serverCheckAge(now / 1000 - 15 * 60, now), { minutes: 15, stale: false });
  assert.deepEqual(serverCheckAge(now / 1000 - 16 * 60, now), { minutes: 16, stale: true });
  // 시계가 조금 어긋나 앞선 시각이 와도 음수가 되지 않는다
  assert.deepEqual(serverCheckAge(now / 1000 + 30, now), { minutes: 0, stale: false });
});
