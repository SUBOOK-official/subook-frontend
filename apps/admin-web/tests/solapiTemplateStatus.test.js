import test from "node:test";
import assert from "node:assert/strict";
import { fetchSolapiTemplateStatus } from "../api/_lib/solapiTemplates.js";

const env = { SOLAPI_API_KEY: "key", SOLAPI_API_SECRET: "secret" };
const answer = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });

test("알림톡 템플릿의 카카오 검수 상태를 솔라피에 묻는다", async () => {
  let seen = null;
  const fetchImpl = async (url, options) => {
    seen = { url, auth: options.headers.Authorization };
    return { ok: true, status: 200, json: async () => ({ templateId: "KA01TP-GUIDE", status: "APPROVED" }) };
  };
  assert.equal(await fetchSolapiTemplateStatus("KA01TP-GUIDE", { env, fetchImpl }), "APPROVED");
  assert.equal(seen.url, "https://api.solapi.com/kakao/v2/templates/KA01TP-GUIDE");
  assert.match(seen.auth, /^HMAC-SHA256 apiKey=key, date=[0-9TZ:.-]+, salt=[0-9a-f]{64}, signature=[0-9a-f]{64}$/);
  assert.equal(await fetchSolapiTemplateStatus("T", { env, fetchImpl: answer(200, { status: "inspecting" }) }), "INSPECTING");
  assert.equal(await fetchSolapiTemplateStatus("T", { env, fetchImpl: answer(200, { status: "REJECTED" }) }), "REJECTED");
});

test("확인하지 못하면 UNKNOWN: 설정 없음, 실패 응답, 모르는 값, 연결 오류", async () => {
  let called = false;
  const never = async () => { called = true; return { ok: true, json: async () => ({ status: "APPROVED" }) }; };
  assert.equal(await fetchSolapiTemplateStatus("T", { env: {}, fetchImpl: never }), "UNKNOWN");
  assert.equal(await fetchSolapiTemplateStatus("", { env, fetchImpl: never }), "UNKNOWN");
  assert.equal(called, false);
  assert.equal(await fetchSolapiTemplateStatus("T", { env, fetchImpl: answer(404, { errorCode: "NotFound" }) }), "UNKNOWN");
  assert.equal(await fetchSolapiTemplateStatus("T", { env, fetchImpl: answer(200, { status: "SOMETHING_NEW" }) }), "UNKNOWN");
  assert.equal(await fetchSolapiTemplateStatus("T", { env, fetchImpl: async () => { throw new Error("network"); } }), "UNKNOWN");
});
