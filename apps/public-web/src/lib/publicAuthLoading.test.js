import assert from "node:assert/strict";
import test from "node:test";
import { runAuthTask } from "./publicAuthLoading.js";

test("인증 작업의 응답을 반환한다", async () => {
  assert.deepEqual(await runAuthTask(() => ({ session: null })), { session: null });
});

test("인증 초기화의 동기 오류와 비동기 오류를 전파한다", async () => {
  await assert.rejects(runAuthTask(() => { throw new Error("storage unavailable"); }), /storage unavailable/);
  await assert.rejects(runAuthTask(() => Promise.reject(new Error("network failure"))), /network failure/);
});

test("응답 없는 세션 잠금도 제한 시간에 종료하고 진행 중 요청을 취소한다", async () => {
  let signal;
  await assert.rejects(runAuthTask((taskSignal) => {
    signal = taskSignal;
    return new Promise(() => {});
  }, 10), { code: "auth_loading_timeout" });
  assert.equal(signal.aborted, true);
});
