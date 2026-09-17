import { test } from "node:test";
import assert from "node:assert/strict";
import paymentCancelHandler from "../api/admin/payment-cancel.js";

test("나이스페이 4,000원 부분환불 후 7,000원 잔액 취소·잠긴 요청 복구", async (t) => {
  const savedFetch = globalThis.fetch;
  const savedWarn = console.warn;
  const savedError = console.error;
  const env = {
    SUPABASE_ADMIN_URL: "https://refund-test.invalid", SUPABASE_ADMIN_ANON_KEY: "mock-anon",
    NICEPAY_CLIENT_KEY: "mock-client", NICEPAY_SECRET_KEY: "mock-secret", NICEPAY_API_BASE: "https://pg.invalid",
  };
  const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  console.warn = () => {};
  console.error = () => {};
  t.after(() => {
    globalThis.fetch = savedFetch; console.warn = savedWarn; console.error = savedError;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  for (const scenario of [
    { name: "새 환불", action: "execute" },
    { name: "기존 실패 복구" },
    { name: "기존 실패가 소진한 orderId", usedOrderId: true },
    { name: "동시 재시도", concurrent: true },
    { name: "이미 전액 환불됨", balance: 0 },
    { name: "PG 잔액 불일치", balance: 6000, blocked: true },
    { name: "조회 실패", lookupFailure: true, blocked: true },
    { name: "취소 응답 유실", timeout: true, blocked: true },
    { name: "취소 후 결과 조회 실패", afterLookupFailure: true, blocked: true },
    { name: "U112 이후 잔액 변경", usedOrderId: true, drift: true, blocked: true },
    { name: "U112 재시도는 1회 한정", usedOrderId: true, alwaysUsed: true, blocked: true },
    { name: "기존 조회 버튼은 취소하지 않음", action: "reconcile", blocked: true },
  ]) {
    await t.test(scenario.name, async () => {
      const calls = [];
      let balance = scenario.balance ?? 7000;
      let cancelCount = 0;
      let actualRefundCount = 0;
      let completed = false;
      const attempt = {
        token: "existing-token", claimed_at: "2026-09-17T07:31:30Z", whole_order: true,
        order: { id: 1, order_number: "TEST-0338", payment_key: "test-tid", pg_provider: "nicepay",
          payment_method: "card", total_amount: 11000, refunded_amount: 4000 },
        item_ids: [2], refund_amount: 7000, remaining_before: 7000, reason: "발송 전 전체 취소",
      };
      globalThis.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        const path = url.pathname;
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ host: url.hostname, path, body });
        if (url.hostname === "refund-test.invalid") {
          if (path === "/auth/v1/user") return Response.json({ id: "00000000-0000-4000-8000-000000000099" });
          if (path.endsWith("/is_admin_user")) return Response.json(true);
          if (path.endsWith("/admin_claim_return_refund") || path.endsWith("/admin_get_return_refund_attempt")) return Response.json(attempt);
          if (path.endsWith("/admin_complete_return_refund")) {
            assert.equal(balance, 0, "PG 완료 전에는 DB를 완료하지 않는다");
            assert.equal(body.p_token, "existing-token");
            const alreadyCompleted = completed; completed = true;
            return Response.json({ refund_amount: 7000, already_completed: alreadyCompleted });
          }
          if (path.endsWith("/admin_flag_return_refund") || path.endsWith("/notify_ops_slack")) return Response.json(null);
        }
        if (url.hostname === "pg.invalid") {
          if (path.endsWith("/cancel")) {
            cancelCount += 1;
            assert.equal(body.cancelAmt, 7000, "기환불 주문은 잔액 전체라도 cancelAmt 필수");
            if (scenario.timeout) throw new DOMException("Mock timeout", "AbortError");
            if (scenario.usedOrderId && (cancelCount === 1 || scenario.alwaysUsed)) {
              if (scenario.drift) balance = 6000;
              return Response.json({ resultCode: "U112", resultMsg: "이미 사용된 OrderId" });
            }
            if (body.cancelAmt > balance) return Response.json({ resultCode: "2032", resultMsg: "취소가능금액 초과" });
            balance -= body.cancelAmt; actualRefundCount += 1;
            return Response.json({ resultCode: "0000" });
          }
          if (scenario.lookupFailure || (scenario.afterLookupFailure && actualRefundCount > 0)) return Response.json({ resultCode: "error" });
          return Response.json({ resultCode: "0000", tid: "test-tid", status: balance ? "partialCancelled" : "cancelled",
            amount: 11000, balanceAmt: balance, cancels: [] });
        }
        throw new Error(`외부 호출 또는 예상 밖 요청 차단: ${url.hostname}${path}`);
      };
      const invoke = async () => {
        const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await paymentCancelHandler({ method: "POST", headers: { authorization: "Bearer mock-admin" }, body: {
          returnId: "00000000-0000-4000-8000-000000000001", action: scenario.action ?? "retry_remaining",
          refundAmount: 99999999, itemIds: [99999],
        } }, res);
        return res;
      };
      const results = await Promise.all(Array.from({ length: scenario.concurrent ? 2 : 1 }, invoke));
      for (const result of results) assert.equal(result.statusCode, scenario.blocked ? 409 : 200, JSON.stringify(result.body));
      assert.ok(actualRefundCount <= 1, "동시 요청에도 실제 환불은 최대 1회");
      assert.equal(completed, !scenario.blocked);
      if (scenario.balance !== undefined || scenario.lookupFailure || scenario.action === "reconcile") assert.equal(cancelCount, 0);
      if (scenario.timeout || scenario.drift) assert.equal(cancelCount, 1);
      if (scenario.usedOrderId && !scenario.drift) {
        const cancels = calls.filter(call => call.path.endsWith("/cancel"));
        assert.equal(cancels.length, 2);
        assert.equal(cancels[0].body.orderId, "TEST-0338-R11000");
        assert.match(cancels[1].body.orderId, /^TEST-0338-R11000-T\d+$/);
      }
      if (scenario.action !== "execute") assert.ok(!calls.some(call => call.path.endsWith("/admin_claim_return_refund")));
    });
  }
});
