import test from "node:test";
import assert from "node:assert/strict";
import { activePromotions, CHUSEOK_PROMOTION_ID, fromKstInput, isPromotionUrl, promotionDismissKey, promotionStatus, toKstInput, validatePromotion } from "../../../../packages/shared-domain/src/sitePromotions.js";
import { listPromotions, savePromotion } from "../../../../packages/shared-supabase/src/sitePromotionsClient.js";

const row = { id: "a", title: "추석 쿠폰", alt_text: "쿠폰 안내", placement: "home_popup", image_url: "/banners/test.webp", link_url: "/mypage#coupons", sort_order: 10, is_enabled: true };

test("한국시간 종료 분 전체를 포함하고 9/29 00:00부터 숨긴다", () => {
  const ends_at = fromKstInput("2026-09-28T23:59", true);
  assert.equal(ends_at, "2026-09-28T15:00:00.000Z");
  assert.equal(toKstInput(ends_at, true), "2026-09-28T23:59");
  assert.equal(activePromotions([{ ...row, ends_at }], Date.parse(ends_at) - 1).length, 1);
  assert.equal(activePromotions([{ ...row, ends_at }], Date.parse(ends_at)).length, 0);
  assert.equal(promotionStatus({ ...row, ends_at }, Date.parse(ends_at)), "종료");
});

test("예약 전·비노출·잘못된 날짜를 숨기며 시작 시각은 포함한다", () => {
  const starts_at = fromKstInput("2026-10-01T09:00");
  assert.equal(activePromotions([{ ...row, starts_at }], Date.parse(starts_at) - 1).length, 0);
  assert.equal(activePromotions([{ ...row, starts_at }], Date.parse(starts_at)).length, 1);
  assert.equal(activePromotions([{ ...row, is_enabled: false }, { ...row, starts_at: "bad" }]).length, 0);
  assert.throws(() => fromKstInput("2026-02-31T09:00"));
});

test("동일 순서도 ID로 안정 정렬하며 입력 배열을 변경하지 않는다", () => {
  const rows = [{ ...row, id: "b" }, { ...row, id: "a" }, { ...row, id: "c", sort_order: 1 }];
  assert.deepEqual(activePromotions(rows).map((r) => r.id), ["c", "a", "b"]);
  assert.equal(rows[0].id, "b");
});

test("스크립트·프로토콜 상대 주소·역슬래시·제어 문자를 차단한다", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "//evil.test", "/\\evil.test", " https://evil.test", "https://user:pass@test.com", "http://test.com", "https://test.com\n", `/a${String.fromCharCode(0)}b`]) assert.equal(isPromotionUrl(url), false, url);
  for (const url of ["/", "/mypage#coupons", "/#products", "https://subook.kr/event?x=1"]) assert.equal(isPromotionUrl(url), true, url);
});

test("저장 전 필수 값·링크·노출 순서·역전 일정을 검사한다", () => {
  assert.equal(validatePromotion(row), "");
  for (const change of [{ title: "" }, { alt_text: "" }, { image_url: "" }, { link_url: "//evil.test" }, { sort_order: -1 }, { sort_order: 1.5 }, { starts_at: "2026-10-02", ends_at: "2026-10-01" }]) assert.ok(validatePromotion({ ...row, ...change }));
});

test("추석 팝업의 기존 닫기 상태를 승계하고 다른 팝업과 구분한다", () => {
  assert.equal(promotionDismissKey(CHUSEOK_PROMOTION_ID), "subook.public.popup-banner.dismissed.chuseok-2026");
  assert.notEqual(promotionDismissKey("a"), promotionDismissKey("b"));
});

test("목록 조회 실패는 한 번 재시도하고 빈 목록은 그대로 반환한다", async () => {
  let calls = 0;
  const client = { from: () => ({ select() { return this; }, order() { return this; }, eq() { return this; }, abortSignal() { calls += 1; return Promise.resolve(calls === 1 ? { error: new Error("network") } : { data: [] }); } }) };
  assert.deepEqual(await listPromotions(client, { publishedOnly: true }), []);
  assert.equal(calls, 2);
});

test("동시 수정 충돌 시 성공으로 표시하지 않으며 쓰기는 자동 재시도하지 않는다", async () => {
  let calls = 0;
  const client = { from: () => ({ update() { return this; }, eq() { return this; }, select() { return this; }, maybeSingle() { return this; }, abortSignal() { calls += 1; return Promise.resolve({ data: null }); } }) };
  await assert.rejects(savePromotion(client, row, "2026-09-24"), /다른 관리자/);
  assert.equal(calls, 1);
});
