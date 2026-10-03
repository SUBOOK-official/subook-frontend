import test from "node:test";
import assert from "node:assert/strict";
import { requestCuratedContent, saveCuratedContent, searchCuratedProducts } from "./curatedContentClient.js";
import { saveContentTheme } from "./contentThemesClient.js";

test("읽기 네트워크 오류는 한 번 재시도한다", async () => {
  let calls = 0;
  assert.deepEqual(await requestCuratedContent(async () => ++calls === 1 ? { error: Error("network") } : { data: [1] }), [1]);
  assert.equal(calls, 2);
});

test("전체 목록과 검색의 페이지·검색어·전체 건수를 보존한다", async () => {
  const calls = [];
  const result = { products: [{ id: 31 }], total_count: 1110 };
  const client = { rpc(name, args) { calls.push({ name, args }); return { abortSignal: async () => ({ data: result }) }; } };
  assert.deepEqual(await searchCuratedProducts(client), result);
  assert.deepEqual(await searchCuratedProducts(client, " 홍 시대 % ", 30, 30), result);
  assert.deepEqual(calls.map((call) => call.args), [
    { p_search: "", p_offset: 0, p_limit: 30 }, { p_search: "홍 시대 %", p_offset: 30, p_limit: 30 },
  ]);
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

test("관의 고정 조건을 저장해도 선정 교재·노출·순서는 보존한다", async () => {
  let saved;
  const query = { eq() { return this; }, select() { return this; }, maybeSingle() { return this; }, abortSignal: async () => ({ data: saved }) };
  const client = { from: () => ({ update: (payload) => { saved = payload; return query; } }) };
  await saveContentTheme(client, { id: "theme", title: "시대관", description: "  관 소개  ", filter_context: { brands: "시대인재", types: "", unknown: "제거" },
    image_url: "https://example.com/icon.webp", product_ids: [7, 3, 8], is_enabled: true, sort_order: 2, updated_at: "v1" });
  assert.deepEqual(saved.filter_context, { brands: "시대인재" });
  assert.deepEqual(saved.product_ids, [7, 3, 8]);
  assert.equal(saved.description, "관 소개");
  assert.equal(saved.is_enabled, true);
  assert.equal(saved.sort_order, 2);
});
