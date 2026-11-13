import test from "node:test";
import assert from "node:assert/strict";
import { completeOAuthSignIn, parseOAuthCallback } from "./mobileAppClient.js";

test("소셜 로그인 복귀 주소에서 인증 코드와 오류를 읽는다", () => {
  assert.deepEqual(parseOAuthCallback("subook://auth-callback?code=abc-123"), { code: "abc-123", error: null });
  assert.deepEqual(parseOAuthCallback("subook://auth-callback?error=access_denied&error_description=User+cancelled%21#x"), { code: null, error: "User cancelled!" });
  assert.deepEqual(parseOAuthCallback("subook://auth-callback#error=server_error"), { code: null, error: "server_error" });
  assert.deepEqual(parseOAuthCallback("subook://auth-callback"), { code: null, error: null });
  assert.deepEqual(parseOAuthCallback(null), { code: null, error: null });
});

test("인증 코드가 있을 때만 세션으로 바꾼다", async () => {
  const calls = [];
  const client = { auth: { exchangeCodeForSession: async (code) => { calls.push(code); return { data: { session: { user: { id: "u1" } } }, error: null }; } } };
  assert.deepEqual(await completeOAuthSignIn(client, "subook://auth-callback?code=c1"), { user: { id: "u1" } });
  await assert.rejects(() => completeOAuthSignIn(client, "subook://auth-callback?error_description=denied"), /denied/);
  await assert.rejects(() => completeOAuthSignIn(client, "subook://auth-callback"), /로그인 정보/);
  assert.deepEqual(calls, ["c1"]);
});
