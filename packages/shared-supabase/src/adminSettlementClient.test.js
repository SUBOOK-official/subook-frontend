import test from "node:test";
import assert from "node:assert/strict";
import { completeJeonilSettlements, fetchAdminSettlementRows, fetchJeonilSettlementData } from "./adminSettlementClient.js";

const mockClient = (run) => ({ rpc: (...args) => ({ abortSignal: (signal) => run(...args, signal) }) });

test("전일학원 조회는 일반 셀러 RPC와 분리하고 응답 구조를 검증한다", async () => {
  const data = { payable: [], waiting: [], completed: [], fee_percent: 50 };
  assert.deepEqual(await fetchJeonilSettlementData(mockClient(async (name) => {
    assert.equal(name, "admin_get_jeonil_settlements"); return { data };
  })), data);
  await assert.rejects(fetchJeonilSettlementData(mockClient(async () => ({ data: {} }))));
});
test("전일학원 지급은 확인한 품목·총액·메모를 전달하며 오류 시 재시도하지 않는다", async () => {
  let writes = 0;
  const client = mockClient(async (name, args) => {
    writes++;
    assert.equal(name, "admin_complete_jeonil_settlements");
    assert.deepEqual(args, { p_order_item_ids: [17], p_expected_amount: 29500, p_transfer_reference: "원장님 이체" });
    return { error: Error("connection lost") };
  });
  await assert.rejects(completeJeonilSettlements(client, [{ order_item_id: 17 }], 29500, " 원장님 이체 "));
  assert.equal(writes, 1);
});

test("500건 이후 페이지까지 읽어 셀러 총액 누락을 방지한다", async () => {
  const calls = [];
  const rows = Array.from({ length: 503 }, (_, id) => ({ id }));
  const client = mockClient(async (name, args) => {
    calls.push({ name, args });
    return { data: { rows: rows.slice(args.p_offset, args.p_offset + args.p_limit), total_count: rows.length } };
  });
  assert.deepEqual(await fetchAdminSettlementRows(client, ["pending", "approved"]), rows);
  assert.deepEqual(calls.map(({ args }) => args.p_offset), [0, 500]);
  assert.ok(calls.every(({ args }) => !args.p_from_date && !args.p_to_date && !args.p_search));
});
test("후속 페이지 실패·누락·중복·조회 중 변경 시 부분 합계를 반환하지 않는다", async () => {
  for (const second of [
    { error: Error("network") },
    { data: { rows: [], total_count: 2 } },
    { data: { rows: [{ id: 1 }], total_count: 2 } },
    { data: { rows: [{ id: 2 }], total_count: 3 } },
  ]) {
    let calls = 0;
    await assert.rejects(fetchAdminSettlementRows(mockClient(async () => ++calls === 1 ? { data: { rows: [{ id: 1 }], total_count: 2 } } : second), ["pending"]));
  }
});
test("탭 변경으로 폐기된 요청은 후속 조회와 화면 갱신을 중단한다", async () => {
  let current = true;
  const client = mockClient(async () => { current = false; return { data: { rows: [{ id: 1 }], total_count: 2 } }; });
  assert.equal(await fetchAdminSettlementRows(client, ["completed"], () => current), null);
});

test("읽기 연결 오류는 한 번 재시도하지만 권한 오류는 즉시 반환한다", async () => {
  let calls = 0;
  const client = mockClient(async (_name, _args, signal) => {
    assert.ok(signal instanceof AbortSignal);
    return ++calls === 1 ? { error: Error("network") } : { data: { rows: [], total_count: 0 } };
  });
  assert.deepEqual(await fetchAdminSettlementRows(client, ["pending"]), []);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(fetchAdminSettlementRows(mockClient(async () => { calls++; return { error: { code: "42501", message: "denied" } }; }), ["pending"]));
  assert.equal(calls, 1);
});
