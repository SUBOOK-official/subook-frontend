import test from "node:test";
import assert from "node:assert/strict";
import {
  IlseongApiError,
  createIlseongClient,
  getIlseongConfig,
  sha256Hex,
  signPartnerRequest,
  syncOrder,
} from "../api/_lib/ilseongPartner.js";
import { handleAdminAction, makeNotifier, runQueue } from "../api/admin/ilseong-app-codes.js";
import { DEFAULT_SOLAPI_TEMPLATE_IDS, getSolapiTemplateId } from "../api/_lib/solapiTemplates.js";
import { buildInAppTitle, buildMessageBody } from "../api/admin/send-notification.js";

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

test("관리 API: 앱 이용 안내 알림톡 템플릿 번호가 없으면 판매 켜기 거부, 있으면 허용, 끄기는 언제나 허용", async () => {
  const service = fakeService({
    ilseong_app_save_settings: (args) => ({ sales_enabled: args.p_sales_enabled }),
    ilseong_app_admin_overview: () => ({ counts: {} }),
  });
  const config = getIlseongConfig({ ILSEONG_API_BASE_URL: "https://app.test", ILSEONG_PARTNER_SECRET: SECRET });
  const base = { service, config, notify: async () => ({ ok: true }) };
  await assert.rejects(
    handleAdminAction({ ...base, action: "save_settings", body: { salesEnabled: true }, guideTemplateId: "" }),
    (err) => err.statusCode === 409 && err.code === "APP_GUIDE_TEMPLATE_MISSING",
  );
  assert.equal(service.calls.length, 0);
  const on = await handleAdminAction({ ...base, action: "save_settings", body: { salesEnabled: true }, guideTemplateId: "KA01TP-GUIDE" });
  assert.equal(on.settings.sales_enabled, true);
  const off = await handleAdminAction({ ...base, action: "save_settings", body: { salesEnabled: false }, guideTemplateId: "" });
  assert.equal(off.settings.sales_enabled, false);
  // 요약에 템플릿 번호가 있는지 함께 알려 준다(화면이 판매 켜기를 막고 까닭을 보여 준다)
  assert.equal((await handleAdminAction({ ...base, action: "overview", body: {}, guideTemplateId: "" })).guideTemplateReady, false);
  assert.equal((await handleAdminAction({ ...base, action: "overview", body: {}, guideTemplateId: "KA01TP-GUIDE" })).guideTemplateReady, true);
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

test("앱 관리 화면 입장권: 서명한 요청으로 직원 본인 것을 받는다", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ ticket: "one-time-ticket", expiresAt: "2026-11-17T00:01:00Z" }), { status: 200 });
  };
  const config = getIlseongConfig({ ILSEONG_API_BASE_URL: "https://app.test/", ILSEONG_PARTNER_SECRET: SECRET });
  const result = await handleAdminAction({
    action: "admin_ticket",
    body: {},
    service: fakeService({}),
    config,
    notify: async () => ({ ok: true }),
    userId: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b",
    userEmail: "staff@subook.test",
    clientFactory: (options) => createIlseongClient({ ...options, fetchImpl }),
  });
  assert.deepEqual(result, { ticket: "one-time-ticket", adminUrl: "https://app.test/admin/" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://app.test/api/partner/admin-tickets");
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(JSON.parse(seen[0].init.body.toString("utf8")), {
    staffRef: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b",
    staffName: "staff@subook.test",
  });
  assert.equal(seen[0].init.headers["X-Ilseong-Partner"], "subook");
  assert.match(seen[0].init.headers["X-Ilseong-Signature"], /^[0-9a-f]{64}$/);
});

test("앱 관리 화면 입장권: 연결 설정이 없거나 직원을 알 수 없으면 앱 서버를 부르지 않는다", async () => {
  let called = false;
  const clientFactory = () => { called = true; return { adminTicket: async () => ({ ticket: "x" }) }; };
  const base = { action: "admin_ticket", body: {}, service: fakeService({}), notify: async () => ({ ok: true }), clientFactory };
  await assert.rejects(
    handleAdminAction({ ...base, config: getIlseongConfig({}), userId: "staff-1" }),
    (err) => err.statusCode === 409 && err.code === "ILSEONG_NOT_CONFIGURED",
  );
  const config = getIlseongConfig({ ILSEONG_API_BASE_URL: "https://app.test", ILSEONG_PARTNER_SECRET: SECRET });
  await assert.rejects(handleAdminAction({ ...base, config, userId: null }), (err) => err.statusCode === 403);
  assert.equal(called, false);
});

test("관리 API 요약: 연결돼 있으면 앱 관리 화면 주소를 함께 준다", async () => {
  const service = fakeService({ ilseong_app_admin_overview: () => ({ counts: {} }) });
  const on = await handleAdminAction({
    action: "overview", body: {}, service, notify: async () => ({ ok: true }),
    config: getIlseongConfig({ ILSEONG_API_BASE_URL: "https://app.test", ILSEONG_PARTNER_SECRET: SECRET }),
  });
  assert.equal(on.adminUrl, "https://app.test/admin/");
  const off = await handleAdminAction({ action: "overview", body: {}, service, notify: async () => ({ ok: true }), config: getIlseongConfig({}) });
  assert.equal(off.adminUrl, null);
});

test("코드 발급: 주문한 회원을 함께 보낸다(비회원 주문이면 보내지 않는다)", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body.toString("utf8")));
    return new Response(JSON.stringify({ orderRef: "ORD-2611-0009", lines: [] }), { status: 200 });
  };
  const client = createIlseongClient({ baseUrl: "https://app.test", secret: SECRET, fetchImpl });
  const lines = [{ lineRef: "501-1", productCode: "ILSEONG_2028_SET4" }];
  await client.issueCodes("ORD-2611-0009", lines, { memberRef: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b" });
  await client.issueCodes("ORD-2611-0009", lines);
  await client.issueCodes("ORD-2611-0009", lines, { memberRef: null });
  await client.issueCodes("ORD-2611-0009", lines, { memberRef: "not a valid ref!" });
  assert.deepEqual(bodies[0], { lines, memberRef: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b" });
  for (const body of bodies.slice(1)) assert.deepEqual(body, { lines });
});

test("주문 맞추기: 발급할 때 주문의 회원(user_id)을 넘긴다", async () => {
  const seen = [];
  const client = {
    issueCodes: async (orderRef, lines, options) => {
      seen.push(options);
      return { orderRef, lines: lines.map((line) => ({ lineRef: line.lineRef, productCode: line.productCode, code: "AAAA-BBBB-CCCC-DDDD", status: "ISSUED" })) };
    },
  };
  const run = async (order) => {
    let stored = [lineRow({ line_ref: "501-1" })];
    const rpc = async (name, args) => {
      if (name === "ilseong_app_record_lines") stored = stored.map((line) => ({ ...line, code: args.p_lines[0].code, status: "issued" }));
      if (name === "ilseong_app_mark_notified") stored = stored.map((line) => ({ ...line, notified_at: "now" }));
      if (name === "ilseong_app_order_context") return { order, settings: {}, lines: stored };
      return null;
    };
    await syncOrder({ context: { order, settings: {}, lines: stored }, client, rpc, notify: async () => ({ ok: true }) });
  };
  await run({ id: 9, order_number: "ORD-2611-0009", payment_status: "paid", user_id: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b" });
  await run({ id: 10, order_number: "ORD-2611-G000000001", payment_status: "paid", user_id: null });
  assert.deepEqual(seen, [{ memberRef: "0b9f6a52-3c1d-4a8e-9f1b-2d3c4e5f6a7b" }, { memberRef: null }]);
});

// ── 앱 코드는 구매자·관리 화면에 내보내지 않는다(2026-11-18) ──────────────
const CODE = "AAAA-BBBB-CCCC-DDDD";

function orderContext() {
  return {
    order: { id: 9, order_number: "ORD-2611-0009", status: "preparing", payment_status: "paid", recipient_phone: "01000000000", user_id: "member-1" },
    settings: {},
    lines: [{ ...lineRow({ line_ref: "501-1", status: "issued", code: CODE, notified_at: "t" }), order_item_id: 501, title: "일성월심 학습지" }],
  };
}

test("관리 API 주문 조회: 앱 등록 상태만 주고 코드는 원문도 가린 것도 담지 않는다", async () => {
  const service = fakeService({ ilseong_app_find_order: () => 9, ilseong_app_order_context: () => orderContext() });
  const result = await handleAdminAction({
    action: "order", body: { orderNumber: "ORD-2611-0009" }, service, config: getIlseongConfig({}), notify: async () => ({ ok: true }),
  });
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].status, "issued");
  assert.equal("code" in result.lines[0], false);
  assert.equal("code_masked" in result.lines[0], false);
  const text = JSON.stringify(result);
  for (const part of CODE.split("-")) assert.equal(text.includes(part), false, `응답에 코드 조각 ${part}`);
});

test("관리 API: 새 코드로 바꾸기(reissue)는 없어졌다", async () => {
  let clientMade = false;
  const service = fakeService({ ilseong_app_order_context: () => orderContext() });
  await assert.rejects(
    handleAdminAction({
      action: "reissue", body: { orderId: 9, lineRef: "501-1" }, service, notify: async () => ({ ok: true }),
      config: getIlseongConfig({ ILSEONG_API_BASE_URL: "https://app.test", ILSEONG_PARTNER_SECRET: SECRET }),
      clientFactory: () => { clientMade = true; return {}; },
    }),
    (err) => err.statusCode === 400,
  );
  assert.equal(clientMade, false);
  assert.equal(service.calls.length, 0);
});

test("관리 API 안내 다시 보내기: 중복 허용으로 보내고 알림 기록을 남긴다", async () => {
  const sent = [];
  const service = fakeService({ ilseong_app_order_context: () => orderContext(), ilseong_app_mark_notified: () => 1 });
  const result = await handleAdminAction({
    action: "resend", body: { orderId: 9 }, service, config: getIlseongConfig({}),
    notify: async (payload) => { sent.push(payload); return { ok: true }; },
  });
  assert.equal(result.notified, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].allowDuplicate, true);
  assert.equal(JSON.stringify(result).includes("AAAA"), false);
  assert.deepEqual(service.calls.find((call) => call.name === "ilseong_app_mark_notified").args, { p_order_id: 9, p_line_refs: ["501-1"] });
});

test("안내 알림 요청: app_guide 타입으로 주문 id만 보낸다(코드를 싣지 않는다)", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const notify = makeNotifier({ baseUrl: "https://admin.test", cronSecret: "cron-secret", fetchImpl });
  const context = orderContext();
  const result = await notify({ order: context.order, lines: context.lines, allowDuplicate: false });
  assert.deepEqual(result, { ok: true, deduped: false });
  assert.equal(seen[0].url, "https://admin.test/api/admin/send-notification");
  assert.equal(seen[0].init.headers.Authorization, "Bearer cron-secret");
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    notificationType: "app_guide",
    refType: "order",
    refId: 9,
    recipientPhone: "01000000000",
    allowDuplicate: false,
    templateVariables: {},
  });
  assert.equal(seen[0].init.body.includes("AAAA"), false);
  // 크론 비밀값이 없으면 보내지 않는다
  const off = await makeNotifier({ baseUrl: "https://admin.test", cronSecret: "", fetchImpl })({ order: context.order });
  assert.equal(off.ok, false);
  assert.equal(seen.length, 1);
});

test("알림톡 템플릿 번호: 환경 변수 JSON이 먼저, 없으면 코드 기본값, 예전 app_code는 없다", () => {
  assert.equal(getSolapiTemplateId("app_guide", { SOLAPI_TEMPLATE_IDS: '{"app_guide":"KA01TP-ENV"}' }), "KA01TP-ENV");
  assert.equal(getSolapiTemplateId("app_guide", {}), DEFAULT_SOLAPI_TEMPLATE_IDS.app_guide);
  assert.equal(getSolapiTemplateId("app_guide", { SOLAPI_TEMPLATE_IDS: "not json" }), DEFAULT_SOLAPI_TEMPLATE_IDS.app_guide);
  assert.equal(getSolapiTemplateId("order_confirmed", { SOLAPI_TEMPLATE_IDS: '{"order_confirmed":"KA01TP-ORDER"}' }), "KA01TP-ORDER");
  assert.equal(getSolapiTemplateId("app_code", {}), "");
  assert.equal("app_code" in DEFAULT_SOLAPI_TEMPLATE_IDS, false);
});

test("안내 알림 문구: 솔라피에 등록한 템플릿과 같고 코드·앱 받는 주소가 없다", () => {
  // ALIMTALK_TEMPLATES.md "일성월심 앱 이용 안내" 절의 등록 문안에서 #{orderNumber}만 바꾼 것
  const expected = [
    "[수북(SUBOOK) 일성월심 앱 이용 안내]",
    "안녕하세요, 수북(SUBOOK)입니다.",
    "주문하신 일성월심 학습지의 앱 이용 방법을 안내드립니다.",
    "► 주문번호 : ORD-2611-0042",
    "[이용 방법]",
    "교재를 구매한 수북(SUBOOK) 계정으로 일성월심 앱에 로그인하면 교재가 자동으로 등록됩니다. 코드를 입력하실 필요가 없습니다.",
    "※ 앱 이용권은 교재 구매 고객에게 드리는 부가서비스이며, 교재를 반품·환불하면 앱 이용도 함께 끝납니다.",
  ].join("\n");
  const body = buildMessageBody("app_guide", { orderNumber: "ORD-2611-0042", appCode: "AAAA-BBBB-CCCC-DDDD" });
  assert.equal(body, expected);
  assert.equal(body.includes("AAAA"), false);
  assert.equal(/https?:\/\//.test(body), false);
  assert.equal(buildInAppTitle("app_guide", {}), "일성월심 앱에서 교재를 볼 수 있어요");
  // 예전 타입은 더 만들지 않는다
  assert.equal(buildMessageBody("app_code", { orderNumber: "ORD-2611-0042", appCode: "AAAA-BBBB-CCCC-DDDD" }), "");
});
