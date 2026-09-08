import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG_UNAVAILABLE_MESSAGE, createPublicCatalogClient, isPublicSupabaseKey } from "./publicCatalogClient.js";

const publicKey = "sb_publishable_catalog_test";
const config = { url: "https://catalog-test.supabase.co", publicKey, retryDelayMs: 0 };

test("공개 키만 허용하고 비밀·서비스 역할·회원 토큰을 거부한다", () => {
  const jwt = (role) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.equal(isPublicSupabaseKey(publicKey), true);
  assert.equal(isPublicSupabaseKey(jwt("anon")), true);
  for (const key of [undefined, "sb_secret_secret", "sb_publishable_replace_me", jwt("service_role"), jwt("authenticated"), "invalid"]) assert.equal(isPublicSupabaseKey(key), false);
  assert.equal(createPublicCatalogClient({ ...config, publicKey: "sb_secret_secret" }), null);
  assert.equal(createPublicCatalogClient({ ...config, url: "http://catalog-test.supabase.co" }), null);
});

test("공개 목록과 상세 RPC만 호출하고 원본 rows를 반환한다", async () => {
  const calls = [];
  const client = createPublicCatalogClient({ ...config, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), args: JSON.parse(options.body) });
    return new Response(JSON.stringify([{ product_id: 42 }]), { headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual(await client.list({ p_limit: 24 }), [{ product_id: 42 }]);
  await client.detail("42");
  assert.equal(calls[0].url, `${config.url}/rest/v1/rpc/list_public_store_products`);
  assert.equal(calls[1].url, `${config.url}/rest/v1/rpc/get_public_store_product_detail`);
  assert.deepEqual(calls[1].args, { p_product_id: "42" });
  await assert.rejects(client.detail("../secret"));
  assert.equal(calls.length, 2);
});

test("일시적 네트워크 실패는 재시도하고 권한 오류는 재시도하지 않는다", async () => {
  let attempts = 0;
  const client = createPublicCatalogClient({ ...config, fetchImpl: async () => {
    if (++attempts === 1) throw new TypeError("Network request failed");
    return new Response("[]");
  } });
  assert.deepEqual(await client.list({}), []);
  assert.equal(attempts, 2);
  attempts = 0;
  const deniedClient = createPublicCatalogClient({ ...config, fetchImpl: async () => {
    attempts += 1;
    return new Response(JSON.stringify({ message: "internal details" }), { status: 403 });
  } });
  await assert.rejects(deniedClient.list({}), { message: CATALOG_UNAVAILABLE_MESSAGE });
  assert.equal(attempts, 1);
});

test("화면 이동에 따른 요청 취소와 시간 초과를 구분한다", async () => {
  let attempts = 0;
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    attempts += 1;
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const client = createPublicCatalogClient({ ...config, timeoutMs: 15, fetchImpl });
  await assert.rejects(client.list({}), { message: CATALOG_UNAVAILABLE_MESSAGE });
  assert.equal(attempts, 2);
  attempts = 0;
  const controller = new AbortController();
  const pending = client.list({}, controller.signal);
  setTimeout(() => controller.abort(), 1);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(attempts, 1);
});
