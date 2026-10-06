import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as demo from "./publicMypageDemo.js";
import * as utils from "./publicMypageUtils.js";

// 운영 설정·로그인 세션이 있는 조건에서도 데모 서비스가 DB/Auth에 접근하면 실패한다.
const source = readFileSync(new URL("./memberPortal.js", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\r?\n/gm, "")
  .replace(/export\s*\{([\s\S]*?)\};?\s*$/, "return {$1};");
const forbiddenClient = new Proxy({}, { get() { throw new Error("Demo accessed live Supabase"); } });
const dependencies = { ...demo, ...utils, isSupabaseConfigured: true, supabase: forbiddenClient };
const user = demo.DEMO_MEMBER_USER;

test("demo profile, address and account actions stay local; reset preserves real member cache", async () => {
  const storage = new Map([["subook.public.member-portal.v2:real-member", "private-cache"]]);
  const testWindow = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } };
  const portal = new Function("window", ...Object.keys(dependencies), source)(testWindow, ...Object.values(dependencies));
  await portal.loadMemberPortalSnapshot({ user: { id: "real-member" }, profile: { name: "real name" }, demoMode: true });
  assert.equal((await portal.checkMemberNicknameAvailability({ user, nickname: "체험수정" })).isAvailable, true);
  assert.equal((await portal.saveMemberProfile({ user, values: { name: "체험수정", nickname: "체험수정" } })).error, null);
  assert.equal((await portal.saveMemberShippingAddress({ user, values: { label: "학원", recipient_name: "김수북", recipient_phone: "010-0000-0000", postal_code: "00000", address_line1: "데모 주소" }, shouldMakeDefault: true })).error, null);
  assert.equal((await portal.saveMemberSettlementAccount({ user, values: { bank_name: "신한은행", account_number: "0000000000", account_holder: "김수북" }, shouldMakeDefault: true })).error, null);
  let snapshot = await portal.loadMemberPortalSnapshot({ user, demoMode: true });
  assert.equal(snapshot.profile.nickname, "체험수정");
  assert.equal(snapshot.shippingAddresses.length, 2);
  assert.equal(snapshot.settlementAccounts.length, 2);
  await portal.setDefaultMemberShippingAddress({ user, addressId: "demo-address-home" });
  await portal.setDefaultMemberSettlementAccount({ user, accountId: "demo-account-default" });
  await portal.deleteMemberShippingAddress({ user, addressId: snapshot.shippingAddresses.find(row => row.id !== "demo-address-home").id });
  await portal.deleteMemberSettlementAccount({ user, accountId: snapshot.settlementAccounts.find(row => row.id !== "demo-account-default").id });
  await portal.confirmMemberPurchase({ user, orderId: "demo-order-004", demoMode: true });
  await portal.cancelMemberOrder({ user, orderId: "demo-order-001", demoMode: true });
  await portal.cancelMemberPickupRequest({ user, requestId: "demo-pickup-001", demoMode: true });
  await portal.requestMemberRefund({ user, orderId: "demo-order-005", itemIds: ["demo-item-005"], reason: "인쇄 누락으로 문제 일부를 읽을 수 없어 환불을 신청합니다.", demoMode: true });
  snapshot = await portal.loadMemberPortalSnapshot({ user, demoMode: true });
  assert.equal(snapshot.orders.find(row => row.id === "demo-order-004").status, "confirmed");
  assert.equal(snapshot.orders.find(row => row.id === "demo-order-001").status, "cancelled");
  assert.ok(snapshot.orders.find(row => row.id === "demo-order-005").refundRequestedAt);
  assert.equal(snapshot.shipments[0].canCancel, false);
  portal.resetDemoPortalState();
  assert.equal(storage.size, 1);
  assert.equal(storage.get("subook.public.member-portal.v2:real-member"), "private-cache");
});
