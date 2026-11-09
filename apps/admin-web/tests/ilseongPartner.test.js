import test from "node:test";
import assert from "node:assert/strict";
import {
  IlseongApiError,
  createIlseongClient,
  getIlseongConfig,
  maskAppCode,
  sha256Hex,
  signPartnerRequest,
  syncOrder,
} from "../api/_lib/ilseongPartner.js";
import { handleAdminAction, runQueue } from "../api/admin/ilseong-app-codes.js";

// 기대값은 openssl로 따로 계산했다(같은 코드로 만든 값이 아님):
//   printf 'subook\n1762671600\nPOST\n/api/partner/orders/ORD-2611-0001/codes\n<sha256(본문)>' | openssl dgst -sha256 -hmac unit-test-secret
const SECRET = "unit-test-secret";
const BODY = '{"lines":[{"lineRef":"501-1","productCode":"ILSEONG_2028_SET4"}]}';

test("서명: 본문 SHA-256과 HMAC이 openssl 계산값과 같다", () => {
  assert.equal(sha256Hex(Buffer.from(BODY, "utf8")), "8ad39896339db31773d3214ca30e02cdf77ed8c4f3f1a104e81d626f0f96b391");
  assert.equal(
    signPartnerRequest({ secret: SECRET, timestamp: "1762671600", method: "POST", path: "/api/partner/orders/ORD-2611-0001/codes", body: Buffer.from(BODY) }),
    "90f10a02984e67e28780fafba97b64b3f3b1bf2332748e0bb960facafce38ae4",
  );
  // 본문 없음 = 빈 바이트의 SHA-256, 메서드는 대문자로
  assert.equal(
    signPartnerRequest({ secret: SECRET, timestamp: "1762671600", method: "get", path: "/api/partner/orders/ORD-2611-0001", body: null }),
    "0b04d4056a31529681d4291cd46ae9b8c24f97d56bba023103303e2baa1e051a",
  );
});

test("클라이언트: 서명한 바이트를 그대로 보내고 쿼리 없는 경로로 서명한다", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ orderRef: "ORD-2611-0001", lines: [] }), { status: 200 });
  };
  const client = createIlseongClient({ baseUrl: "http://localhost:8080/", secret: SECRET, fetchImpl, now: () => 1762671600_000 });
  await client.issueCodes("ORD-2611-0001", [{ lineRef: "501-1", productCode: "ILSEONG_2028_SET4" }]);
  await client.getOrder("ORD-2611-0001");

  const [post, get] = calls;
  assert.equal(post.url, "http://localhost:8080/api/partner/orders/ORD-2611-0001/codes");
  assert.equal(post.init.method, "POST");
  assert.equal(Buffer.from(post.init.body).toString("utf8"), BODY);
  assert.equal(post.init.headers["X-Ilseong-Partner"], "subook");
  assert.equal(post.init.headers["X-Ilseong-Timestamp"], "1762671600");
  assert.equal(post.init.headers["X-Ilseong-Signature"], "90f10a02984e67e28780fafba97b64b3f3b1bf2332748e0bb960facafce38ae4");
  assert.equal(get.init.body, undefined);
  assert.equal(get.init.headers["X-Ilseong-Signature"], "0b04d4056a31529681d4291cd46ae9b8c24f97d56bba023103303e2baa1e051a");
});

test("클라이언트: 오류 코드와 재시도 여부를 나눈다", async () => {
  const respond = (status, body) => async () => new Response(JSON.stringify(body), { status });
  const make = (fetchImpl) => createIlseongClient({ baseUrl: "http://x.test", secret: SECRET, fetchImpl });

  await assert.rejects(make(respond(404, { code: "ORDER_NOT_FOUND", detail: "없음" })).getOrder("A1"),
    (err) => err instanceof IlseongApiError && err.code === "ORDER_NOT_FOUND" && err.retryable === false);
  await assert.rejects(make(respond(503, {})).getOrder("A1"), (err) => err.retryable === true && err.status === 503);
  await assert.rejects(make(respond(401, { code: "BAD_SIGNATURE" })).getOrder("A1"), (err) => err.code === "BAD_SIGNATURE" && err.retryable);
  await assert.rejects(make(async () => { throw new TypeError("fetch failed"); }).getOrder("A1"), (err) => err.code === "NETWORK_ERROR");
  // 형식이 틀린 주문번호는 보내지 않는다
  await assert.rejects(make(respond(200, {})).getOrder("주문/1"), (err) => err.code === "INVALID_REF");
});

test("설정: 두 환경 변수가 모두 있어야 켜진다", () => {
  assert.equal(getIlseongConfig({}).configured, false);
  assert.equal(getIlseongConfig({ ILSEONG_API_BASE_URL: "https://api.test" }).configured, false);
  assert.equal(getIlseongConfig({ ILSEONG_PARTNER_SECRET: "s" }).configured, false);
  assert.equal(getIlseongConfig({ ILSEONG_API_BASE_URL: "not-a-url", ILSEONG_PARTNER_SECRET: "s" }).configured, false);
  assert.deepEqual(getIlseongConfig({ ILSEONG_API_BASE_URL: "https://api.test/", ILSEONG_PARTNER_SECRET: "s" }),
    { configured: true, baseUrl: "https://api.test", secret: "s" });
});

test("가림: 관리 화면에는 앞뒤 4자만", () => {
  assert.equal(maskAppCode("ABCD-EFGH-JKMN-PQRS"), "ABCD-••••-••••-PQRS");
  assert.equal(maskAppCode(null), null);
});

function fakeService(handlers) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      const fn = handlers[name];
      if (!fn) return { data: null, error: { message: `unexpected rpc ${name}` } };
      return { data: await fn(args), error: null };
    },
  };
}

test("크론: 연결 설정이 없으면 앱 서버를 부르지 않고 판매만 끈다", async () => {
  const service = fakeService({ ilseong_app_disable_sales: () => false });
  let factoryCalled = false;
  const result = await runQueue({
    service,
    config: getIlseongConfig({}),
    notify: async () => { throw new Error("알림을 보내면 안 됨"); },
    clientFactory: () => { factoryCalled = true; return {}; },
  });
  assert.deepEqual(result, { configured: false, processed: 0, salesDisabled: false });
  assert.equal(factoryCalled, false);
  assert.deepEqual(service.calls.map((call) => call.name), ["ilseong_app_disable_sales"]);
});

test("관리 API: 연결 설정 없이 판매 켜기는 거부, 끄기는 허용", async () => {
  const service = fakeService({ ilseong_app_save_settings: (args) => ({ sales_enabled: args.p_sales_enabled }) });
  await assert.rejects(
    handleAdminAction({ action: "save_settings", body: { salesEnabled: true }, service, config: getIlseongConfig({}), notify: async () => ({ ok: true }) }),
    (err) => err.statusCode === 409 && err.code === "ILSEONG_NOT_CONFIGURED",
  );
  assert.equal(service.calls.length, 0);
  const off = await handleAdminAction({ action: "save_settings", body: { salesEnabled: false, refundPolicy: "none" }, service, config: getIlseongConfig({}), notify: async () => ({ ok: true }) });
  assert.equal(off.settings.sales_enabled, false);
});

function lineRow(overrides) {
  return {
    line_ref: "501-1", app_product_code: "ILSEONG_2028_SET4", status: "pending", code: null,
    notified_at: null, revoke_requested_at: null, revoke_access: null, revoke_processed_at: null, reissued_at: null,
    ...overrides,
  };
}

test("주문 맞추기: 발급 → 저장 → 알림 → 알림 기록", async () => {
  const order = { id: 9, order_number: "ORD-2611-0009", payment_status: "paid", recipient_phone: "01000000000" };
  let stored = [lineRow({ line_ref: "501-1" }), lineRow({ line_ref: "501-2" })];
  const rpcLog = [];
  const rpc = async (name, args) => {
    rpcLog.push(name);
    if (name === "ilseong_app_record_lines") {
      stored = stored.map((line) => {
        const hit = args.p_lines.find((item) => item.lineRef === line.line_ref);
        return hit ? { ...line, code: hit.code, status: hit.status.toLowerCase() } : line;
      });
    }
    if (name === "ilseong_app_mark_notified") {
      stored = stored.map((line) => (args.p_line_refs.includes(line.line_ref) ? { ...line, notified_at: "now" } : line));
    }
    if (name === "ilseong_app_order_context") return { order, settings: {}, lines: stored };
    return null;
  };
  const client = {
    issueCodes: async (orderRef, lines) => ({
      orderRef,
      lines: lines.map((line, i) => ({ lineRef: line.lineRef, productCode: line.productCode, code: `AAAA-BBBB-CCCC-DDD${i + 2}`, status: "ISSUED" })),
    }),
  };
  const notified = [];
  const result = await syncOrder({ context: { order, settings: {}, lines: stored }, client, rpc, notify: async (payload) => { notified.push(payload); return { ok: true }; } });
  assert.deepEqual(result, { ok: true, issued: 2, revoked: 0, notified: 2 });
  assert.equal(notified.length, 1);
  assert.equal(notified[0].allowDuplicate, false);
  assert.ok(stored.every((line) => line.notified_at && line.code));
  assert.deepEqual(rpcLog, ["ilseong_app_record_lines", "ilseong_app_order_context", "ilseong_app_mark_notified"]);
});

test("주문 맞추기: 알림 실패는 오류로 올려 다시 시도하게 한다", async () => {
  const order = { id: 9, order_number: "ORD-2611-0009", payment_status: "paid" };
  const lines = [lineRow({ status: "issued", code: "AAAA-BBBB-CCCC-DDDD" })];
  await assert.rejects(
    syncOrder({ context: { order, lines }, client: {}, rpc: async () => null, notify: async () => ({ ok: false, error: "templateId 미설정" }) }),
    (err) => err.code === "NOTIFY_FAILED" && /templateId/.test(err.message),
  );
});

test("주문 맞추기: 환불 폐기 — 앱 서버에 없는 줄은 폐기로 적고, 있는 줄만 revokeAccess로 보낸다", async () => {
  const order = { id: 9, order_number: "ORD-2611-0009", payment_status: "paid" };
  const lines = [
    lineRow({ line_ref: "501-1", status: "redeemed", code: "AAAA-BBBB-CCCC-DDDD", notified_at: "t", revoke_requested_at: "t", revoke_access: true }),
    lineRow({ line_ref: "501-2", status: "pending", revoke_requested_at: "t", revoke_access: true }),
  ];
  const calls = [];
  const client = {
    getOrder: async () => ({ lines: [{ lineRef: "501-1", status: "REDEEMED" }] }),
    revoke: async (orderRef, body) => { calls.push(body); return { lines: [{ lineRef: "501-1", status: "REVOKED" }] }; },
  };
  const rpcCalls = [];
  const rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return name === "ilseong_app_order_context" ? { order, lines: lines.map((l) => ({ ...l, revoke_processed_at: "t" })) } : null;
  };
  const result = await syncOrder({ context: { order, lines }, client, rpc, notify: async () => { throw new Error("no"); } });
  assert.equal(result.revoked, 1);
  assert.deepEqual(calls, [{ lineRefs: ["501-1"], revokeAccess: true }]);
  const marks = rpcCalls.filter((call) => call.name === "ilseong_app_mark_revoke_processed").map((call) => call.args.p_line_refs);
  assert.deepEqual(marks, [["501-2"], ["501-1"]]);
});

test("주문 맞추기: 앱 서버에 주문이 아예 없으면(404) 폐기 요청 줄을 모두 처리 완료로", async () => {
  const order = { id: 9, order_number: "ORD-2611-0009", payment_status: "paid" };
  const lines = [lineRow({ line_ref: "501-1", revoke_requested_at: "t", revoke_access: true })];
  const client = { getOrder: async () => { throw new IlseongApiError("없음", { status: 404, code: "ORDER_NOT_FOUND", retryable: false }); } };
  const marks = [];
  const rpc = async (name, args) => {
    if (name === "ilseong_app_mark_revoke_processed") marks.push(args.p_line_refs);
    return name === "ilseong_app_order_context" ? { order, lines: [] } : null;
  };
  await syncOrder({ context: { order, lines }, client, rpc, notify: async () => ({ ok: true }) });
  assert.deepEqual(marks, [["501-1"]]);
});
