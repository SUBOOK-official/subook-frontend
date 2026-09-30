import assert from "node:assert/strict";
import test from "node:test";
import { updateAdminProductTitle } from "./adminProductTitleClient.js";

function mockClient({ option = "시즌 1", reads, result = { data: { success: true } } } = {}) {
  const calls = [];
  const responses = [...(reads ?? [{ data: { id: 42, option } }])];
  const query = {
    select(fields) { calls.push(["select", fields]); return this; },
    eq(field, value) { calls.push(["eq", field, value]); return this; },
    single() { return this; },
    async abortSignal(signal) {
      assert.equal(signal.aborted, false);
      return responses.shift();
    },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return query; },
    rpc(name, payload) {
      calls.push(["rpc", name, payload]);
      return { async abortSignal() { return result; } };
    },
  };
}

test("교재명만 수정할 때 검색 결과에 없는 마스터 옵션을 보존한다", async () => {
  const client = mockClient();
  assert.equal(await updateAdminProductTitle(client, 42, "  2027 교재 수정  "), "2027 교재 수정");
  assert.deepEqual(client.calls.find(([kind]) => kind === "rpc"), [
    "rpc", "admin_update_product_master",
    { p_product_id: 42, p_title: "2027 교재 수정", p_option: "시즌 1" },
  ]);
  assert.deepEqual(client.calls.find(([kind]) => kind === "eq"), ["eq", "id", 42]);
});

test("옵션 없는 상품은 옵션을 새로 만들지 않는다", async () => {
  const client = mockClient({ option: null });
  await updateAdminProductTitle(client, 42, "수정");
  assert.equal(client.calls.find(([kind]) => kind === "rpc")[2].p_option, null);
});

test("빈 이름은 서버 호출 없이 거부한다", async () => {
  const client = mockClient();
  await assert.rejects(updateAdminProductTitle(client, 42, " \n "), /교재명을 입력/);
  assert.equal(client.calls.length, 0);
});

test("조회 실패 시 상품 수정을 실행하지 않는다", async () => {
  const client = mockClient({ reads: [{ error: { message: "접근 권한 없음" }, status: 403 }] });
  await assert.rejects(updateAdminProductTitle(client, 42, "수정"), /접근 권한 없음/);
  assert.equal(client.calls.filter(([kind]) => kind === "rpc").length, 0);
});

test("일시적 조회 실패는 한 번 재시도한다", async () => {
  const client = mockClient({ reads: [
    { error: { message: "일시 오류" }, status: 503 },
    { data: { id: 42, option: "최신 옵션" } },
  ] });
  await updateAdminProductTitle(client, 42, "수정");
  assert.equal(client.calls.filter(([kind]) => kind === "from").length, 2);
  assert.equal(client.calls.find(([kind]) => kind === "rpc")[2].p_option, "최신 옵션");
});

test("중복 상품명 오류를 표시하고 저장 요청은 반복하지 않는다", async () => {
  const client = mockClient({ result: { error: { message: "같은 제목의 상품이 이미 존재합니다." } } });
  await assert.rejects(updateAdminProductTitle(client, 42, "중복 제목"), /이미 존재/);
  assert.equal(client.calls.filter(([kind]) => kind === "rpc").length, 1);
});

test("성공 응답이 없으면 저장 완료로 처리하지 않는다", async () => {
  const client = mockClient({ result: { data: null } });
  await assert.rejects(updateAdminProductTitle(client, 42, "수정"), /저장을 확인하지 못했습니다/);
});
