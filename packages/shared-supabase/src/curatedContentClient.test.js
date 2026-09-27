import test from "node:test";
import assert from "node:assert/strict";
import { requestCuratedContent, saveCuratedContent } from "./curatedContentClient.js";

test("읽기 네트워크 오류는 한 번 재시도한다", async () => {
  let calls = 0;
  assert.deepEqual(await requestCuratedContent(async () => ++calls === 1 ? { error: Error("network") } : { data: [1] }), [1]);
  assert.equal(calls, 2);
});
test("권한 오류는 재시도하지 않고 timeout은 abort한다", async () => {
  let calls = 0;
  await assert.rejects(requestCuratedContent(async () => { calls++; return { error: { code: "42501", message: "denied" } }; }));
  assert.equal(calls, 1);
  let signal;
  await assert.rejects(requestCuratedContent((value) => { signal = value; return new Promise(() => {}); }, { attempts: 1, timeout: 5 }), /초과/);
  assert.equal(signal.aborted, true);
});
test("수정 버전 불일치와 저장 오류를 자동 재시도하지 않는다", async () => {
  let writes = 0;
  const filters = [];
  const query = { eq(key, value) { filters.push([key, value]); return this; }, select() { return this; }, maybeSingle() { return this; }, abortSignal: async () => ({ data: null }) };
  const client = { from: () => ({ update: () => { writes++; return query; } }) };
  await assert.rejects(saveCuratedContent(client, "themes", "id", { id: "t" }, "version1"), /다른 관리자/);
  assert.equal(writes, 1);
  assert.deepEqual(filters, [["id", "t"], ["updated_at", "version1"]]);
});
