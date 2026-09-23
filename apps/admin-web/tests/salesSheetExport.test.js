import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import vm from "node:vm";

// 브라우저 전용 의존성만 대체하고 실제 다운로드 진입점에서 생성되는 행을 검사한다.
const source = (await readFile(new URL("../src/lib/salesSheetExport.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export async function", "async function");

function setup(items, lookup) {
  let exported;
  const batches = [];
  const context = vm.createContext({
    AbortSignal,
    orderStatusLabel: { paid: "결제완료" },
    exportRowsToXlsx: async (value) => { exported = value; },
    supabase: {
      rpc: async () => ({ data: { items: [{
        status: "paid", created_at: "2026-09-01T00:00:00Z", buyer_name: "구매자",
        items,
      }] } }),
      from: (table) => {
        assert.equal(table, "books");
        return { select: (columns) => {
          assert.equal(columns, "id,shipments(seller_name)");
          return { in: (column, ids) => {
            assert.equal(column, "id");
            batches.push(Array.from(ids));
            return { abortSignal: async () => lookup(ids) };
          } };
        } };
      },
    },
  });
  vm.runInContext(source, context);
  return { run: () => context.downloadSalesSheetXlsx(), batches, exported: () => exported };
}

test("품목별 수거신청자명을 기록하고 구매자명·자체판매와 혼동하지 않는다", async () => {
  const fixture = setup([
    { book_id: 1 }, { book_id: "2" }, { book_id: 1 }, { book_id: 3 }, { book_id: null, is_direct_sale: true },
  ], () => ({ data: [
    { id: 2, shipments: { seller_name: "비회원 판매자" } },
    { id: 1, shipments: { seller_name: "회원 판매자" } },
    { id: 3, shipments: null },
  ] }));
  await fixture.run();
  assert.deepEqual(Array.from(fixture.exported().rows, (row) => row["정산자명"]),
    ["회원 판매자", "비회원 판매자", "회원 판매자", "", ""]);
  assert.deepEqual(fixture.batches, [[1, "2", 3]]);
  assert.equal(fixture.exported().rows[0]["주문자명"], "구매자");
});

test("대량 품목은 나눠 조회하고 마지막 배치까지 이름을 채운다", async () => {
  const fixture = setup(Array.from({ length: 401 }, (_, i) => ({ book_id: i + 1 })),
    (ids) => ({ data: ids.map((id) => ({ id, shipments: { seller_name: `판매자${id}` } })) }));
  await fixture.run();
  assert.deepEqual(fixture.batches.map((batch) => batch.length), [200, 200, 1]);
  assert.equal(fixture.exported().rows[400]["정산자명"], "판매자401");
});

test("판매자 조회 실패는 재시도 후 다운로드를 중단한다", async () => {
  const fixture = setup([{ book_id: 1 }], () => ({ error: { message: "조회 실패" } }));
  await assert.rejects(fixture.run, /정산자명을 불러오지 못했습니다/);
  assert.equal(fixture.batches.length, 2);
  assert.equal(fixture.exported(), undefined);
});

test("일시적 조회 실패 후 재시도 성공 시 이름을 채운다", async () => {
  let attempts = 0;
  const fixture = setup([{ book_id: 1 }], () => ++attempts === 1
    ? { error: { message: "일시적 오류" } }
    : { data: [{ id: 1, shipments: { seller_name: "판매자" } }] });
  await fixture.run();
  assert.equal(fixture.exported().rows[0]["정산자명"], "판매자");
});
