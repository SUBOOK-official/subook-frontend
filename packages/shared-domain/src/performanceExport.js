import { mergePerformanceDaily, metricChange, previousPerformanceRange } from "./performanceMetrics.js";

export const PERFORMANCE_DAILY_COLUMNS = [
  ["spend", "마케팅비 (Meta)", "money"], ["grossRevenue", "매출", "money"], ["netRevenue", "순매출", "money"], ["orders", "주문수", "count"],
  ["soldQuantity", "판매수량", "count"], ["aov", "AOV", "money"], ["visitors", "방문자", "count"],
  ["repeatOrders", "재구매 주문", "count"], ["repeatOrderRate", "재구매 주문 비율", "percent"],
  ["averageCommissionRate", "평균 수수료율", "percent"],
  ["cvr", "구매전환율", "percent"], ["cpa", "광고 CPA", "money"], ["roas", "광고 ROAS", "percent"],
];
export const PERFORMANCE_COMMISSION_LABELS = { settled: "저장된 정산", jeonil: "전일학원", pickup: "수거 정책 기준", direct_purchase: "자체매입 · 수수료 대상 아님", unknown: "요율 미확인 · 평균 제외" };

const metrics = [
  ["db", "grossRevenue", "매출", "원"], ["db", "netRevenue", "순매출", "원"],
  ["db", "orders", "주문수", "건"], ["db", "soldQuantity", "판매 상품 수량", "권"],
  ["db", "aov", "AOV", "원"], ["db", "buyers", "구매자수", "명"],
  ["db", "repeatOrderRate", "재구매 주문 비율", "%"], ["ga", "visitors", "방문자", "명"],
  ["ga", "cvr", "구매전환율", "%"], ["ga", "cartRate", "조회 → 장바구니", "%"],
  ["ga", "checkoutAbandonment", "결제 이탈률", "%"], ["meta", "spend", "마케팅비 지출", "원"],
  ["meta", "cpa", "광고 CPA", "원"], ["meta", "roas", "광고 ROAS", "%"],
  ["db", "averageCommissionRate", "평균 수수료율", "%"],
  ["db", "refunds", "누적 환불", "원"], ["db", "repeatOrders", "재구매 주문", "건"],
  ["db", "commissionSales", "수수료 대상 상품금액", "원"], ["db", "commissionAmount", "수수료", "원"],
  ["db", "commissionExcludedQuantity", "수수료 평균 제외 수량", "권"],
  ["meta", "purchases", "Meta 기여 구매", "건"], ["meta", "revenue", "Meta 기여 매출", "원"],
  ["meta", "clicks", "Meta 클릭수", "회"], ["db", "attributedOrders", "출처 기록 주문", "건"],
  ["db", "metaOrders", "DB 확인 Meta 유입 구매", "건"], ["db", "metaRevenue", "DB 확인 Meta 유입 순매출", "원"],
];
const sourceLabels = { db: "주문 DB", ga: "GA4", meta: "Meta 광고" };
const text = (key, header, width = 24) => ({ key, header, width });
const number = (key, header) => ({ key, header, type: Number, format: "#,##0.##", width: 22 });
const statusLabel = (source) => source?.status === "ready" ? "정상" : source?.status === "not_configured" ? "연동 필요" : "조회 실패";
const sameRange = (value, range) => value?.from === range.from && value?.to === range.to;
const kst = (value) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";

export function buildPerformanceWorkbook({ range, sales, providers, drill = { level: "campaign" }, providerError = "", now = new Date() }) {
  if (!sameRange(sales, range) || !sales.current) throw new Error("조회 기간의 실적을 불러온 뒤 다시 다운로드해 주세요.");
  const comparison = previousPerformanceRange(range);
  const ga = sameRange(providers, range) ? providers.ga : null;
  const meta = sameRange(providers, range) ? providers.meta : null;
  const sources = { db: sales, ga: ga?.status === "ready" ? ga : null, meta: meta?.status === "ready" ? meta : null };
  const level = { campaign: "캠페인", adset: "광고세트", ad: "광고" }[drill.level] ?? "캠페인";
  const summary = metrics.map(([source, key, label, unit]) => {
    const value = (period) => source === "db" && ["metaOrders", "metaRevenue"].includes(key) && !sources.db[period]?.attributedOrders
      ? null : sources[source]?.[period]?.[key] ?? null;
    const current = value("current"), previous = value("previous");
    const change = metricChange(current, previous, unit === "%");
    return { label, source: sourceLabels[source], unit, current, previous, change: change?.value ?? null, changeUnit: change?.unit ?? "", state: current == null ? "미집계 / 분모 없음 / 조회 불가" : "집계됨" };
  });
  const funnels = ["current", "previous"].flatMap((period) => [
    ["cartFunnel", "상품조회 → 장바구니"], ["checkoutFunnel", "결제 시작 → 구매 이벤트"],
  ].map(([key, label]) => {
    const funnel = sources.ga?.[period]?.[key];
    return { period: period === "current" ? "선택 기간" : "직전 기간", label,
      entered: funnel?.entered ?? null, completed: funnel?.completed ?? null, rate: funnel?.rate ?? null,
      state: !funnel ? "조회 불가" : funnel.sampled ? "표본 데이터" : "집계됨" };
  }));
  const notes = [
    ["조회 기간 (한국시간)", `${range.from} ~ ${range.to}`], ["비교 기간", `${comparison.from} ~ ${comparison.to}`],
    ["내보낸 시각 (한국시간)", kst(now)], ["주문 실적 조회 시각", kst(sales.updatedAt)],
    ["GA4 상태", statusLabel(ga)], ["GA4 안내", ga?.message ?? providerError], ["GA4 조회 시각", kst(ga?.updatedAt)],
    ["GA4 퍼널 상태", ga?.funnelStatus === "error" ? "일부 조회 실패" : sources.ga ? "응답 내 구매 흐름 참조" : "조회 불가"],
    ["GA4 보고서 제한", ga?.thresholded ? "기준점 또는 보고서 제한 적용" : ""],
    ["Meta 상태", statusLabel(meta)], ["Meta 안내", meta?.message ?? providerError], ["Meta 조회 시각", kst(meta?.updatedAt)],
    ["Meta 계정", meta?.account ? `${meta.account.name} (${meta.account.id})` : ""],
    ["광고 상세 조회 범위", [level, drill.campaignName, drill.adsetName].filter(Boolean).join(" / ")],
    ["선택 캠페인 ID", drill.campaignId ?? ""], ["선택 광고세트 ID", drill.adsetId ?? ""],
    ["광고 상세 상태", !sources.meta ? "조회 불가" : meta.breakdownStatus === "error" ? "조회 실패" : "정상"],
    ["빈칸과 0", "빈칸은 미집계·조회 불가·분모 없음입니다. 실제 0은 숫자 0으로 기록합니다."],
    ["숫자 단위", "금액은 원, 비율은 0~100 기준 % 숫자(ROAS는 100 초과 가능)입니다. 증감 단위 %p는 비율 차이입니다."],
    ["매출·순매출", "한국시간 결제일 기준. 할인·포인트 후 실결제액에 배송비 포함. 순매출은 해당 결제분의 현재 누적 환불 차감으로 과거 수치도 변할 수 있습니다."],
    ["주문·수량·AOV", "미입금 제외. 주문·구매자수는 환불 주문 포함, 판매수량은 환불 수량 제외. AOV = 환불 전 매출 / 결제 주문수."],
    ["구매자·재구매", "회원 계정·비회원 연락처별로 식별하며 둘을 합치지 않습니다. 재구매는 현재 DB 전체 결제 이력의 두 번째 이후 주문 비율이며 구사이트 이력은 제외합니다."],
    ["수수료", "수수료 / 대상 상품금액의 가중 평균. 환불·배송비·박스비 제외, 쿠폰·포인트 차감 전 상품금액. 저장된 정산 우선, 미정산은 수거 당시 정책, 전일학원 50%. 자체매입·요율 미확인은 평균 제외. 예상액 포함으로 지급 완료율·순이익률과 다릅니다."],
    ["GA4 구매 흐름", "순서대로 행동한 사용자 기준. 세션을 넘는 행동 포함 가능. 무통장 구매 이벤트는 입금 전 발생하므로 결제 이탈률은 실제 입금 실패율과 다릅니다. 처리 지연·차단·동의 설정 영향이 있습니다."],
    ["Meta 광고", "연동 계정의 광고비만 집계. Meta 기여 설정·전환 발생일 기준, 최대 15분 캐시. 요약은 전체 계정이며 광고 상세는 선택한 범위입니다."],
    ["DB 확인 Meta 유입", "최종 유입의 유료 매체·Meta 출처가 확인된 주문만 집계. 출처 보존은 2026-09-12부터이며 여러 Meta 계정 유입이 포함될 수 있어 광고 플랫폼 성과와 다릅니다."],
    ["일별 상세·비교", "조회 기간 전체를 포함합니다. 방문자·구매자·비율의 기간 합계는 일별 합이나 평균과 다릅니다. 직전 동일 길이 기간과 비교하며 오늘은 집계 중입니다."],
    ["결제 시각 없어 제외한 기록", sales.unverifiedPayments ?? 0], ["결제 기록이 있는 취소 상태 주문", sales.current.cancelledPaidOrders ?? 0],
  ].map(([label, value]) => ({ label, value }));
  return {
    fileName: `subook-performance-${range.from}_${range.to}.xlsx`,
    sheets: [
      { sheetName: "성과 요약", rows: summary, columns: [text("label", "지표", 30), text("source", "출처", 16), text("unit", "단위", 10), number("current", `선택 ${range.from} ~ ${range.to}`), number("previous", `직전 ${comparison.from} ~ ${comparison.to}`), number("change", "직전 대비 증감"), text("changeUnit", "증감 단위", 12), text("state", "데이터 상태", 30)] },
      { sheetName: "일별 상세", rows: mergePerformanceDaily(sales.daily, ga, meta), columns: [text("date", "날짜", 14), ...PERFORMANCE_DAILY_COLUMNS.map(([key, label, format]) => number(key, `${label}${format === "money" ? " (원)" : format === "percent" ? " (%)" : ""}`))] },
      { sheetName: "수수료 산출", rows: (sales.commissionBreakdown ?? []).map((row) => ({ ...row, label: PERFORMANCE_COMMISSION_LABELS[row.basis] ?? row.basis })), columns: [text("label", "적용 기준", 36), number("feePercent", "수수료율 (%)"), number("quantity", "수량 (권)"), number("saleAmount", "상품금액 (원)"), number("feeAmount", "수수료 (원)")] },
      { sheetName: "구매 흐름", rows: funnels, columns: [text("period", "기간", 14), text("label", "구매 흐름", 32), number("entered", "진입 사용자 (명)"), number("completed", "완료 사용자 (명)"), number("rate", "전환율 (%)"), text("state", "데이터 상태")] },
      { sheetName: "Meta 광고", rows: sources.meta && meta.breakdownStatus !== "error" ? meta.breakdown ?? [] : [], columns: [text("id", `${level} ID`), text("name", level, 45), ...[["spend", "광고비 (원)"], ["purchases", "기여 구매 (건)"], ["revenue", "기여 매출 (원)"], ["cpa", "CPA (원)"], ["roas", "ROAS (%)"], ["impressions", "노출"], ["clicks", "클릭"], ["ctr", "CTR (%)"], ["cpc", "CPC (원)"]].map(([key, label]) => number(key, label))] },
      { sheetName: "집계 기준", rows: notes, columns: [text("label", "항목", 30), { ...text("value", "내용", 100), wrap: true }] },
    ],
  };
}
