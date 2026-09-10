import { test } from "node:test";
import assert from "node:assert/strict";
import { attachMetaCheckoutContext } from "../../../../packages/shared-supabase/src/metaCheckoutClient.js";

test("Meta 주문 문맥 저장은 동일 주문으로 네트워크 실패만 재시도한다", async () => {
  const calls = [];
  const client = { rpc: (name, args) => ({ abortSignal: async () => {
    calls.push({ name, args });
    if (calls.length === 1) throw new Error("network");
    return { data: { recorded: true }, error: null };
  } }) };
  assert.equal(await attachMetaCheckoutContext({ client, orderNumber: "TEST-ORDER", guestPhone: "01000000000" }), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("Meta 주문 문맥 저장 실패와 권한 거부는 결제에 예외를 전달하지 않는다", async () => {
  const client = { rpc: () => ({ abortSignal: async () => ({ error: { code: "42501" } }) }) };
  assert.equal(await attachMetaCheckoutContext({ client, orderNumber: "TEST-ORDER" }), false);
  assert.equal(await attachMetaCheckoutContext({ client: null, orderNumber: "TEST-ORDER" }), false);
});

test("Meta 문맥 요청이 지연되면 각 시도를 취소하고 결제를 계속한다", async () => {
  let aborted = 0;
  const client = { rpc: () => ({ abortSignal: (signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted += 1; reject(new Error("aborted")); }, { once: true });
  }) }) };
  assert.equal(await attachMetaCheckoutContext({ client, orderNumber: "TEST-ORDER", timeoutMs: 5 }), false);
  assert.equal(aborted, 2);
});
