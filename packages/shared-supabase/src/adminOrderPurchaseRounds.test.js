import test from "node:test";
import assert from "node:assert/strict";
import { getAdminOrderPurchaseRounds } from "./adminOrderPurchaseRounds.js";

test("빈 목록은 조회하지 않고 주문 ID는 중복 제거한다", async () => {
  assert.deepEqual(await getAdminOrderPurchaseRounds(null, []), {});
  const client = { rpc(name, params) {
    assert.equal(name, "admin_order_purchase_rounds");
    assert.deepEqual(params, { p_order_ids: ["a", "b"] });
    return { abortSignal(signal) {
      assert.ok(signal instanceof AbortSignal);
      return Promise.resolve({ data: { a: 1, b: 3 }, error: null });
    } };
  } };
  assert.deepEqual(await getAdminOrderPurchaseRounds(client, [{ id: "a" }, { id: "b" }, { id: "a" }]), { a: 1, b: 3 });
});

test("일시적 오류는 한 번 재시도하고 실패를 호출자에게 전달한다", async () => {
  let calls = 0;
  const error = { code: "NETWORK", message: "offline" };
  const client = { rpc: () => ({ abortSignal: async () => ++calls === 1 ? { error } : { data: { a: 2 } } }) };
  assert.deepEqual(await getAdminOrderPurchaseRounds(client, [{ id: "a" }]), { a: 2 });
  assert.equal(calls, 2);
  calls = 0;
  const failedClient = { rpc: () => ({ abortSignal: async () => { calls += 1; throw error; } }) };
  await assert.rejects(getAdminOrderPurchaseRounds(failedClient, [{ id: "a" }]), (e) => e === error);
  assert.equal(calls, 2);
});

test("권한 오류는 재시도하지 않는다", async () => {
  let calls = 0;
  const error = { code: "42501", message: "forbidden" };
  const client = { rpc: () => ({ abortSignal: async () => { calls += 1; return { error }; } }) };
  await assert.rejects(getAdminOrderPurchaseRounds(client, [{ id: "a" }]), (e) => e === error);
  assert.equal(calls, 1);
});
