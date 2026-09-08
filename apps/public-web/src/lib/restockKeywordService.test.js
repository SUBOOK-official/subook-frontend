import test from "node:test";
import assert from "node:assert/strict";
import { createRestockKeywordService, normalizeRestockKeyword, validateRestockKeyword } from "./restockKeywordService.js";

function mockService(results) {
  const calls = [];
  const client = { rpc(name, args) {
    calls.push({ name, args });
    return { abortSignal() { return Promise.resolve(results.shift()); } };
  } };
  return { service: createRestockKeywordService(client), calls };
}

test("키워드 중복은 대소문자·연속 공백을 정규화하고 최대 개수보다 먼저 안내한다", () => {
  assert.equal(normalizeRestockKeyword("  FLOW   수학  "), "flow 수학");
  const rows = Array.from({ length: 20 }, (_, i) => ({ keyword: i ? `교재 ${i}` : "FLOW 수학" }));
  assert.match(validateRestockKeyword("flow   수학", rows), /이미/);
  assert.match(validateRestockKeyword("새 교재", rows), /최대 20개/);
  assert.match(validateRestockKeyword("가", []), /2~40자/);
  assert.match(validateRestockKeyword("가".repeat(41), []), /2~40자/);
  assert.equal(validateRestockKeyword("가".repeat(40), []), "");
});

test("본인 목록 조회는 사용자 ID를 받지 않으며 일시적 서버 실패만 한 번 재시도한다", async () => {
  const rows = [{ id: 1, keyword: "브릿지" }];
  const { service, calls } = mockService([{ status: 503, error: {} }, { data: rows }]);
  assert.deepEqual(await service.list(), { keywords: rows, error: "" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { name: "list_my_restock_keywords", args: undefined });
});

test("목록 권한 오류·비정상 응답은 빈 구독 목록으로 성공 처리하지 않는다", async () => {
  const { service, calls } = mockService([{ status: 401, error: {} }, { data: null }]);
  assert.ok((await service.list()).error);
  assert.equal(calls.length, 1);
  assert.ok((await service.list()).error);
});

test("등록은 서버 ID를 사용하며 실패한 변경 요청을 자동 재시도하지 않는다", async () => {
  const { service, calls } = mockService([{ data: { success: true, id: 42, keyword: "브릿지" } }, { status: 503, error: {} }]);
  assert.deepEqual(await service.subscribe(" 브릿지 "), { success: true, id: 42, keyword: "브릿지" });
  assert.deepEqual(calls[0].args, { p_keyword: "브릿지" });
  assert.equal((await service.subscribe("다른 교재")).success, false);
  assert.equal(calls.length, 2);
});

test("해지는 선택한 구독 ID만 보내며 이미 해지된 항목도 성공으로 처리한다", async () => {
  const { service, calls } = mockService([{ data: { success: true, deleted: false } }, { error: {} }]);
  assert.deepEqual(await service.unsubscribe(42), { success: true });
  assert.deepEqual(calls[0], { name: "unsubscribe_restock_keyword", args: { p_id: 42 } });
  assert.equal((await service.unsubscribe(43)).success, false);
});

test("멈춘 조회를 타임아웃으로 종료하고 재시도 후 오류를 반환한다", async () => {
  let attempts = 0;
  const service = createRestockKeywordService({ rpc() {
    attempts += 1;
    return { abortSignal(signal) { return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ error: {} }), { once: true })); } };
  } }, { timeoutMs: 5 });
  assert.ok((await service.list()).error);
  assert.equal(attempts, 2);
});
