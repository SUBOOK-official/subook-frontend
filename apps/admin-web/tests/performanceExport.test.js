import test from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import { buildPerformanceWorkbook } from "../../../packages/shared-domain/src/performanceExport.js";
import { buildWorkbookData } from "../src/lib/excelFile.js";

const range = { from: "2026-08-01", to: "2026-09-09" };
function fixture() {
  return { range, sales: { ...range, current: { grossRevenue: 10000, orders: 0, repeatOrderRate: 25, attributedOrders: 0 }, previous: { grossRevenue: 8000, repeatOrderRate: 20 },
    daily: Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10), grossRevenue: i * 100 })),
    commissionBreakdown: [{ basis: "unknown", feePercent: null, quantity: 1, saleAmount: 5000, feeAmount: null }] },
  providers: { ...range, ga: { status: "ready", current: { visitors: 0, cartFunnel: { entered: 10, completed: 2, rate: 20, sampled: true } }, previous: {}, daily: [] },
    meta: { status: "ready", current: { spend: 0, roas: null }, previous: {}, breakdownStatus: "ready", breakdown: [{ id: "1234567890123456789", name: "=광고명", spend: 0, roas: 120.5 }] } },
  drill: { level: "ad", campaignName: "캠페인 A", campaignId: "100", adsetName: "세트 B", adsetId: "200" } };
}
const row = (sheet, label) => sheet.rows.find((item) => item.label === label);

test("현재 기간 전체 40일·직전 비교·현재 광고 단계와 수수료 제외 사유를 내보낸다", () => {
  const book = buildPerformanceWorkbook(fixture());
  assert.equal(book.sheets.length, 6);
  assert.equal(book.sheets[1].rows.length, 40);
  assert.equal(book.fileName, "subook-performance-2026-08-01_2026-09-09.xlsx");
  assert.equal(row(book.sheets[0], "매출").change, 25);
  assert.equal(row(book.sheets[0], "재구매 주문 비율").change, 5);
  assert.equal(row(book.sheets[0], "재구매 주문 비율").changeUnit, "%p");
  assert.equal(row(book.sheets[0], "DB 확인 Meta 유입 구매").current, null);
  assert.equal(book.sheets[2].rows[0].label, "요율 미확인 · 평균 제외");
  assert.equal(book.sheets[3].rows[0].state, "표본 데이터");
  assert.equal(book.sheets[4].columns[1].header, "광고");
  assert.equal(row(book.sheets[5], "광고 상세 조회 범위").value, "광고 / 캠페인 A / 세트 B");
});

test("실제 0과 미조회 지표를 구분하고 외부 조회 실패 상태를 기록한다", () => {
  const input = fixture();
  input.providers.ga.status = "error";
  input.providers.ga.message = "방문 조회 실패";
  input.providers.meta.breakdownStatus = "error";
  const { sheets } = buildPerformanceWorkbook(input);
  assert.equal(row(sheets[0], "주문수").current, 0);
  assert.equal(row(sheets[0], "방문자").current, null);
  assert.equal(row(sheets[0], "마케팅비 지출").current, 0);
  assert.equal(sheets[1].rows[0].visitors, null);
  assert.equal(sheets[4].rows.length, 0);
  assert.equal(row(sheets[5], "GA4 안내").value, "방문 조회 실패");
  assert.equal(row(sheets[5], "광고 상세 상태").value, "조회 실패");
});

test("다른 기간 실적은 거부하고 다른 기간의 광고·방문은 섞지 않는다", () => {
  const input = fixture();
  assert.throws(() => buildPerformanceWorkbook({ ...input, range: { ...range, to: "2026-09-10" } }), /조회 기간/);
  input.providers.from = "2026-08-02";
  const { sheets } = buildPerformanceWorkbook(input);
  assert.equal(row(sheets[0], "방문자").current, null);
  assert.equal(sheets[4].rows.length, 0);
});

test("외부 연결이 없어도 주문 실적을 내려받고 오류 원인을 함께 기록한다", () => {
  const { sheets } = buildPerformanceWorkbook({ ...fixture(), providers: null, providerError: "연결 시간 초과" });
  assert.equal(row(sheets[0], "매출").current, 10000);
  assert.equal(row(sheets[5], "Meta 안내").value, "연결 시간 초과");
});

test("실제 XLSX에 6개 시트·숫자 셀·빈칸·텍스트 광고 ID·고정 헤더를 보존한다", async () => {
  const { sheets } = buildPerformanceWorkbook(fixture());
  const data = buildWorkbookData(sheets);
  assert.equal(data[0][3][3].value, 0);
  const buffer = await writeXlsxFile(data, {
    sheets: sheets.map((sheet) => sheet.sheetName),
    columns: sheets.map((sheet) => sheet.columns.map((column) => ({ width: column.width }))),
    stickyRowsCount: 1, buffer: true,
  });
  const zip = unzipSync(new Uint8Array(buffer));
  const xml = (path) => strFromU8(zip[path]);
  assert.equal((xml("xl/workbook.xml").match(/<sheet /g) ?? []).length, 6);
  assert.match(xml("xl/worksheets/sheet1.xml"), /<v>10000<\/v>/);
  assert.match(xml("xl/worksheets/sheet1.xml"), /ySplit="1"/);
  assert.match(xml("xl/sharedStrings.xml"), /1234567890123456789/);
  assert.match(xml("xl/sharedStrings.xml"), /=광고명/);
  assert.doesNotMatch(xml("xl/worksheets/sheet5.xml"), /<f[ >]/);
});
