import test from "node:test";
import assert from "node:assert/strict";
import { grantCreator, grantState, memberAppExtraAction, memberAppPanel, memberAppProducts, memberLoginBlock } from "./ilseongMemberApp.js";

const ok = { account_status: "active", identity_enabled: true, identity_status: "verified", merged_into: null };
const unverified = { ...ok, identity_status: "unverified" };
const none = { user: null, books: [], ownsAll: false, waiting: null, grants: [] };
const waiting = { ...none, waiting: { id: 1, state: "WAITING" }, grants: [{ id: 1, state: "WAITING" }] };
const appUser = { ...none, user: { id: 4, name: "학생" } };

test("아직 앱에 로그인하지 않은 회원: 미리 등록, 해 둔 뒤에는 취소", () => {
  assert.deepEqual(memberAppPanel(ok, none), { action: "pregrant", block: null, notice: null });
  assert.deepEqual(memberAppPanel(ok, waiting), { action: "cancel", block: null, notice: null });
});

test("이미 앱을 쓰는 회원: 교재가 없으면 바로 등록, 다 가졌으면 버튼이 없다", () => {
  assert.equal(memberAppPanel(ok, appUser).action, "grant");
  assert.deepEqual(memberAppPanel(ok, { ...appUser, ownsAll: true }), { action: null, block: null, notice: null });
});

test("휴대폰 인증 전인 회원: 등록은 할 수 있고 안내가 붙는다", () => {
  const before = memberAppPanel(unverified, none);
  assert.equal(before.action, "pregrant");
  assert.match(before.notice, /휴대폰 인증을 아직 마치지 않은/);
  // 미리 등록해 둔 뒤에도 안내는 남는다
  const after = memberAppPanel(unverified, waiting);
  assert.equal(after.action, "cancel");
  assert.match(after.notice, /휴대폰 인증/);
  // 1번호 1계정 정책이 꺼져 있으면 인증 없이도 로그인된다
  assert.equal(memberAppPanel({ ...unverified, identity_enabled: false }, none).notice, null);
});

test("앱에 로그인할 수 없는 회원에게는 등록 버튼을 내지 않고 까닭을 알려 준다", () => {
  for (const status of ["blocked", "withdrawal_pending", "withdrawn", "missing"]) {
    const panel = memberAppPanel({ ...ok, account_status: status }, none);
    assert.equal(panel.action, null, status);
    assert.ok(panel.block.text, status);
  }
  const merged = memberAppPanel({ ...ok, identity_status: "merged", merged_into: "target-uuid" }, none);
  assert.equal(merged.action, null);
  assert.equal(merged.block.mergedInto, "target-uuid");
  assert.match(merged.block.text, /합쳐진/);
  // 차단이 휴대폰 인증 안내보다 앞선다
  assert.equal(memberAppPanel({ ...unverified, account_status: "blocked" }, none).notice, null);
  // 미리 등록해 둔 뒤에 차단됐으면 취소는 할 수 있다
  const blockedWaiting = memberAppPanel({ ...ok, account_status: "blocked" }, waiting);
  assert.equal(blockedWaiting.action, "cancel");
  assert.match(blockedWaiting.block.text, /차단/);
});

test("수북 쪽 상태를 아직 모르거나 읽지 못했을 때", () => {
  // 읽는 중: 버튼은 내고 안내는 없다
  assert.deepEqual(memberAppPanel(undefined, none), { action: "pregrant", block: null, notice: null });
  // 읽지 못함: 등록은 할 수 있되 확인하지 못했다고 알려 준다
  assert.match(memberAppPanel(null, none).notice, /확인하지 못했어요/);
  assert.equal(memberLoginBlock(null), null);
  // 앱 서버의 답이 없으면 버튼을 내지 않는다
  assert.equal(memberAppPanel(ok, undefined).action, null);
});

test("앱 상품이 여럿이면 고를 수 있는 것을 나눈다", () => {
  const set4 = { code: "ILSEONG_2028_SET4", name: "일성월심", ownsAll: false, waiting: null };
  const final = { code: "P1", name: "파이널", ownsAll: false, waiting: null };
  // 하나뿐이면 고르지 않는다
  assert.deepEqual(memberAppProducts({ ...none, products: [set4] }), { grantable: [set4], waiting: [], many: false });
  assert.equal(memberAppProducts(none).many, false, "예전 서버의 답(products 없음)");
  // 하나는 미리 등록해 뒀고 하나는 아직: 취소가 버튼이고, 다른 상품을 더 등록할 수 있다
  const oneWaiting = { ...waiting, products: [{ ...set4, waiting: { id: 1 } }, final] };
  assert.deepEqual(memberAppProducts(oneWaiting).grantable, [final]);
  assert.equal(memberAppProducts(oneWaiting).waiting.length, 1);
  assert.equal(memberAppPanel(ok, oneWaiting).action, "cancel");
  assert.equal(memberAppExtraAction(ok, oneWaiting), "pregrant");
  assert.equal(memberAppExtraAction(ok, { ...oneWaiting, user: { id: 4 } }), "grant");
  // 다 가졌거나 다 기다리는 중이면 더 등록할 것이 없다
  assert.equal(memberAppExtraAction(ok, { ...waiting, products: [{ ...set4, waiting: { id: 1 } }, { ...final, ownsAll: true }] }), null);
  // 로그인할 수 없는 회원에게는 더 등록하지 않는다
  assert.equal(memberAppExtraAction({ ...ok, account_status: "blocked" }, oneWaiting), null);
  // 기다리는 것이 없으면 원래 버튼이 등록이다
  assert.equal(memberAppExtraAction(ok, { ...none, products: [set4, final] }), null);
});

test("등록 기록의 표시", () => {
  assert.equal(grantState("WAITING").label, "로그인을 기다리는 중");
  assert.equal(grantState("REGISTERED").tone, "green");
  assert.equal(grantState("REVOKED").label, "등록했다가 거둠");
  assert.equal(grantState("CANCELLED").label, "취소함");
  assert.equal(grantState("NEW_STATE").label, "NEW_STATE");
  assert.equal(grantCreator({ createdByName: "staff@subook.kr" }), "staff@subook.kr");
  assert.match(grantCreator({ createdByName: null }), /개발자/);
});
