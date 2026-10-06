import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMemberHistoryPages } from "./memberHistoryPagination.js";

const makeRows = (length) => Array.from({ length }, (_, id) => ({ id, title: `교재 ${id}` }));

test("서버가 20건씩 제한해도 마지막 빈 페이지까지 전부 조회한다", async () => {
  const allRows = makeRows(61);
  const offsets = [];
  const client = { rpc: async (_, { p_offset }) => {
    offsets.push(p_offset);
    return { data: allRows.slice(p_offset, p_offset + 20), error: null };
  } };
  const result = await fetchMemberHistoryPages(client, "history");
  assert.equal(result.error, null);
  assert.deepEqual(result.rows, allRows);
  assert.deepEqual(offsets, [0, 20, 40, 60, 61]);
});

test("뒷 페이지 실패·예외·잘못된 응답을 부분 성공이나 빈 내역으로 처리하지 않는다", async () => {
  for (const failure of [async () => ({ error: new Error("network") }), async () => { throw new Error("timeout"); }, async () => ({ data: {} })]) {
    const client = { rpc: async (_, { p_offset }) => p_offset === 0 ? { data: makeRows(20) } : failure() };
    const result = await fetchMemberHistoryPages(client, "history");
    assert.ok(result.error);
    assert.deepEqual(result.rows, []);
  }
});

test("페이지가 일부 겹치면 중복을 제거하고 같은 페이지만 반복되면 중단한다", async () => {
  let call = 0;
  const batches = [makeRows(20), makeRows(30).slice(15), []];
  const result = await fetchMemberHistoryPages({ rpc: async () => ({ data: batches[call++] }) }, "history");
  assert.equal(result.rows.length, 30);
  assert.equal(result.error, null);
  const repeated = await fetchMemberHistoryPages({ rpc: async () => ({ data: makeRows(20) }) }, "history");
  assert.ok(repeated.error);
});

// 실제 서비스 조회 함수에 가짜 RPC를 주입해 세 내역의 계약을 함께 확인한다.
const source = readFileSync(new URL("./memberPortal.js", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\r?\n/gm, "")
  .replace(/export\s*\{([\s\S]*?)\};?\s*$/, "return { fetchOrders, fetchPickupRequests, fetchSettlements };");

test("주문·수거 20건 및 정산 50건 이후의 내역과 정산 요약을 보존한다", async () => {
  const allRows = makeRows(151);
  const summary = { total_amount: 999000, expected_amount: 45000 };
  const client = { rpc: async (name, params) => {
    if (name === "get_my_order_return_progress") return { data: [] };
    const rows = allRows.slice(params.p_offset, params.p_offset + params.p_limit);
    return { data: name === "get_my_settlements" ? { rows, summary } : rows };
  } };
  const dependencies = { isSupabaseConfigured: true, supabase: client, fetchMemberHistoryPages, attachRefundRequestItems: async (_, orders) => orders };
  const portal = new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
  const [orders, pickups, settlements] = await Promise.all([portal.fetchOrders(), portal.fetchPickupRequests(), portal.fetchSettlements()]);
  assert.equal(orders.orders.length, 151);
  assert.equal(pickups.pickupRequests.length, 151);
  assert.equal(settlements.rows.length, 151);
  assert.deepEqual(settlements.summary, summary);
  for (const result of [orders, pickups, settlements]) assert.equal(result.source, "supabase");
});
