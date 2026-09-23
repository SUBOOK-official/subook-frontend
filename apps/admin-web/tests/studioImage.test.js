import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/admin/book-studio.js";
import { generateStudioImage } from "../api/_lib/studioImage.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString("base64");
const input = { apiKey: "test-key", imageBase64: jpeg, mimeType: "image/jpeg" };
const imageResponse = () => new Response(JSON.stringify({ data: [{ b64_json: jpeg }], output_format: "jpeg" }));
const apiError = (status, code = "server_error") => new Response(JSON.stringify({ error: { code } }), {
  status, headers: { "retry-after": "0.001" },
});

test("표지는 원본 바이트를 GPT medium 2K로 전송하고 JPEG 업로드 계약을 유지한다", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    assert.equal(options.body.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(options.body.get("quality"), "medium");
    assert.equal(options.body.get("size"), "2048x2048");
    assert.equal(options.body.get("output_format"), "jpeg");
    assert.equal(options.body.get("output_compression"), "90");
    assert.deepEqual(Buffer.from(await options.body.get("image").arrayBuffer()), Buffer.from(jpeg, "base64"));
    assert.ok(!options.body.has("input_fidelity"));
    return imageResponse();
  });
  assert.deepEqual(await generateStudioImage(input), { imageBase64: jpeg, mimeType: "image/jpeg" });
});

test("명시적 일시 오류는 같은 medium 설정으로 한 번 재시도한다", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.body.get("quality"), "medium");
    return ++calls === 1 ? apiError(503) : imageResponse();
  });
  await generateStudioImage(input);
  assert.equal(calls, 2);
});

test("계속 실패해도 유료 생성 요청은 최대 두 번이다", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return apiError(429, "rate_limit_exceeded"); });
  await assert.rejects(generateStudioImage(input), { code: "OPENAI_RATE_LIMITED", status: 429 });
  assert.equal(calls, 2);
});

test("JSON이 아닌 502 응답도 일시 오류로 한 번만 재시도한다", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? new Response("Bad Gateway", { status: 502, headers: { "retry-after": "0.001" } })
    : imageResponse());
  await generateStudioImage(input);
  assert.equal(calls, 2);
});

for (const [status, providerCode, expectedCode] of [
  [429, "insufficient_quota", "OPENAI_BILLING_REQUIRED"],
  [401, "invalid_api_key", "OPENAI_AUTH_FAILED"],
  [400, "invalid_request", "OPENAI_REQUEST_FAILED"],
]) {
  test(`${providerCode} 오류를 자동 재생성하지 않는다`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls += 1; return apiError(status, providerCode); });
    await assert.rejects(generateStudioImage(input), { code: expectedCode });
    assert.equal(calls, 1);
  });
}

test("응답 본문을 읽다가 시간 초과가 나도 요청을 취소하고 재생성하지 않는다", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "setTimeout", (callback) => { queueMicrotask(callback); return 0; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    return { json: () => new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(new Error("aborted"));
      else options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }) };
  });
  await assert.rejects(generateStudioImage(input), { code: "OPENAI_TIMEOUT" });
  assert.equal(calls, 1);
});

for (const [output, expectedCode] of [
  [undefined, "MODEL_EMPTY_IMAGE_OUTPUT"],
  ["a".repeat(4_200_004), "STUDIO_OUTPUT_TOO_LARGE"],
  [Buffer.from("not-a-jpeg").toString("base64"), "INVALID_STUDIO_IMAGE"],
]) {
  test(`${expectedCode}: 완성 응답 검증 실패를 새 유료 요청으로 재시도하지 않는다`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ b64_json: output }] }));
    });
    await assert.rejects(generateStudioImage(input), { code: expectedCode });
    assert.equal(calls, 1);
  });
}

function setEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

async function callHandler(body, headers = {}) {
  const result = {};
  const res = { setHeader() {}, status(status) { result.status = status; return this; }, json(value) { result.body = value; return this; } };
  await handler({ method: "POST", headers, body }, res);
  return result;
}

test("인증 없는 표지 요청은 모델 API를 호출하지 않는다", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected external request"); });
  assert.equal((await callHandler(input)).status, 401);
});

test("일반 회원은 표지 유료 생성 권한이 없다", async (t) => {
  setEnv(t, { SUPABASE_ADMIN_URL: "https://fixture.supabase.co", SUPABASE_ADMIN_ANON_KEY: "anon" });
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "fixture-user" }));
    if (String(url).endsWith("/rpc/is_admin_user")) return new Response("false");
    throw new Error("Unexpected paid request");
  });
  assert.equal((await callHandler(input, { authorization: "Bearer fixture-token" })).status, 403);
});

test("관리자 표지는 OpenAI만 사용하고 사용자 지정 품질을 무시한다", async (t) => {
  setEnv(t, { SUPABASE_ADMIN_URL: "https://fixture.supabase.co", SUPABASE_ADMIN_ANON_KEY: "anon", OPENAI_API_KEY: "test-key", GEMINI_API_KEY: undefined, GOOGLE_API_KEY: undefined });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "fixture-admin" }));
    if (String(url).endsWith("/rpc/is_admin_user")) return new Response("true");
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.get("quality"), "medium");
    return imageResponse();
  });
  const result = await callHandler({ ...input, quality: "high" }, { authorization: "Bearer fixture-token" });
  assert.equal(result.status, 200);
  assert.equal(result.body.mimeType, "image/jpeg");
});

test("기존 summary 인증·분기는 OpenAI 키 없이도 동작한다", async (t) => {
  setEnv(t, { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", GEMINI_API_KEY: "gemini", OPENAI_API_KEY: undefined });
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /\/rest\/v1\/products/);
    return new Response(JSON.stringify([{ id: 123, ai_summary: "기존 소개" }]));
  });
  const result = await callHandler({ mode: "summary", token: "service", productId: 123 });
  assert.equal(result.status, 200);
  assert.equal(result.body.skipped, "exists");
});

test("두 저장소의 배포 API와 이미지 헬퍼가 동기화돼 있다", async () => {
  for (const name of ["admin/book-studio.js", "_lib/studioImage.js"]) {
    const front = await readFile(new URL(`../api/${name}`, import.meta.url), "utf8");
    const back = await readFile(new URL(`../../../../backend/api/${name}`, import.meta.url), "utf8");
    assert.equal(front, back);
  }
});
