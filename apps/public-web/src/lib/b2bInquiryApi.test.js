import test from "node:test";
import assert from "node:assert/strict";
import handler, { validateB2bInquiry } from "../../api/b2b-inquiry.js";

const validBody = {
  organization: "수북학원",
  contactName: "홍길동",
  phone: "010-1234-5678",
  email: "Manager@Example.com",
  quantity: 120,
  interests: "수학 실전 모의고사",
  requestDetails: "10월부터 매월 공급을 희망합니다.",
  privacyConsent: true,
  website: "",
};

function createResponseRecorder() {
  const result = { code: 0, headers: {}, body: null };
  return {
    result,
    res: {
      setHeader(name, value) { result.headers[name] = value; },
      status(code) { result.code = code; return this; },
      json(body) { result.body = body; return this; },
    },
  };
}

test("B2B 문의 입력을 정규화하고 개인정보 동의를 강제한다", () => {
  const validated = validateB2bInquiry(validBody);
  assert.equal(validated.value.phone, "01012345678");
  assert.equal(validated.value.email, "manager@example.com");
  assert.equal(validateB2bInquiry({ ...validBody, privacyConsent: false }).code, "PRIVACY_CONSENT_REQUIRED");
  assert.equal(validateB2bInquiry({ ...validBody, phone: "02-123-4567" }).code, "INVALID_PHONE");
  assert.equal(validateB2bInquiry({ ...validBody, quantity: 1.5 }).code, "INVALID_QUANTITY");
});

test("정상 문의는 같은 referenceId로 RPC를 재시도하고 접수번호를 반환한다", async (t) => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://b2b-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) {
      return { ok: false, status: 503, json: async () => ({ message: "temporary" }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ queued: true, referenceId: calls[1].p_inquiry.referenceId }),
    };
  };
  t.after(() => {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  const { res, result } = createResponseRecorder();
  await handler({ method: "POST", headers: {}, body: validBody }, res);

  assert.equal(result.code, 200);
  assert.equal(result.body.success, true);
  assert.match(result.body.referenceId, /^B2B-[0-9]{8}-[A-F0-9]{6}$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].p_inquiry.referenceId, calls[1].p_inquiry.referenceId);
  assert.equal(calls[1].p_inquiry.phone, "01012345678");
});

test("허니팟 입력은 운영 채널 호출 없이 조용히 종료한다", async (t) => {
  const previousFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; };
  t.after(() => { global.fetch = previousFetch; });

  const { res, result } = createResponseRecorder();
  await handler({ method: "POST", headers: {}, body: { website: "spam.example" } }, res);

  assert.equal(result.code, 200);
  assert.equal(result.body.success, true);
  assert.equal(called, false);
});

test("교차 사이트 요청과 잘못된 본문을 거부한다", async () => {
  const crossSite = createResponseRecorder();
  await handler({ method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: validBody }, crossSite.res);
  assert.equal(crossSite.result.code, 403);

  const invalid = createResponseRecorder();
  await handler({ method: "POST", headers: {}, body: { ...validBody, email: "not-an-email" } }, invalid.res);
  assert.equal(invalid.result.code, 400);
  assert.equal(invalid.result.body.code, "INVALID_EMAIL");
});
